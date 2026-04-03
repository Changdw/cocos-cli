'use strict';

import { join, dirname, basename, extname, sep, normalize, delimiter } from 'path';

import { PNG } from 'pngjs';
import TGA from 'tga-js';
import { readFile, ensureDirSync, remove, writeFile } from 'fs-extra';
import PSD from 'psd.js';
import Sharp from 'sharp';
import { GlobalPaths } from '../../../../../global';
import utils from '../../../../base/utils';
import { resolveCmftTool } from '../utils/cmft';
import { resolveExecutable } from '../utils/tool-resolver';

export interface ICmftConvertResult {
    extName: string;
    source: string;
    isRGBE: boolean;
}

interface IHDRImageData {
    width: number;
    height: number;
    data: Buffer;
}

const PNG_RGBE_BASE = 1.1;

export async function convertTGA(data: Buffer): Promise<{ extName: string; data: Buffer }> {
    const tga = new TGA();
    tga.load(data);
    const imageData = tga.getImageData();
    const png = new PNG({ width: imageData.width, height: imageData.height });
    png.data = Buffer.from(imageData.data);
    return await savePNGObject(png);
}

export async function convertImageToHDR(file: string, uuid: string, temp: string) {
    const output = join(temp, uuid + '.hdr');
    ensureDirSync(dirname(output));

    const bundledTool = process.platform === 'win32'
        ? join(GlobalPaths.staticDir, 'tools/mali_win32/convert.exe')
        : process.platform === 'darwin'
            ? join(GlobalPaths.staticDir, 'tools/mali_darwin/convert')
            : join(GlobalPaths.staticDir, 'tools/mali_linux/convert');
    const convertTool = resolveExecutable({
        fileCandidates: [bundledTool],
    });

    if (!convertTool) {
        throw new Error(
            process.platform === 'linux'
                ? 'Unable to locate the Linux convert tool. Place the binary at `static/tools/mali_linux/convert`.'
                : 'Unable to locate ImageMagick convert tool.',
        );
    }

    const toolDir = dirname(convertTool);
    const env = Object.assign({}, process.env);
    env.PATH = env.PATH ? `${toolDir}${delimiter}${env.PATH}` : toolDir;
    await utils.Process.quickSpawn('.' + sep + basename(convertTool), [normalize(file), normalize(output)], {
        cwd: toolDir,
        env,
    });

    return {
        extName: '.hdr',
        source: output,
    };
}

export async function convertPSD(data: Buffer): Promise<{ extName: string; data: Buffer }> {
    const psd = new PSD(data);
    psd.parse();
    const png = psd.image.toPng();
    return savePNGObject(png);
}

export async function convertTIFF(file: string) {
    return new Promise<{ extName: string; data: Buffer }>((resolve, reject) => {
        Sharp(file)
            .png()
            .toBuffer()
            .then((data: Buffer) => {
                resolve({
                    extName: '.png',
                    data,
                });
            })
            .catch((err) => reject(err));
    });
}

async function savePNGObject(png: PNG) {
    return new Promise<{ extName: string; data: Buffer }>((resolve, reject) => {
        const buffer: Buffer[] = [];
        png.on('data', (data: Buffer) => {
            buffer.push(data);
        });
        png.on('end', () => {
            resolve({
                extName: '.png',
                data: Buffer.concat(buffer as Uint8Array[]),
            });
        });
        png.on('error', (err) => {
            reject(err);
        });
        png.pack();
    });
}

function readHDRLine(data: Buffer, offset: number) {
    const end = data.indexOf(0x0a, offset);
    if (end < 0) {
        throw new Error('Unexpected end of HDR file.');
    }

    let line = data.toString('ascii', offset, end);
    if (line.endsWith('\r')) {
        line = line.slice(0, -1);
    }

    return {
        line,
        offset: end + 1,
    };
}

