const mockUpdateMetaUserData = jest.fn();

jest.mock('../src/core/assets', () => ({
    assetDBManager: {},
    assetManager: {
        updateMetaUserData: (...args: unknown[]) => mockUpdateMetaUserData(...args),
    },
}));

jest.mock('../src/api/decorator/decorator.js', () => jest.requireActual('../src/api/decorator/decorator'), { virtual: true });

import { toolRegistry } from '../src/api/decorator/decorator.js';
import { COMMON_STATUS } from '../src/api/base/schema-base';
import { AssetsApi } from '../src/api/assets/assets';

describe('assets-update-asset-meta-user-data api', () => {
    beforeEach(() => {
        mockUpdateMetaUserData.mockReset();
    });

    it('registers a tool with parentUuid, subMetaId, path, value, and options parameters', () => {
        const tool = toolRegistry.get('assets-update-asset-meta-user-data');

        expect(tool).toBeDefined();
        expect(tool?.meta.paramSchemas.map((param) => param.name)).toEqual([
            'parentUuid',
            'subMetaId',
            'path',
            'value',
            'options',
        ]);
    });

    it('delegates to assetManager.updateMetaUserData and returns updated userData', async () => {
        const updatedUserData = { minfilter: 'nearest' };
        mockUpdateMetaUserData.mockResolvedValue(updatedUserData);

        const result = await (new AssetsApi() as any).updateAssetMetaUserData(
            'parent-uuid',
            '6c48a',
            'minfilter',
            'nearest',
            { reimport: true },
        );

        expect(result).toEqual({
            code: COMMON_STATUS.SUCCESS,
            data: updatedUserData,
        });
        expect(mockUpdateMetaUserData).toHaveBeenCalledWith(
            'parent-uuid',
            '6c48a',
            'minfilter',
            'nearest',
            { reimport: true },
        );
    });
});
