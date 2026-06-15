import { assetManager } from '../../src/core/assets';
import * as Assets from '../../src/lib/assets/assets';

describe('lib assets api', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not expose saveAssetMeta from the public lib API', () => {
        expect((Assets as { saveAssetMeta?: unknown }).saveAssetMeta).toBeUndefined();
    });

    it('exposes updateAssetMetaUserData and delegates to assetManager', async () => {
        const result = { minfilter: 'nearest' };
        const spy = jest.spyOn(assetManager as any, 'updateMetaUserData').mockResolvedValue(result);
        const updateAssetMetaUserData = (Assets as {
            updateAssetMetaUserData?: (
                parentUuid: string,
                subMetaId: string | null,
                path: string,
                value: unknown,
                options?: { reimport?: boolean }
            ) => Promise<unknown>;
        }).updateAssetMetaUserData;

        expect(updateAssetMetaUserData).toEqual(expect.any(Function));

        if (!updateAssetMetaUserData) {
            throw new Error('updateAssetMetaUserData is not exposed from lib/assets/assets');
        }

        await expect(updateAssetMetaUserData('parent-uuid', '6c48a', 'minfilter', 'nearest', { reimport: true })).resolves.toBe(result);
        expect(spy).toHaveBeenCalledWith('parent-uuid', '6c48a', 'minfilter', 'nearest', { reimport: true });
    });
});
