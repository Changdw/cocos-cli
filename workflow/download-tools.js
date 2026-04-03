const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');

const tools = {
    win32: [
        {
            url: 'http://download.cocos.com/CocosSDK/tools/unzip.exe',
            dist: 'unzip.exe',
            fileName: 'unzip.exe',
            outputs: ['unzip.exe'],
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/PVRTexToolCLI_win32_20251028.zip',
            dist: 'PVRTexTool_win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/mali_win32.zip',
            dist: 'mali_win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/libwebp_win32.zip',
            dist: 'libwebp_win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/openSSLWin64.zip',
            dist: 'openSSLWin64',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/Python27-win32.zip',
            dist: 'Python27-win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/astcenc/astcenc-win32-5.2.0-250220.zip',
            dist: 'astc-encoder',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/xiaomi-pack-tools-win32-202404.zip',
            dist: 'xiaomi-pack-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/lightmap-tools-win32-230525.zip',
            dist: 'lightmap-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/uvunwrap_win32_221025.zip',
            dist: 'LightFX',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmft_win32_x64-20230323.zip',
            dist: 'cmft',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmake-3.24.3-windows-x86_64.zip',
            dist: 'cmake',
        },
    ],
    darwin: [
        {
            url: 'http://download.cocos.com/CocosSDK/tools/PVRTexToolCLI_darwin_20251028.zip',
            dist: 'PVRTexTool_darwin',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/mali_darwin.zip',
            dist: 'mali_darwin',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/libwebp-1.4.0-mac-universal.zip',
            dist: 'libwebp_darwin',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/astcenc/astcenc-darwin-5.2.0-250220.zip',
            dist: 'astc-encoder',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/xiaomi-pack-tools-darwin-202404.zip',
            dist: 'xiaomi-pack-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/lightmap-tools-darwin-20241217.zip',
            dist: 'lightmap-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/uvunwrap_darwin_20241217.zip',
            dist: 'LightFX',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmft-darwin-20231124.zip',
            dist: 'cmft',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmake-3.24.3-macos-universal.zip',
            dist: 'cmake',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/process-info-20231116-darwin.zip',
            dist: 'process-info',
        },
    ],
    linux: [
        {
            url: 'https://github.com/dariomanesku/cmft-bin/raw/master/cmft_lin64.zip',
            dist: 'cmft',
            outputs: ['linux/cmftRelease64'],
            moves: [
                { from: 'cmft', to: 'linux/cmftRelease64' },
            ],
            executables: ['linux/cmftRelease64'],
        },
        {
            url: 'https://github.com/facebookincubator/FBX2glTF/releases/download/v0.9.7/FBX2glTF-linux-x64',
            dist: 'FBX2glTF',
            fileName: 'FBX2glTF',
            outputs: ['FBX2glTF'],
            executables: ['FBX2glTF'],
        },
    ],
    common: [
        {
            url: 'http://download.cocos.com/CocosSDK/tools/quickgame-toolkit.zip',
            dist: 'quickgame-toolkit',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/huawei-rpk-tools.zip',
            dist: 'huawei-rpk-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/debug.keystore-201112.zip',
            dist: 'keystore',
        },
    ],
};

class ToolDownloader {
    constructor() {
        this.scriptDir = __dirname;
        this.projectRoot = path.dirname(this.scriptDir);
        this.toolsDir = path.join(this.projectRoot, 'static', 'tools');
        this.tempDir = path.join(this.projectRoot, '.temp');
        this.platform = process.platform;
    }

    resolveUnzipTool() {
        if (this.platform === 'win32') {
            return null;
        }

        const candidates = [
            path.join(this.toolsDir, 'unzip'),
            path.join(this.toolsDir, 'unzip', 'bin', 'unzip'),
            'unzip',
        ];

        for (const candidate of candidates) {
            try {
                if (candidate.includes(path.sep)) {
                    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                        return candidate;
                    }
                    continue;
                }

                execFileSync('which', [candidate], { stdio: 'pipe' });
                return candidate;
            } catch {
                continue;
            }
        }

