import { assetManager } from '../../src/core/assets';
import * as Assets from '../../src/lib/assets/assets';

describe('lib assets api', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not expose saveAssetMeta from the public lib API', () => {
        expect((Assets as { saveAssetMeta?: unknown }).saveAssetMeta).toBeUndefined();
    });

    it('does not expose updateAssetMetaUserData from the public lib API', () => {
        expect((Assets as { updateAssetMetaUserData?: unknown }).updateAssetMetaUserData).toBeUndefined();
    });

    it('updateAssetUserData delegates sub asset uuid to assetManager', async () => {
        const result = { minfilter: 'nearest' };
        const spy = jest.spyOn(assetManager, 'updateUserData').mockResolvedValue(result);
        const updateAssetUserData = (Assets as {
            updateAssetUserData?: (
                urlOrUuidOrPath: string,
                path: string,
                value: unknown
            ) => Promise<unknown>;
        }).updateAssetUserData;

        expect(updateAssetUserData).toEqual(expect.any(Function));

        if (!updateAssetUserData) {
            throw new Error('updateAssetUserData is not exposed from lib/assets/assets');
        }

        await expect(updateAssetUserData('parent-uuid@6c48a', 'minfilter', 'nearest')).resolves.toBe(result);
        expect(spy).toHaveBeenCalledWith('parent-uuid@6c48a', 'minfilter', 'nearest');
    });
});
