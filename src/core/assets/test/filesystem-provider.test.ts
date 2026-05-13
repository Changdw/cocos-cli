jest.mock('../../assets', () => ({
    assetDBManager: {
        setFileSystemProvider: jest.fn(),
    },
    assetManager: {},
}));

jest.mock('@cocos/asset-db', () => {
    const actual = jest.requireActual('@cocos/asset-db');
    return {
        ...actual,
        setFileSystemProvider: jest.fn(),
    };
});

describe('asset filesystem provider bridge', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('lib api should delegate setFileSystemProvider to assetDBManager', () => {
        const { assetDBManager } = require('../../assets') as { assetDBManager: any };
        const assets = require('../../../lib/assets/assets') as typeof import('../../../lib/assets/assets');
        const provider = { writeFile: jest.fn() };

        expect(typeof (assets as any).setFileSystemProvider).toBe('function');
        (assets as any).setFileSystemProvider(provider);

        expect(assetDBManager.setFileSystemProvider).toHaveBeenCalledWith(provider);
    });

    it('assetDBManager should delegate setFileSystemProvider to @cocos/asset-db', () => {
        const assetdb = require('@cocos/asset-db') as { setFileSystemProvider: jest.Mock };
        const assetDBManager = require('../manager/asset-db').default as any;
        const provider = { writeFile: jest.fn() };

        expect(typeof assetDBManager.setFileSystemProvider).toBe('function');
        assetDBManager.setFileSystemProvider(provider);

        expect(assetdb.setFileSystemProvider).toHaveBeenCalledWith(provider);
    });
});
