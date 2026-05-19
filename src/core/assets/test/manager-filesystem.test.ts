export {};

const mockExistsSync = jest.fn();
const mockMove = jest.fn();
const mockRemove = jest.fn();
const mockEnsureDir = jest.fn();
const mockTrashItem = jest.fn();

jest.mock('fs-extra', () => ({
    existsSync: (...args: any[]) => mockExistsSync(...args),
    move: (...args: any[]) => mockMove(...args),
    remove: (...args: any[]) => mockRemove(...args),
    ensureDir: (...args: any[]) => mockEnsureDir(...args),
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        File: {
            trashItem: (...args: any[]) => mockTrashItem(...args),
        },
        Path: {
            contains: jest.fn(() => false),
        },
    },
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

describe('asset filesystem manager', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('should expose a provider-shaped local fallback and keep fallback methods after partial override', () => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');

        filesystem.resetFileSystemProvider();

        let provider = filesystem.getFileSystemProvider();
        expect(typeof provider.createDirectory).toBe('function');
        expect(typeof provider.delete).toBe('function');
        expect(typeof provider.rename).toBe('function');

        const customRename = jest.fn(async () => {});
        filesystem.setFileSystemProvider({
            rename: customRename,
        });

        provider = filesystem.getFileSystemProvider();
        expect(typeof provider.createDirectory).toBe('function');
        expect(typeof provider.delete).toBe('function');
        expect(provider.rename).toBe(customRename);
    });

    it('removeAssetSource should delegate delete to custom provider and forward useTrash', async () => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');
        const provider = {
            delete: jest.fn(async () => {}),
        };
        const file = 'D:/project/assets/test.txt';

        filesystem.setFileSystemProvider(provider);
        mockExistsSync.mockImplementation((path: string) => path === file || path === `${file}.meta`);

        await filesystem.removeAssetSource(file, { useTrash: true });

        expect(provider.delete).toHaveBeenNthCalledWith(1, file, { useTrash: true });
        expect(provider.delete).toHaveBeenNthCalledWith(2, `${file}.meta`, { useTrash: true });
        expect(mockTrashItem).not.toHaveBeenCalled();
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('moveAssetSource should delegate rename to custom provider for source and meta files', async () => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');
        const provider = {
            rename: jest.fn(async () => {}),
        };
        const source = 'D:/project/assets/source.txt';
        const target = 'D:/project/assets/target.txt';

        filesystem.setFileSystemProvider(provider);

        await filesystem.moveAssetSource(source, target, { overwrite: false });

        expect(provider.rename).toHaveBeenNthCalledWith(1, `${source}.meta`, `${target}.meta`, { overwrite: true });
        expect(provider.rename).toHaveBeenNthCalledWith(2, source, target, { overwrite: false });
        expect(mockMove).not.toHaveBeenCalled();
    });
});