function decodeOldHDRPixels(data: Buffer, offset: number, width: number, height: number, firstPixel?: number[]): IHDRImageData {
    const pixelCount = width * height;
    const output = Buffer.alloc(pixelCount * 4);
    let writeOffset = 0;
    let shift = 0;
    let pendingPixel = firstPixel;

    while (writeOffset < output.length) {
        let pixel: number[];
        if (pendingPixel) {
            pixel = pendingPixel;
            pendingPixel = undefined;
        } else {
            if (offset + 4 > data.length) {
                throw new Error('Unexpected end of HDR scanline data.');
            }
            pixel = [data[offset++], data[offset++], data[offset++], data[offset++]];
        }

        if (pixel[0] === 1 && pixel[1] === 1 && pixel[2] === 1) {
            if (writeOffset === 0) {
                throw new Error('Invalid HDR repeat marker.');
            }

            const repeat = pixel[3] << shift;
            shift += 8;
            const prevOffset = writeOffset - 4;
            for (let index = 0; index < repeat; index++) {
                output.copy(output, writeOffset, prevOffset, prevOffset + 4);
                writeOffset += 4;
                if (writeOffset > output.length) {
                    throw new Error('HDR repeat marker exceeds image size.');
                }
            }
            continue;
        }

        shift = 0;
        output[writeOffset++] = pixel[0];
        output[writeOffset++] = pixel[1];
        output[writeOffset++] = pixel[2];
        output[writeOffset++] = pixel[3];
    }

    return {
        width,
        height,
        data: output,
    };
}

function parseRGBEHDR(data: Buffer): IHDRImageData {
    let cursor = 0;
    let lineData = readHDRLine(data, cursor);
    cursor = lineData.offset;

    if (!lineData.line.startsWith('#?')) {
        throw new Error('Invalid HDR signature.');
    }

    let hasFormat = false;
    while (true) {
        lineData = readHDRLine(data, cursor);
        cursor = lineData.offset;
        if (!lineData.line) {
            break;
        }
        if (lineData.line === 'FORMAT=32-bit_rle_rgbe') {
            hasFormat = true;
        }
    }

    if (!hasFormat) {
        throw new Error('Unsupported HDR format.');
    }

    lineData = readHDRLine(data, cursor);
    cursor = lineData.offset;

    const resolution = /^-Y\s+(\d+)\s+\+X\s+(\d+)$/.exec(lineData.line);
    if (!resolution) {
        throw new Error(`Unsupported HDR resolution line: ${lineData.line}`);
    }

    const height = Number(resolution[1]);
    const width = Number(resolution[2]);

    if (width < 8 || width > 0x7fff) {
        return decodeOldHDRPixels(data, cursor, width, height);
    }

    const output = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y++) {
        if (cursor + 4 > data.length) {
            throw new Error('Unexpected end of HDR scanline header.');
        }

        const header = [data[cursor++], data[cursor++], data[cursor++], data[cursor++]];
        if (header[0] !== 2 || header[1] !== 2 || (header[2] & 0x80) !== 0) {
            if (y !== 0) {
                throw new Error('Mixed HDR scanline encodings are not supported.');
            }
            return decodeOldHDRPixels(data, cursor, width, height, header);
        }

        const scanlineWidth = (header[2] << 8) | header[3];
        if (scanlineWidth !== width) {
            throw new Error(`Invalid HDR scanline width ${scanlineWidth}, expected ${width}.`);
        }

        const scanline = [Buffer.alloc(width), Buffer.alloc(width), Buffer.alloc(width), Buffer.alloc(width)];
        for (let channel = 0; channel < 4; channel++) {
            let x = 0;
            while (x < width) {
                if (cursor >= data.length) {
                    throw new Error('Unexpected end of HDR RLE data.');
                }

                const count = data[cursor++];
                if (count > 128) {
                    const runLength = count - 128;
                    if (runLength === 0 || x + runLength > width || cursor >= data.length) {
                        throw new Error('Unexpected end of HDR RLE run.');
                    }
                    const value = data[cursor++];
                    scanline[channel].fill(value, x, x + runLength);
                    x += runLength;
                    continue;
                }

                if (count === 0 || x + count > width || cursor + count > data.length) {
                    throw new Error('Invalid HDR literal run.');
                }

                data.copy(scanline[channel], x, cursor, cursor + count);
                cursor += count;
                x += count;
            }
        }

        for (let x = 0; x < width; x++) {
            const outputOffset = (y * width + x) * 4;
            output[outputOffset + 0] = scanline[0][x];
            output[outputOffset + 1] = scanline[1][x];
            output[outputOffset + 2] = scanline[2][x];
            output[outputOffset + 3] = scanline[3][x];
        }
    }

    return {
        width,
        height,
        data: output,
    };
}

