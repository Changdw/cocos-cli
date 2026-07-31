const mockPathExists = jest.fn();
const mockReadJSON = jest.fn();
const mockQueryAsset = jest.fn();
const mockEncodeAsset = jest.fn();
const mockDeserializeAssetSource = jest.fn((source) => source.__asset);

jest.mock('fs-extra', () => ({
    pathExists: (...args: unknown[]) => mockPathExists(...args),
    readJSON: (...args: unknown[]) => mockReadJSON(...args),
}));

jest.mock('../manager/query', () => ({
    __esModule: true,
    default: {
        queryAsset: (...args: unknown[]) => mockQueryAsset(...args),
        encodeAsset: (...args: unknown[]) => mockEncodeAsset(...args),
        queryAssets: jest.fn(() => []),
    },
}));

jest.mock('../asset-handler/utils', () => ({
    deserialize: (source: unknown) => mockDeserializeAssetSource(source),
}));

jest.mock('../manager/operation', () => ({
    __esModule: true,
    default: {
        saveAsset: jest.fn(),
    },
}));

jest.mock('../../engine/editor-extends', () => ({
    serialize: jest.fn(),
}));

describe('material service source resolution', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('reads standalone material data from the source file', async () => {
        const sourcePath = 'D:/project/assets/mat.mtl';
        const libraryPath = 'D:/project/library/ab/material.json';
        setupMaterialQuery({
            materialSource: sourcePath,
            materialLibrary: libraryPath,
            existingPaths: new Set([sourcePath, libraryPath]),
        });

        const { queryMaterial } = require('../material-service');
        await queryMaterial('material-uuid');

        expect(mockReadJSON).toHaveBeenCalledWith(sourcePath);
        expect(mockReadJSON).not.toHaveBeenCalledWith(libraryPath);
    });

    it('reads imported model material data from the library json when the virtual source does not exist', async () => {
        const virtualSource = 'D:/project/assets/flower.fbx@3ff2f';
        const libraryPath = 'D:/project/library/ab/material@3ff2f.json';
        setupMaterialQuery({
            materialSource: virtualSource,
            materialLibrary: libraryPath,
            existingPaths: new Set([libraryPath]),
        });

        const { queryMaterial } = require('../material-service');
        await queryMaterial('db://assets/flower.fbx@3ff2f');

        expect(mockPathExists).toHaveBeenCalledWith(virtualSource);
        expect(mockReadJSON).toHaveBeenCalledWith(libraryPath);
        expect(mockReadJSON).not.toHaveBeenCalledWith(virtualSource);
    });
});

function setupMaterialQuery(options: {
    materialSource: string;
    materialLibrary: string;
    existingPaths: Set<string>;
}) {
    const materialAsset = { uuid: 'material-uuid', source: options.materialSource };
    const effectAsset = { uuid: 'effect-uuid', source: 'D:/project/assets/effect.effect' };
    const materialSource = {
        _effectAsset: { __uuid__: 'effect-uuid' },
        _techIdx: 0,
        __asset: {
            _effectAsset: { _uuid: 'effect-uuid' },
            _techIdx: 0,
            _defines: [],
            _props: [],
            _states: [],
        },
    };
    const effectSource = {
        __asset: {
            name: 'builtin-standard',
            techniques: [],
        },
    };

    mockPathExists.mockImplementation(async (path: string) => options.existingPaths.has(path));
    mockReadJSON.mockImplementation(async (path: string) => {
        if (path === options.materialSource || path === options.materialLibrary) {
            return materialSource;
        }
        if (path === 'D:/project/library/ef/effect.json') {
            return effectSource;
        }
        throw new Error(`Unexpected readJSON path: ${path}`);
    });
    mockQueryAsset.mockImplementation((id: string) => {
        if (id === 'material-uuid' || id === 'db://assets/flower.fbx@3ff2f') {
            return materialAsset;
        }
        if (id === 'effect-uuid') {
            return effectAsset;
        }
        return null;
    });
    mockEncodeAsset.mockImplementation((asset: { uuid: string }) => {
        if (asset.uuid === 'material-uuid') {
            return {
                uuid: 'material-uuid',
                url: 'db://assets/flower.fbx@3ff2f',
                type: 'cc.Material',
                library: { '.json': options.materialLibrary },
            };
        }
        return {
            uuid: 'effect-uuid',
            url: 'db://internal/effects/builtin-standard.effect',
            type: 'cc.EffectAsset',
            library: { '.json': 'D:/project/library/ef/effect.json' },
        };
    });
}

export {};