        return null;
    }

    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Create directory: ${path.relative(this.projectRoot, dirPath)}`);
        }
    }

    async downloadFile(url, destPath, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await this._downloadFileSingle(url, destPath);
                return;
            } catch (error) {
                console.log(`\nRetry ${attempt}/${retries} failed: ${error.message}`);

                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }

                if (attempt === retries) {
                    throw error;
                }

                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async _downloadFileSingle(url, destPath) {
        return new Promise((resolve, reject) => {
            console.log(`Downloading: ${url}`);

            const protocol = url.startsWith('https:') ? https : http;
            const file = fs.createWriteStream(destPath);
            let downloadedSize = 0;
            let totalSize = 0;

            const request = protocol.get(url, (response) => {
                if (response.statusCode === 200) {
                    totalSize = parseInt(response.headers['content-length'], 10) || 0;

                    response.on('data', (chunk) => {
                        downloadedSize += chunk.length;
                        if (totalSize > 0) {
                            const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                            process.stdout.write(`\rDownloading: ${progress}% (${this.formatBytes(downloadedSize)}/${this.formatBytes(totalSize)})`);
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        console.log(`\nDownload complete: ${path.basename(destPath)}`);
                        resolve();
                    });
                } else if (response.statusCode === 302 || response.statusCode === 301) {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    this._downloadFileSingle(response.headers.location, destPath).then(resolve).catch(reject);
                } else if (response.statusCode === 404) {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    reject(new Error(`File not found (404): ${url}`));
                } else {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                }
            });

            request.on('error', (error) => {
                file.close();
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(error);
            });

            request.setTimeout(120000, () => {
                request.destroy();
                reject(new Error('Download timeout (120s)'));
            });
        });
    }

    extractFile(zipPath, extractDir) {
        console.log(`Extracting: ${path.basename(zipPath)}`);

        try {
            if (this.platform === 'win32') {
                execFileSync(
                    'powershell',
                    ['-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`],
                    { stdio: 'pipe', maxBuffer: 1024 * 1024 * 50 },
                );
            } else {
                const unzipTool = this.resolveUnzipTool();
                if (!unzipTool) {
                    throw new Error('Missing unzip command');
                }

                execFileSync(unzipTool, ['-o', zipPath, '-d', extractDir], {
                    stdio: 'pipe',
                    maxBuffer: 1024 * 1024 * 50,
                });
            }

            console.log(`Extract complete: ${path.basename(zipPath)}`);
        } catch (error) {
            throw new Error(`Extract failed: ${error.message}`);
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) {
            return '0 B';
        }

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }

    checkExtractTools() {
        try {
            if (this.platform === 'win32') {
                execFileSync('powershell', ['-Command', 'Get-Command Expand-Archive'], { stdio: 'pipe' });
                return true;
            }

            return Boolean(this.resolveUnzipTool());
        } catch {
            return false;
        }
    }

    isArchiveFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return ['.zip', '.tar', '.gz', '.7z', '.rar'].includes(ext);
    }

    getToolRoot(tool) {
        return path.join(this.toolsDir, tool.dist);
    }

    getExpectedOutputs(tool) {
        const toolRoot = this.getToolRoot(tool);
        if (Array.isArray(tool.outputs) && tool.outputs.length > 0) {
            return tool.outputs.map(output => path.join(toolRoot, output));
        }

        return [toolRoot];
    }

    isExecutable(filePath) {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return false;
        }

        if (this.platform === 'win32') {
            return true;
        }

        return Boolean(fs.statSync(filePath).mode & 0o111);
    }

    isToolInstalled(tool) {
        if (!this.getExpectedOutputs(tool).every(output => fs.existsSync(output))) {
            return false;
        }

        for (const executable of tool.executables || []) {
            if (!this.isExecutable(path.join(this.getToolRoot(tool), executable))) {
                return false;
            }
        }

        return true;
    }

    copyFile(sourcePath, targetDir, targetName) {
        const fileName = targetName || path.basename(sourcePath);
        const targetPath = path.join(targetDir, fileName);

        this.ensureDir(targetDir);
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`Copied: ${path.relative(this.projectRoot, targetPath)}`);
        return targetPath;
    }

    applyMoves(tool, targetDir) {
        for (const move of tool.moves || []) {
            const sourcePath = path.join(targetDir, move.from);
            const destPath = path.join(targetDir, move.to);

            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Expected extracted file is missing: ${path.relative(this.projectRoot, sourcePath)}`);
            }

            this.ensureDir(path.dirname(destPath));
            if (fs.existsSync(destPath)) {
                fs.rmSync(destPath, { recursive: true, force: true });
            }
            fs.renameSync(sourcePath, destPath);
            console.log(`Moved: ${path.relative(this.projectRoot, sourcePath)} -> ${path.relative(this.projectRoot, destPath)}`);
        }
    }

    ensureExecutables(tool, targetDir) {
        if (this.platform === 'win32') {
            return;
        }

        for (const executable of tool.executables || []) {
            const executablePath = path.join(targetDir, executable);
            if (!fs.existsSync(executablePath)) {
                throw new Error(`Executable is missing: ${path.relative(this.projectRoot, executablePath)}`);
            }

            const mode = fs.statSync(executablePath).mode;
            fs.chmodSync(executablePath, mode | 0o755);
            console.log(`chmod +x ${path.relative(this.projectRoot, executablePath)}`);
        }
    }

    getTempFileName(tool) {
        return path.basename(new URL(tool.url).pathname);
    }

    async processTool(tool, index, total) {
        const progress = `[${index + 1}/${total}]`;
        const targetDir = this.getToolRoot(tool);

        console.log(`\n${progress} Processing: ${tool.dist}`);

        try {
            if (this.isToolInstalled(tool)) {
                console.log(`Skip ${tool.dist} (already installed)`);
                return { success: true, skipped: true };
            }

            const tempFilePath = path.join(this.tempDir, this.getTempFileName(tool));
            await this.downloadFile(tool.url, tempFilePath);

            this.ensureDir(targetDir);

            if (this.isArchiveFile(tempFilePath)) {
                this.extractFile(tempFilePath, targetDir);
            } else {
                this.copyFile(tempFilePath, targetDir, tool.fileName);
            }

            this.applyMoves(tool, targetDir);
            this.ensureExecutables(tool, targetDir);

            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }

            console.log(`${tool.dist} is ready`);
            return { success: true, skipped: false };
        } catch (error) {
            console.error(`${tool.dist} failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    cleanupTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            return;
        }

        try {
            const files = fs.readdirSync(this.tempDir);
            if (files.length === 0) {
                fs.rmdirSync(this.tempDir);
                console.log('Cleaned temporary directory');
            } else {
                console.log(`Temporary directory still contains ${files.length} file(s)`);
            }
        } catch (error) {
            console.log(`Failed to clean temporary directory: ${error.message}`);
        }
    }

    async run() {
        console.log(`Current platform: ${this.platform}`);

        if (!this.checkExtractTools()) {
            console.error('Missing extract tool. Install unzip on Linux/macOS or make sure PowerShell is available on Windows.');
            process.exit(1);
        }

        this.ensureDir(this.tempDir);
        this.ensureDir(this.toolsDir);

        const platformTools = tools[this.platform] || [];
        const commonTools = tools.common || [];
        const allTools = [...platformTools, ...commonTools];

        console.log(`Need to process ${allTools.length} tool item(s)\n`);

        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        for (let i = 0; i < allTools.length; i++) {
            const result = await this.processTool(allTools[i], i, allTools.length);

            if (result.success) {
                if (result.skipped) {
                    skipCount++;
                } else {
                    successCount++;
                }
            } else {
                failCount++;
            }
        }

        this.cleanupTempDir();

        console.log('\nProcess complete');
        console.log(`Success: ${successCount}`);
        console.log(`Skipped: ${skipCount}`);
        console.log(`Failed: ${failCount}`);

        if (failCount > 0) {
            console.log('\nSome downloads failed. You can rerun `npm run download-tools` after fixing network or source issues.');
        }
    }
}

if (require.main === module) {
    const downloader = new ToolDownloader();
    downloader.run().catch((error) => {
        console.error('download-tools.js failed:', error.message);
        process.exit(1);
    });
}

module.exports = { ToolDownloader };
