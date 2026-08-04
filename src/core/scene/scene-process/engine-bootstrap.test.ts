const mockServiceInitialize = jest.fn();
const mockServiceInitAll = jest.fn();
const mockRpcStartup = jest.fn();
const mockInitLocalI18n = jest.fn();
const mockEditorExtendsInit = jest.fn();
const mockDecoratorEngineInit = jest.fn();
const mockDecoratorEnginePause = jest.fn();
const mockOverwrite = jest.fn();

jest.mock('../../engine/editor-extends', () => ({
    UuidUtils: {},
    init: () => mockEditorExtendsInit(),
}));

jest.mock('./rpc', () => ({
    Rpc: {
        startup: (...args: any[]) => mockRpcStartup(...args),
    },
}));

jest.mock('./service/service-manager', () => ({
    serviceManager: {
        initialize: (...args: any[]) => mockServiceInitialize(...args),
        initAllServices: (...args: any[]) => mockServiceInitAll(...args),
    },
}));

jest.mock('./service/core/decorator', () => ({
    Service: {
        Script: {},
        Engine: {
            init: (...args: any[]) => mockDecoratorEngineInit(...args),
            pause: (...args: any[]) => mockDecoratorEnginePause(...args),
        },
    },
}));

jest.mock('./service/message', () => ({
    messageManager: {},
}));

jest.mock('./i18n', () => ({
    initLocalI18n: (...args: any[]) => mockInitLocalI18n(...args),
}));

jest.mock('./service', () => ({}));
jest.mock('cc/polyfill/engine', () => ({}), { virtual: true });
jest.mock('cc/overwrite', () => ({ default: (...args: any[]) => mockOverwrite(...args) }), { virtual: true });
jest.mock('../../engine/editor-extends/utils/serialize', () => ({
    serialize: jest.fn(),
    serializeCompiled: jest.fn(),
}));
jest.mock('../../engine/editor-extends/utils/deserialize', () => ({}));
jest.mock('../../engine/editor-extends/utils/geometry', () => ({}));
jest.mock('../../engine/editor-extends/utils/prefab', () => ({}));

import { startup } from './engine-bootstrap';

describe('scene-process engine bootstrap', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        (globalThis as any).System = {
            import: jest.fn(async () => ({})),
        };
        (globalThis as any).fetch = jest
            .fn()
            .mockResolvedValueOnce({
                json: async () => ({
                    overrideSettings: {
                        rendering: {},
                    },
                }),
            })
            .mockResolvedValueOnce({
                json: async () => ['base', 'custom-pipeline'],
            });
        (globalThis as any).document = {
            getElementById: jest.fn(() => null),
            createElement: jest.fn(() => ({})),
            head: {
                appendChild: jest.fn(),
            },
        };
        (globalThis as any).io = jest.fn(() => ({
            on: jest.fn(),
        }));
        (globalThis as any).EditorExtends = {};
        (globalThis as any).cc = {
            game: {
                init: jest.fn(async () => undefined),
                run: jest.fn(async () => undefined),
                pause: jest.fn(),
            },
            physics: {
                selector: {
                    runInEditor: false,
                    switchTo: jest.fn(),
                },
            },
            ResolutionPolicy: {
                SHOW_ALL: 'show-all',
            },
            view: {
                setDesignResolutionSize: jest.fn(),
            },
            director: {
                runSceneImmediate: jest.fn(),
            },
            assetManager: {
                loadAny: jest.fn(),
                bundles: {
                    forEach: jest.fn(),
                },
                assets: {
                    get: jest.fn(),
                    add: jest.fn(),
                },
            },
            js: {
                getClassById: jest.fn(),
            },
            deserialize: jest.fn(),
        };
    });

    it('passes custom pipeline settings to cc.game.init', async () => {
        await startup({ serverURL: 'http://localhost:7456' });

        expect(global.fetch).toHaveBeenCalledWith('http://localhost:7456/scripting/engine/game-config');
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:7456/scripting/engine/modules');
        expect((globalThis as any).cc.game.init).toHaveBeenCalledWith(expect.objectContaining({
            overrideSettings: expect.objectContaining({
                rendering: expect.objectContaining({
                    customPipeline: true,
                    effectSettingsPath: 'http://localhost:7456/scripting/engine/effect-settings',
                }),
            }),
        }));
    });

    it('reloads project assets without using the browser cache', async () => {
        const oldAsset = { _uuid: 'asset-uuid', old: true };
        const newAsset = { _uuid: '', old: false };
        const cache = new Map<string, any>([['asset-uuid', oldAsset]]);
        const assets = {
            get: jest.fn((uuid: string) => cache.get(uuid)),
            add: jest.fn((uuid: string, asset: any) => cache.set(uuid, asset)),
            remove: jest.fn((uuid: string) => cache.delete(uuid)),
        };
        (globalThis as any).cc.assetManager.assets = assets;
        (globalThis as any).cc.deserialize = jest.fn(() => newAsset);
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                text: async () => '.json',
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

        await startup({ serverURL: 'http://localhost:7456' });

        const loaded = await new Promise<any>((resolve, reject) => {
            (globalThis as any).cc.assetManager.loadAny(
                'asset-uuid',
                { reloadAsset: true },
                (err: Error | null, asset: any) => err ? reject(err) : resolve(asset),
            );
        });

        expect(loaded).toBe(newAsset);
        expect(assets.remove).toHaveBeenCalledWith('asset-uuid');
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringMatching(/^http:\/\/localhost:7456\/import\/asset-uuid\.json\?isBrowser=true&_t=/),
            { cache: 'no-store' },
        );
    });
});
