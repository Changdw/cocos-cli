import { assetManager, assetDBManager } from '..';
import assetHandlerManager from '../manager/asset-handler';
import assetQuery from '../manager/query';
import { IAssetInfo } from '../@types/public';
import { IAsset } from '../@types/private';

describe('Removed Asset Snapshot', () => {
    let originalReady: boolean;

    beforeAll(() => {
        originalReady = assetDBManager.ready;
    });

    beforeEach(() => {
        assetDBManager.ready = true;
        assetManager.removeAllListeners('onAssetRemoved');
        assetManager.removeAllListeners('asset-delete');
        jest.restoreAllMocks();
    });

    afterAll(() => {
        assetDBManager.ready = originalReady;
        assetManager.removeAllListeners('onAssetRemoved');
        assetManager.removeAllListeners('asset-delete');
        jest.restoreAllMocks();
    });

    it('emits a snapshot instead of null after delete', async () => {
        const removedSnapshot: IAssetInfo = {
            uuid: 'test-uuid',
            name: 'test.txt',
            displayName: 'test.txt',
            source: 'db://assets/test.txt',
            loadUrl: 'db://assets/test',
            url: 'db://assets/test.txt',
            file: 'D:\\project\\assets\\test.txt',
            importer: 'text',
            imported: true,
            invalid: false,
            type: 'cc.TextAsset',
            isDirectory: false,
            readonly: false,
            library: {},
            subAssets: {},
        };
        const mockAsset = {
            uuid: 'test-uuid',
            url: 'db://assets/test.txt',
            source: 'D:\\project\\assets\\test.txt',
            meta: {
                importer: 'text',
                imported: true,
            },
            invalid: false,
            importError: null,
        } as unknown as IAsset;

        const encodeSpy = jest.spyOn(assetQuery, 'encodeAsset').mockReturnValue(removedSnapshot);
        const destroySpy = jest.spyOn(assetHandlerManager, 'destroyAsset').mockResolvedValue(undefined);
        const removedListener = jest.fn();
        const deleteListener = jest.fn();

        assetManager.onAssetRemoved(removedListener);
        assetManager.on('asset-delete', deleteListener);

        await (assetManager as any)._onAssetDeleted(mockAsset);

        expect(encodeSpy).toHaveBeenCalledWith(mockAsset, ['subAssets', 'displayName'], true);
        expect(destroySpy).toHaveBeenCalledWith(mockAsset);
        expect(deleteListener).toHaveBeenCalledWith(mockAsset);
        expect(removedListener).toHaveBeenCalledWith(removedSnapshot);
        expect(removedListener).not.toHaveBeenCalledWith(null);
    });
});
