import { resolveSceneAssetBase } from './utils';

describe('scene-process utils', () => {
    it('uses server URL as the scene asset base when available', () => {
        expect(resolveSceneAssetBase('http://localhost:7456', 'D:/project/library')).toBe('http://localhost:7456');
    });

    it('falls back to the local library path without a server URL', () => {
        expect(resolveSceneAssetBase(undefined, 'D:/project/library')).toBe('D:/project/library');
        expect(resolveSceneAssetBase('', 'D:/project/library')).toBe('D:/project/library');
    });
});
