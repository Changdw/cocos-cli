import { AssetHandlerBase } from '../../@types/protected';
import GltfHandler from './gltf';

export const FbxHandler: AssetHandlerBase = {
    ...GltfHandler,

    // Handler 的名字，用于指定 Handler as 等
    name: 'fbx',

    propertySchemaConfig: {
        ...(GltfHandler.propertySchemaConfig ?? {}),
        legacyFbxImporter: {
            title: 'Legacy FBX Importer',
            type: 'boolean',
            default: false,
        },
        fbx: {
            title: 'FBX',
            type: 'object',
            default: {
                unitConversion: 'geometry-level',
                animationBakeRate: 24,
                preferLocalTimeSpan: true,
                smartMaterialEnabled: false,
                matchMeshNames: false,
            },
            properties: {
                unitConversion: {
                    title: 'Unit Conversion',
                    type: 'string',
                    default: 'geometry-level',
                    enum: ['geometry-level', 'hierarchy-level', 'disabled'],
                    enumDescriptions: ['Geometry Level', 'Hierarchy Level', 'Disabled'],
                },
                animationBakeRate: {
                    title: 'Animation Bake Rate',
                    type: 'number',
                    default: 24,
                    enum: [0, 24, 25, 30, 60],
                    enumDescriptions: ['Original', '24 FPS', '25 FPS', '30 FPS', '60 FPS'],
                },
                preferLocalTimeSpan: {
                    title: 'Prefer Local Time Span',
                    type: 'boolean',
                    default: true,
                },
                smartMaterialEnabled: {
                    title: 'Smart Material',
                    type: 'boolean',
                    default: false,
                },
                matchMeshNames: {
                    title: 'Match Mesh Names',
                    type: 'boolean',
                    default: false,
                },
            },
        },
    },
};

export default FbxHandler;
