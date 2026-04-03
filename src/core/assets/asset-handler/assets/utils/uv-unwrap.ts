import os from 'os';
import path from 'path';
import utils from '../../../../base/utils';
import { GlobalPaths } from '../../../../../global';
import { resolveExecutable } from './tool-resolver';
/**
 *
 * @param inputFile The file is the mesh data extracted from cc.Mesh for generating LightmapUV.
 * @param outFile The file is the generated LightmapUV data.
 */
export function unwrapLightmapUV(inputFile: string, outFile: string) {
    const toolName = 'uvunwrap';
    const toolExt = os.type() === 'Windows_NT' ? '.exe' : '';
    const tool = resolveExecutable({
        fileCandidates: [
            path.join(GlobalPaths.staticDir, 'tools/LightFX', toolName + toolExt),
            path.join(GlobalPaths.staticDir, 'tools/LightFX', toolName),
            path.join(GlobalPaths.staticDir, 'tools', 'uvunwrap', toolName + toolExt),
            path.join(GlobalPaths.staticDir, 'tools', 'uvunwrap', toolName),
        ],
    });

    if (!tool) {
        throw new Error(
            os.type() === 'Linux'
                ? 'Unable to locate uvunwrap. Place the Linux binary under `static/tools/uvunwrap/` or `static/tools/LightFX/`.'
                : 'Unable to locate uvunwrap.',
        );
    }
    const args = ['--input', inputFile, '--output', outFile];

    return utils.Process.quickSpawn(tool, args);
}
