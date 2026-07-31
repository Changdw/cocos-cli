import { EventEmitter } from 'events';

const mockService = {
    Selection: {
        query: jest.fn(),
        clear: jest.fn(),
        select: jest.fn(),
    },
    Engine: {
        repaintInEditMode: jest.fn(),
    },
    Editor: {
        getCurrentEditorType: jest.fn(),
        getRootNode: jest.fn(),
    },
};
const mockGetClassName = jest.fn((obj: any) => obj?.__className ?? obj?.constructor?.name ?? '');
const mockGizmoDefines = {
    components: new Map(),
    iconGizmo: new Map(),
    persistentGizmo: new Map(),
    methods: new Map(),
};

jest.mock('cc', () => {
    class MockNode { }
    class MockComponent { }
    class MockCamera { }
    class MockColor { }
    class MockRect { }
    class MockScene { }
    class MockVec3 { }

    return {
        __esModule: true,
        default: {
            director: {
                getScene: jest.fn(() => null),
            },
        },
        Camera: MockCamera,
        Color: MockColor,
        Component: MockComponent,
        gfx: {},
        js: {
            getClassName: mockGetClassName,
        },
        Layers: {
            Enum: {
                GIZMOS: 1 << 1,
                SCENE_GIZMO: 1 << 2,
                EDITOR: 1 << 3,
            },
        },
        Node: MockNode,
        Rect: MockRect,
        Scene: MockScene,
        Vec3: MockVec3,
        director: {
            getScene: jest.fn(() => null),
        },
    };
});

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: mockService,
}));

jest.mock('../scene-process/service/gizmo/transform-tool', () => ({
    TransformToolData: class TransformToolData extends EventEmitter {
        toolName = 'position';
        is2D = true;
        snapConfigs = {};
    },
}));

jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({
    __esModule: true,
    default: mockGizmoDefines,
}));

jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class GizmoBase { },
}));

jest.mock('../scene-process/service/gizmo/gizmo-operation', () => ({
    __esModule: true,
    default: class GizmoOperation {
        init = jest.fn();
    },
}));

jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({
    create3DNode: jest.fn(),
}));

jest.mock('../scene-process/service/gizmo/utils/rect-transform-snapping', () => ({
    rectTransformSnapping: {
        getPureDataObject: jest.fn(() => ({})),
        initFromData: jest.fn(),
    },
}));

jest.mock('../scene-process/service/gizmo/controller/world-axis', () => ({
    __esModule: true,
    default: class WorldAxisController { },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: jest.fn(),
    },
}));

jest.mock('../scene-process/service/gizmo/components/camera', () => ({}));
jest.mock('../scene-process/service/gizmo/components/box-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/directional-light', () => ({}));
jest.mock('../scene-process/service/gizmo/components/canvas', () => ({}));
jest.mock('../scene-process/service/gizmo/components/ui-transform', () => ({}));
jest.mock('../scene-process/service/gizmo/components/sphere-light', () => ({}));
jest.mock('../scene-process/service/gizmo/components/spot-light', () => ({}));
jest.mock('../scene-process/service/gizmo/components/sphere-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/capsule-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/cone-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/cylinder-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/plane-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/simplex-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/mesh-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/box-collider-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/circle-collider-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/polygon-collider-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/mesh-renderer', () => ({}));
jest.mock('../scene-process/service/gizmo/components/skinned-mesh-renderer', () => ({}));
jest.mock('../scene-process/service/gizmo/components/video-player', () => ({}));
jest.mock('../scene-process/service/gizmo/components/web-view', () => ({}));
jest.mock('../scene-process/service/gizmo/components/light-probe-group', () => ({}));
jest.mock('../scene-process/service/gizmo/components/reflection-probe', () => ({}));

