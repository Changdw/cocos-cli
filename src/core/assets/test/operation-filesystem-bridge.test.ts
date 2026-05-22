export {};

const mockCopy = jest.fn();
const mockExistsSync = jest.fn();
const mockCopyPath = jest.fn();
const mockMoveAssetSource = jest.fn();
const mockRenamePath = jest.fn();
const mockQueryAsset = jest.fn();
const mockQueryAssetInfo = jest.fn();
const mockQueryAssetInfos = jest.fn();
const mockQueryUrl = jest.fn();
const mockAddTask = jest.fn(async (func: Function, args: any[]) => await func(...args));
const { dirname, join } = require('path') as typeof import('path');

jest.mock('fs-extra', () => ({
    copy: (...args: any[]) => mockCopy(...args),
    move: jest.fn(),
    remove: jest.fn(),
    rename: jest.fn(),
    existsSync: (...args: any[]) => mockExistsSync(...args),
}));

jest.mock('@cocos/asset-db', () => ({
    refresh: jest.fn(async () => 0),
    reimport: jest.fn(),
    queryUrl: (...args: any[]) => mockQueryUrl(...args),
    Asset: class {},
}));

jest.mock('../utils', () => ({
    url2path: jest.fn((value) => value),
    ensureOutputData: jest.fn(),
    url2uuid: jest.fn((value) => value),
}));

jest.mock('../manager/filesystem', () => ({
    copyPath: (...args: any[]) => mockCopyPath(...args),
    moveAssetSource: (...args: any[]) => mockMoveAssetSource(...args),
    renamePath: (...args: any[]) => mockRenamePath(...args),
    removeAssetSource: jest.fn(),
    setFileSystemProvider: jest.fn(),
    resetFileSystemProvider: jest.fn(),
}));

jest.mock('../manager/asset-db', () => ({
    __esModule: true,
    default: {
        addTask: (func: Function, args: any[]) => mockAddTask(func, args),
        autoRefreshAssetLazy: jest.fn(),
        assetDBInfo: {},
        assetDBMap: {},
    },
}));

jest.mock('../manager/asset-handler', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../asset-config', () => ({
    __esModule: true,
    default: {
        data: {
            tempRoot: 'D:/project/temp',
            root: 'D:/project',
        },
    },
}));

jest.mock('../manager/query', () => ({
    __esModule: true,
    default: {
        queryAsset: (...args: any[]) => mockQueryAsset(...args),
        encodeAsset: jest.fn((asset) => ({ source: asset.source })),
        queryUrl: jest.fn(),
        queryAssetInfo: (...args: any[]) => mockQueryAssetInfo(...args),
        queryAssetInfos: (...args: any[]) => mockQueryAssetInfos(...args),
    },
}));

jest.mock('../asset-handler/utils', () => ({
    mergeMeta: jest.fn(),
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        t: (key: string) => key,
    },
}));

describe('asset operation filesystem bridge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renameAsset should delegate rename steps to filesystem bridge', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.txt';
        const target = join(dirname(source), 'renamed.txt');
        const temp = join(dirname(target), '.rename_temp');
        const asset = {
            source,
            _parent: null,
            isDirectory: () => false,
            _assetDB: {
                options: {
                    readonly: false,
                },
            },
            url: 'db://assets/source.txt',
        };

        mockQueryAsset.mockReturnValue(asset);
        mockExistsSync.mockImplementation((path: string) => path === source);
        mockRenamePath.mockResolvedValue(undefined);

        await assetOperation.renameAsset(source, 'renamed.txt');

        expect(mockRenamePath.mock.calls).toEqual([
            [`${source}.meta`, `${temp}.meta`],
            [source, temp],
            [`${temp}.meta`, `${target}.meta`],
            [temp, target],
        ]);
    });

    it('moveAsset should delegate source move to filesystem bridge', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.txt';
        const target = 'D:/project/assets/folder/source.txt';
        const asset = {
            source,
            _parent: null,
            isDirectory: () => false,
            _assetDB: {
                options: {
                    readonly: false,
                },
            },
            url: 'db://assets/source.txt',
        };

        mockQueryAsset.mockReturnValue(asset);
        mockQueryUrl.mockReturnValue('db://assets/folder/source.txt');
        mockExistsSync.mockReturnValue(false);
        mockMoveAssetSource.mockResolvedValue(undefined);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        await assetOperation.moveAsset(source, target);

        expect(mockMoveAssetSource).toHaveBeenCalledWith(source, target, undefined);
    });

    it('importAsset should delegate copy to filesystem bridge', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/outside/source.txt';
        const target = 'D:/project/assets/source.txt';
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/source.txt',
        };

        mockCopyPath.mockResolvedValue(undefined);
        mockQueryAssetInfo.mockReturnValue(assetInfo);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        const result = await assetOperation.importAsset(source, target, { overwrite: true });

        expect(mockCopyPath).toHaveBeenCalledWith(source, target, { overwrite: true });
        expect(mockCopy).not.toHaveBeenCalled();
        expect(result).toEqual([assetInfo]);
    });
});
