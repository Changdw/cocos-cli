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
const mockRefresh = jest.fn(async (_pathOrUrlOrUUID: string) => 0);
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
    refresh: (pathOrUrlOrUUID: string) => mockRefresh(pathOrUrlOrUUID),
    reimport: jest.fn(),
    queryUrl: (...args: any[]) => mockQueryUrl(...args),
    Asset: class {},
}));

jest.mock('../utils', () => ({
    url2path: jest.fn((value) => value),
    ensureOutputData: jest.fn(),
    url2uuid: jest.fn((value) => value),
    pathToDbUrlIfAssetDBPath: jest.fn((value: string, assetDBInfo: Record<string, { name: string; target: string }>) => {
        if (!value || value.startsWith('db://')) {
            return value;
        }
        if (value === 'D:/project/assets/resources/Image' || value === 'assets/resources/Image') {
            return 'db://assets/resources/Image';
        }
        if (value === 'D:/project/assets/resources/Image/snake_head.png') {
            return 'db://assets/resources/Image/snake_head.png';
        }
        return assetDBInfo.assets && value === assetDBInfo.assets.target ? 'db://assets' : value;
    }),
    dirnameForDbUrlOrPath: jest.fn((value: string) => {
        if (value.startsWith('db://')) {
            const index = value.lastIndexOf('/');
            return index <= 'db://assets'.length ? 'db://assets' : value.slice(0, index);
        }
        return value.replace(/[\\/][^\\/]*$/, '');
    }),
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
    function setAssetDBInfo(target = 'D:/project/assets') {
        const assetDBManager = require('../manager/asset-db').default as typeof import('../manager/asset-db').default;
        assetDBManager.assetDBInfo.assets = {
            name: 'assets',
            target,
            readonly: false,
            temp: 'D:/project/temp/assets',
            library: 'D:/project/library',
            level: 0,
            globList: [],
            ignoreFiles: [],
            visible: true,
            state: 'none',
            preImportExtList: [],
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        const assetDBManager = require('../manager/asset-db').default as typeof import('../manager/asset-db').default;
        Object.keys(assetDBManager.assetDBInfo).forEach((key) => delete assetDBManager.assetDBInfo[key]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
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

    it('refreshAsset should normalize an absolute asset-db path before refreshing', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        setAssetDBInfo();

        await assetOperation.refreshAsset('D:/project/assets/resources/Image');

        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image');
    });

    it('refreshAsset should normalize a database-name relative asset path before refreshing', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        setAssetDBInfo();

        await assetOperation.refreshAsset('assets/resources/Image');

        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image');
    });

    it('importAsset should refresh an existing file in the asset DB when source and target are the same path', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const target = 'D:/project/assets/resources/Image/snake_head.png';
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/resources/Image/snake_head.png',
        };

        setAssetDBInfo();
        mockQueryAssetInfo.mockReturnValue(assetInfo);

        const result = await assetOperation.importAsset(target, target, { overwrite: true });

        expect(mockCopyPath).not.toHaveBeenCalled();
        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(mockQueryAssetInfo).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(result).toEqual([assetInfo]);
    });

    it('importAsset should copy external files to the physical target and refresh the db url', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/outside/snake_head.png';
        const target = 'D:/project/assets/resources/Image/snake_head.png';
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/resources/Image/snake_head.png',
        };

        setAssetDBInfo();
        mockCopyPath.mockResolvedValue(undefined);
        mockQueryAssetInfo.mockReturnValue(assetInfo);

        const result = await assetOperation.importAsset(source, target, { overwrite: true });

        expect(mockCopyPath).toHaveBeenCalledWith(source, target, { overwrite: true });
        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(mockQueryAssetInfo).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(result).toEqual([assetInfo]);
    });
});
