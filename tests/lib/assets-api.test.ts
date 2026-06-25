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

    it('exposes serializedData namespace and delegates query/save to assetManager', async () => {
        const result = {
            uuid: 'test-uuid',
            url: 'db://assets/test.pmtl',
            type: 'cc.PhysicsMaterial',
            importer: 'physics-material',
            dump: {},
        };
        const querySpy = jest.spyOn(assetManager, 'querySerializedData').mockResolvedValue(result);
        const saveSpy = jest.spyOn(assetManager, 'saveSerializedData').mockResolvedValue(result);

        expect(Assets.serializedData.query).toEqual(expect.any(Function));
        expect(Assets.serializedData.save).toEqual(expect.any(Function));

        await expect(Assets.serializedData.query('test-uuid')).resolves.toEqual(result);
        await expect(Assets.serializedData.save('test-uuid', {})).resolves.toEqual(result);
        expect(querySpy).toHaveBeenCalledWith('test-uuid');
        expect(saveSpy).toHaveBeenCalledWith('test-uuid', {});
    });

    it('exposes material namespace and delegates query/save to assetManager', async () => {
        const effects = {
            'effect-uuid': {
                uuid: 'effect-uuid',
                name: 'builtin-standard',
                hideInEditor: false,
                assetPath: 'db://internal/effects/builtin-standard.effect',
            },
        };
        const effectDump = [{ name: 'default', passes: [] }];
        const materialDump = {
            effect: 'effect-uuid',
            technique: 0,
            data: effectDump,
        };
        const queryAllSpy = jest.spyOn(assetManager, 'queryMaterialAllEffects').mockResolvedValue(effects);
        const queryEffectSpy = jest.spyOn(assetManager, 'queryMaterialEffect').mockResolvedValue(effectDump);
        const querySpy = jest.spyOn(assetManager, 'queryMaterial').mockResolvedValue(materialDump);
        const saveSpy = jest.spyOn(assetManager, 'saveMaterial').mockResolvedValue(undefined);

        expect(Assets.material.query).toEqual(expect.any(Function));
        expect(Assets.material.queryEffect).toEqual(expect.any(Function));
        expect(Assets.material.queryAllEffects).toEqual(expect.any(Function));
        expect(Assets.material.save).toEqual(expect.any(Function));

        await expect(Assets.material.queryAllEffects()).resolves.toEqual(effects);
        await expect(Assets.material.queryEffect('effect-uuid')).resolves.toEqual(effectDump);
        await expect(Assets.material.query('material-uuid')).resolves.toEqual(materialDump);
        await expect(Assets.material.save('material-uuid', materialDump)).resolves.toBeUndefined();

        expect(queryAllSpy).toHaveBeenCalledWith();
        expect(queryEffectSpy).toHaveBeenCalledWith('effect-uuid');
        expect(querySpy).toHaveBeenCalledWith('material-uuid');
        expect(saveSpy).toHaveBeenCalledWith('material-uuid', materialDump);
    });
});
