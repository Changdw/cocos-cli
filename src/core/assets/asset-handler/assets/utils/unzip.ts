'use strict';

import { join } from 'path';
import { GlobalPaths } from '../../../../../global';
import { resolveExecutable } from './tool-resolver';

export function resolveUnzipTool(): string {
    const fileCandidates = process.platform === 'win32'
        ? [
            join(GlobalPaths.staticDir, 'tools', 'unzip.exe'),
            join(GlobalPaths.staticDir, 'tools', 'unzip.exe', 'unzip.exe'),
        ]
        : [
            join(GlobalPaths.staticDir, 'tools', 'unzip'),
            join(GlobalPaths.staticDir, 'tools', 'unzip', 'bin', 'unzip'),
        ];

    const tool = resolveExecutable({
        fileCandidates,
    });

    if (tool) {
        return tool;
    }

    throw new Error(
        process.platform === 'win32'
            ? 'Unable to locate unzip.exe. Place it under `static/tools/unzip.exe/`.'
            : 'Unable to locate unzip. Place the Linux binary under `static/tools/unzip/`.',
    );
}
