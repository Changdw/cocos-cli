const mockService = {
    Editor: {
        getCurrentEditorUuid: jest.fn(),
    },
};

const mockGetScene = jest.fn();

jest.mock('cc', () => ({
    Camera: class {},
    Canvas: class {},
    Color: class {},
    Layers: {
        Enum: {
            GIZMOS: 1 << 1,
            SCENE_GIZMO: 1 << 2,
            EDITOR: 1 << 3,
        },
        makeMaskInclude: jest.fn(() => 0),
    },
    Vec3: class {},
    gfx: {
        AccessFlagBit: {},
        ColorAttachment: class {},
        DepthStencilAttachment: class {},
        GeneralBarrierInfo: class {},
        RenderPassInfo: class {
            colorAttachments = [{ barrier: null }];
        },
    },
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: mockService,
}));

jest.mock('../scene-process/service/camera/camera-controller-2d', () => ({
    CameraController2D: class {},
}));

jest.mock('../scene-process/service/camera/camera-controller-3d', () => ({
    CameraController3D: class {},
}));

jest.mock('../scene-process/service/camera/camera-controller-base', () => ({
    __esModule: true,
    default: class {},
}));

jest.mock('../scene-process/service/camera/editor-camera-component', () => ({
    __esModule: true,
    default: class {},
}));

jest.mock('../scene-process/service/camera/utils', () => ({
    CameraMoveMode: {},
    CameraUtils: {
        createCamera: jest.fn(),
    },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: jest.fn(),
    },
}));

describe('CameraService current view uuid', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockService.Editor.getCurrentEditorUuid.mockReturnValue(null);
        mockGetScene.mockReturnValue({ uuid: 'virtual-scene-uuid' });
        (global as any).cc = {
            director: {
                getScene: mockGetScene,
            },
        };
    });

    it('uses current editor asset uuid before scene uuid', () => {
        mockService.Editor.getCurrentEditorUuid.mockReturnValue('prefab-asset-uuid');
        const { CameraService } = require('../scene-process/service/camera');
        const service = new CameraService();

        expect((service as any)._getCurrentViewUuid()).toBe('prefab-asset-uuid');
        expect(mockGetScene).not.toHaveBeenCalled();
    });

    it('falls back to director scene uuid when editor uuid is unavailable', () => {
        const { CameraService } = require('../scene-process/service/camera');
        const service = new CameraService();

        expect((service as any)._getCurrentViewUuid()).toBe('virtual-scene-uuid');
    });
});

export {};
