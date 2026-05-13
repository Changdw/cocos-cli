const mockExistsSync = jest.fn();
const mockRemove = jest.fn();
const mockTrashItem = jest.fn();

jest.mock('@cocos/asset-db/index', () => ({
    Asset: class {},
    VirtualAsset: class {},
    queryUUID: jest.fn(),
    Utils: {
        nameToId: jest.fn((value) => value),
    },
    queryAsset: jest.fn(),
    queryPath: jest.fn((value) => value),
}));

jest.mock('fs-extra', () => ({
    existsSync: (...args: any[]) => mockExistsSync(...args),
    move: jest.fn(),
    readFile: jest.fn(),
    readJSON: jest.fn(),
    remove: (...args: any[]) => mockRemove(...args),
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        File: {
            trashItem: (...args: any[]) => mockTrashItem(...args),
        },
        Path: {
            resolveToRaw: jest.fn((value) => value),
        },
    },
}));

jest.mock('../../engine/editor-extends/missing-reporter/missing-class-reporter', () => ({
    MissingClass: {
        reset: jest.fn(),
    },
}));

describe('removeFile options', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removeFile should delete directly when useTrash is false', async () => {
        const file = 'D:/project/assets/test.txt';
        const { removeFile } = require('../utils') as typeof import('../utils');

        mockExistsSync.mockImplementation((path: string) => path === file || path === `${file}.meta`);
        mockRemove.mockResolvedValue(undefined);

        await (removeFile as any)(file, { useTrash: false });

        expect(mockRemove).toHaveBeenCalledWith(file);
        expect(mockRemove).toHaveBeenCalledWith(`${file}.meta`);
        expect(mockTrashItem).not.toHaveBeenCalled();
    });
});
