'use strict';

import { join } from 'path';
import { GlobalPaths } from '../../../../../global';
import { resolveExecutable } from './tool-resolver';

export function resolveCmftTool(version = ''): string {
    const versions = version ? [version, ''] : [''];
    const fileCandidates: string[] = [];

    for (const currentVersion of versions) {
        if (process.platform === 'win32') {
            fileCandidates.push(join(GlobalPaths.staticDir, `tools/cmft/cmftRelease64${currentVersion}.exe`));
        } else {
            fileCandidates.push(
                join(GlobalPaths.staticDir, `tools/cmft/cmftRelease64${currentVersion}`),
                join(GlobalPaths.staticDir, `tools/cmft/linux/cmftRelease64${currentVersion}`),
            );
        }
    }

    const tool = resolveExecutable({
        fileCandidates,
    });

    if (tool) {
        return tool;
    }

    throw new Error(
        process.platform === 'linux'
            ? 'Unable to locate cmft. Place the Linux binary under `static/tools/cmft/` (for example `static/tools/cmft/linux/cmftRelease64`).'
            : 'Unable to locate cmft.',
    );
}