export async function convertRGBEHDR(data: Buffer): Promise<{ extName: string; data: Buffer }> {
    const imageData = parseRGBEHDR(data);
    const encoded = Buffer.alloc(imageData.data.length);

    for (let index = 0; index < imageData.data.length; index += 4) {
        const exponent = imageData.data[index + 3];
        if (!exponent) {
            continue;
        }

        const scale = Math.pow(2, exponent - 136);
        writeRGBEToPNG(
            imageData.data[index + 0] * scale,
            imageData.data[index + 1] * scale,
            imageData.data[index + 2] * scale,
            encoded,
            index,
        );
    }

    const png = new PNG({ width: imageData.width, height: imageData.height });
    png.data = encoded;
    return await savePNGObject(png);
}

function writeRGBEToPNG(r: number, g: number, b: number, output: Buffer, offset: number) {
    const maxValue = Math.max(r, g, b);
    if (maxValue <= 0) {
        output[offset + 0] = 0;
        output[offset + 1] = 0;
        output[offset + 2] = 0;
        output[offset + 3] = 0;
        return;
    }

    const exponent = Math.ceil(Math.log(maxValue) / Math.log(PNG_RGBE_BASE));
    const storedExponent = Math.min(Math.max(exponent + 128, 0), 255);
    const scale = Math.pow(PNG_RGBE_BASE, storedExponent - 128);

    output[offset + 0] = Math.min(255, Math.max(0, Math.floor((r / scale) * 255)));
    output[offset + 1] = Math.min(255, Math.max(0, Math.floor((g / scale) * 255)));
    output[offset + 2] = Math.min(255, Math.max(0, Math.floor((b / scale) * 255)));
    output[offset + 3] = storedExponent;
}

export async function convertHDROrEXR(extName: string, source: string, uuid: string, temp: string) {
    console.debug(`Start to convert asset {asset[${uuid}](${uuid})}`);
    const dist = join(temp, uuid);
    ensureDirSync(temp);
    if (extName === '.hdr') {
        return await convertWithCmft(source, dist);
    } else if (extName === '.exr') {
        try {
            return await convertWithCmft(source, dist, '_withexr');
        } catch (error) {
            const res = await convertImageToHDR(source, uuid, temp);
            return await convertWithCmft(res.source, dist);
        }
    }
}

export async function convertHDR(source: string, uuid: string, temp: string) {
    console.debug(`Start to convert asset {asset[${uuid}](${uuid})}`);
    const dist = join(temp, uuid);
    ensureDirSync(temp);
    return await convertWithCmft(source, dist);
}

export async function convertWithCmft(file: string, dist: string, version = ''): Promise<ICmftConvertResult> {
    const tools = resolveCmftTool(version);
    const pngOutput = dist + '.png';

    if (process.platform === 'linux') {
        const hdrOutput = dist + '.hdr';
        await utils.Process.quickSpawn(tools, [
            '--bypassoutputtype',
            '--output0params',
            'hdr,rgbe,latlong',
            '--input',
            file,
            '--output0',
            dist,
        ]);
        try {
            const converted = await convertRGBEHDR(await readFile(hdrOutput));
            await writeFile(pngOutput, converted.data);
        } finally {
            await remove(hdrOutput);
        }
    } else {
        await utils.Process.quickSpawn(tools, [
            '--bypassoutputtype',
            '--output0params',
            'png,rgbm,latlong',
            '--input',
            file,
            '--output0',
            dist,
        ]);
    }

    console.debug(`Convert asset${file} -> PNG success.`);
    return {
        extName: '.png',
        source: pngOutput,
        isRGBE: true,
    };
}

export async function checkImageTypeByData(file: string) {
    const data = await readFile(file);
    const ext = extname(file).toLowerCase();
    let extName = ext;

    if (['.tga'].includes(ext)) {
        extName = '.tga';
    } else if (['.psd'].includes(ext)) {
        extName = '.psd';
    } else if (['.hdr'].includes(ext)) {
        extName = '.hdr';
    } else if (['.exr'].includes(ext)) {
        extName = '.exr';
    } else if (['.tif', '.tiff'].includes(ext)) {
        extName = '.tif';
    }

    return {
        extName,
        data,
    };
}