describe('Gizmo editor lifecycle', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.resetModules();
        jest.clearAllMocks();
        mockGizmoDefines.components.clear();
        mockGizmoDefines.iconGizmo.clear();
        mockGizmoDefines.persistentGizmo.clear();
        mockGizmoDefines.methods.clear();
        mockService.Editor.getCurrentEditorType.mockReturnValue('unknown');
        mockService.Editor.getRootNode.mockReturnValue(null);
        delete (globalThis as any).EditorExtends;
        delete (globalThis as any).cc;
    });

    it('resets gizmos from editor open lifecycle without reloading config', () => {
        jest.useFakeTimers();
        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        gizmo.transformToolName = 'rotate';

        const clearAllGizmos = jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        const showIconGizmos = jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});
        const initFromConfig = jest.spyOn(gizmo, 'initFromConfig').mockImplementation(() => undefined as any);

        gizmo.onEditorOpened();

        expect(clearAllGizmos).toHaveBeenCalledTimes(1);
        expect(showIconGizmos).toHaveBeenCalledTimes(1);
        expect(gizmo.transformToolName).toBe('position');
        expect(initFromConfig).not.toHaveBeenCalled();
        jest.runOnlyPendingTimers();
    });

    it('does not let late config restore override the editor-open position tool', async () => {
        let resolveConfig!: (value: unknown) => void;
        const configPromise = new Promise((resolve) => { resolveConfig = resolve; });
        const request = jest.fn(() => configPromise);
        const { Rpc } = require('../scene-process/rpc');
        Rpc.getInstance.mockReturnValue({ request });

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        gizmo.transformToolName = 'position';
        gizmo.viewMode = 'select';
        (gizmo as any)._hasEditorOpened = true;

        const restorePromise = gizmo.initFromConfig();
        resolveConfig({
            transformToolName: 'rotate',
            viewMode: 'view',
            toolsVisibility3d: true,
        });
        await restorePromise;

        expect(gizmo.transformToolName).toBe('position');
        expect(gizmo.viewMode).toBe('select');
    });

    it('rebuilds selected gizmos from editor open lifecycle', () => {
        jest.useFakeTimers();
        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        (gizmo as any)._selection = ['old-node-uuid'];
        mockService.Selection.query.mockReturnValue(['/Canvas/button']);

        const clearAllGizmos = jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        const showIconGizmos = jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeByPath: jest.fn(() => ({ uuid: 'button-uuid' })),
            },
        };

        gizmo.onEditorOpened();

        expect(clearAllGizmos).toHaveBeenCalledTimes(1);
        expect(showIconGizmos).toHaveBeenCalledTimes(1);
        expect((gizmo as any)._selection).toEqual([]);
        expect(mockService.Selection.clear).toHaveBeenCalledTimes(1);
        expect(mockService.Selection.select).toHaveBeenCalledWith('/Canvas/button');
        jest.runOnlyPendingTimers();
        expect(mockService.Engine.repaintInEditMode).toHaveBeenCalledTimes(1);
    });

    it('skips reselecting paths that are not in the opened editor scene', () => {
        jest.useFakeTimers();
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Selection.query.mockReturnValue(['/Missing']);

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});

        gizmo.onEditorOpened();

        expect(mockService.Selection.clear).toHaveBeenCalledTimes(1);
        expect(mockService.Selection.select).not.toHaveBeenCalled();
        jest.runOnlyPendingTimers();
    });

    it('reselects prefab nodes by path relative to the prefab root when hidden Canvas is not in hierarchy', () => {
        jest.useFakeTimers();
        const child = { name: 'Child', uuid: 'child-uuid', children: [] };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);
        mockService.Selection.query.mockReturnValue(['Node/Child']);

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});

        gizmo.onEditorOpened();

        expect(mockService.Selection.select).toHaveBeenCalledWith('Node/Child');
        jest.runOnlyPendingTimers();
    });

    it('resolves transform gizmo nodes with the same prefab relative path fallback', () => {
        const child = { name: 'Child', uuid: 'child-uuid', children: [], isValid: true, parent: null };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child], isValid: true, parent: null };
        (globalThis as any).cc = {
            EditorExtends: {
                Node: {
                    getNodeByPath: jest.fn(() => null),
                },
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);
        mockService.Selection.query.mockReturnValue(['Node/Child']);

        const TransformBaseGizmo = require('../scene-process/service/gizmo/node/transform-base').default;
        const gizmo = new TransformBaseGizmo(null);

        expect(gizmo.nodes).toEqual([child]);
    });

    it('refreshes transform controller size when selected gizmos are updated after camera restore', () => {
        const TransformBaseGizmo = require('../scene-process/service/gizmo/node/transform-base').default;
        const gizmo = new TransformBaseGizmo(null);
        const updateControllerTransform = jest.fn();
        const adjustControllerSize = jest.fn();
        (gizmo as any).updateControllerTransform = updateControllerTransform;
        (gizmo as any)._controller = { adjustControllerSize };

        gizmo.onNodeChanged();

        expect(updateControllerTransform).toHaveBeenCalledTimes(1);
        expect(adjustControllerSize).toHaveBeenCalledTimes(1);
    });

    it('does not reuse destroyed gizmos after clearing all gizmos', () => {
        const { GizmoService } = require('../scene-process/service/gizmo');
        class FakeGizmo {
            target: any = null;
            destroyed = false;
            private _visible = false;

            show() {
                this._visible = true;
            }

            hide() {
                this._visible = false;
            }

            visible() {
                return this._visible;
            }

            destroy() {
                this.destroyed = true;
                this.hide();
            }
        }
        mockGizmoDefines.components.set('FakeComponent', FakeGizmo);
        const gizmo = new GizmoService();
        const firstComponent = { __className: 'FakeComponent' };
        const secondComponent = { __className: 'FakeComponent' };

        (gizmo as any)._showGizmo('component', firstComponent);
        const firstGizmo = (gizmo as any)._componentPool.get('FakeComponent')?.[0];
        expect(firstGizmo).toBeDefined();

        gizmo.clearAllGizmos();
        (gizmo as any)._showGizmo('component', secondComponent);
        const secondGizmo = (gizmo as any)._componentPool.get('FakeComponent')?.[0];

        expect(firstGizmo.destroyed).toBe(true);
        expect(firstGizmo.target).toBeNull();
        expect(secondGizmo).not.toBe(firstGizmo);
        expect(secondGizmo.destroyed).toBe(false);
        expect(secondGizmo.target).toBe(secondComponent);
    });
});
