'use strict';

import { closeSync, constants, openSync, readSync } from 'fs';
import { existsSync, statSync } from 'fs-extra';

interface IResolveExecutableOptions {
    fileCandidates?: string[];
}

export function resolveExecutable(options: IResolveExecutableOptions): string | undefined {
    for (const fileCandidate of options.fileCandidates ?? []) {
        if (isExecutableFile(fileCandidate)) {
            return fileCandidate;
        }
    }

    return undefined;
}

function isExecutableFile(filePath: string) {
    if (!existsSync(filePath)) {
        return false;
    }

    try {
        const stats = statSync(filePath);
        if (!stats.isFile()) {
            return false;
        }

        if (process.platform === 'win32') {
            return true;
        }

        if (!(stats.mode & (constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH))) {
            return false;
        }

        return !isWindowsPortableExecutable(filePath);
    } catch {
        return false;
    }
}

function isWindowsPortableExecutable(filePath: string) {
    if (process.platform !== 'linux') {
        return false;
    }

    let fd: number | undefined;
    try {
        fd = openSync(filePath, 'r');
        const header = Buffer.alloc(2);
        const bytesRead = readSync(fd, header, 0, header.length, 0);
        return bytesRead === 2 && header[0] === 0x4d && header[1] === 0x5a;
    } catch {
        return false;
    } finally {
        if (typeof fd === 'number') {
            closeSync(fd);
        }
    }
}
