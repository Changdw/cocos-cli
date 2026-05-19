export {};

const mockReadJSON = jest.fn();
const mockDirectWriteFile = jest.fn();
const mockWritePath = jest.fn();
const mockGetDependList = jest.fn();
const mockRemoveNull = jest.fn();

jest.mock('@cocos/asset-db', () => ({
    Asset: class {},
}));

jest.mock('fs-extra', () => {
    const api = {
        readJSON: (...args: any[]) => mockReadJSON(...args),
        writeFile: (...args: any[]) => mockDirectWriteFile(...args),
    };
    return {
        __esModule: true,
        ...api,
        default: api,
    };
});

jest.mock('../manager/filesystem', () => ({
    writePath: (...args: any[]) => mockWritePath(...args),
}));

jest.mock('../asset-handler/utils', () => ({
    getDependList: (...args: any[]) => mockGetDependList(...args),
    removeNull: (...args: any[]) => mockRemoveNull(...args),
}));

describe('asset source write filesystem bridge', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockGetDependList.mockReturnValue({
            uuids: [],
            dependScriptUuids: [],
        });
        mockRemoveNull.mockReturnValue(false);
    });

    it('scene importer should delegate source rewrites to filesystem bridge', async () => {
        const { SceneHandler } = require('../asset-handler/assets/scene/index') as typeof import('../asset-handler/assets/scene/index');
        const importer = (SceneHandler.importer as any);
        const asset = {
            source: 'D:/project/assets/NewScene.scene',
            uuid: 'scene-uuid',
            saveToLibrary: jest.fn(async () => {}),
            setData: jest.fn(),
        };

        mockReadJSON.mockResolvedValue([
            { _name: 'OldScene' },
            { __type__: 'cc.Scene', _id: 'old-scene-uuid', _name: 'OldSceneNode' },
        ]);

        await importer.import(asset as any);

        expect(mockWritePath.mock.calls[0][0]).toBe(asset.source);
        expect(JSON.parse(mockWritePath.mock.calls[0][1])).toEqual([
            { _name: 'NewScene' },
            { __type__: 'cc.Scene', _id: 'scene-uuid', _name: 'NewScene' },
        ]);
        expect(mockDirectWriteFile).not.toHaveBeenCalled();
    });

    it('prefab importer should delegate source rewrites to filesystem bridge', async () => {
        const { PrefabHandler } = require('../asset-handler/assets/scene/prefab') as typeof import('../asset-handler/assets/scene/prefab');
        const importer = (PrefabHandler.importer as any);
        const asset = {
            source: 'D:/project/assets/NewPrefab.prefab',
            basename: 'NewPrefab',
            uuid: 'prefab-uuid',
            userData: {
                persistent: true,
            },
            saveToLibrary: jest.fn(async () => {}),
            setData: jest.fn(),
        };

        mockReadJSON.mockResolvedValue([
            { _name: 'OldPrefab', persistent: false },
            { _name: 'OldPrefabRoot' },
        ]);

        await importer.import(asset as any);

        expect(mockWritePath.mock.calls[0][0]).toBe(asset.source);
        expect(JSON.parse(mockWritePath.mock.calls[0][1])).toEqual([
            { _name: 'NewPrefab', persistent: true },
            { _name: 'NewPrefab' },
        ]);
        expect(mockDirectWriteFile).not.toHaveBeenCalled();
    });

    it('migration hook should delegate source rewrites to filesystem bridge', async () => {
        const { migrationHook } = require('../asset-handler/assets/utils/migration-utils') as typeof import('../asset-handler/assets/utils/migration-utils');
        const swap = {
            json: {
                migrated: true,
            },
        };
        const asset = {
            source: 'D:/project/assets/old.scene',
            getSwapSpace: () => swap,
        };

        await migrationHook.post(asset as any, 1);

        expect(mockWritePath).toHaveBeenCalledWith(asset.source, JSON.stringify({ migrated: true }, null, 2));
        expect(mockDirectWriteFile).not.toHaveBeenCalled();
    });
});
