import { createAssetPropertySchemaMap } from '../property-schema';
import { ImageHandler } from '../asset-handler/assets/image';
import { SpriteFrameHandler } from '../asset-handler/assets/sprite-frame';

describe('asset property schema map', () => {
    it('keeps asset property schema aligned with configuration property schema', () => {
        const schema = createAssetPropertySchemaMap({
            meshType: {
                title: 'Mesh Type',
                type: 'number',
                default: 0,
                enum: [0, 1],
                enumDescriptions: ['Rect', 'Polygon'],
            },
            textureSetting: {
                title: 'Texture Setting',
                type: 'object',
                default: {
                    anisotropy: 0,
                },
                properties: {
                    anisotropy: {
                        title: 'Anisotropy',
                        type: 'number',
                        default: 0,
                        minimum: 0,
                        step: 1,
                    },
                },
            },
        });

        expect(schema.meshType).toEqual({
            title: 'Mesh Type',
            type: 'number',
            default: 0,
            enum: [0, 1],
            enumDescriptions: ['Rect', 'Polygon'],
        });
        expect(schema.textureSetting.properties?.anisotropy).toEqual({
            title: 'Anisotropy',
            type: 'number',
            default: 0,
            minimum: 0,
            step: 1,
        });
        expect(schema.meshType).not.toHaveProperty('label');
        expect(schema.meshType).not.toHaveProperty('options');
        expect(schema.meshType).not.toHaveProperty('raw');
    });

    it('returns an empty map when a handler has no explicit property schema config', () => {
        expect(createAssetPropertySchemaMap(undefined)).toEqual({});
    });

    it('builds config-style property schema from built-in asset handler declarations', () => {
        const imageSchema = createAssetPropertySchemaMap(ImageHandler.propertySchemaConfig);
        const spriteFrameSchema = createAssetPropertySchemaMap(SpriteFrameHandler.propertySchemaConfig);

        expect(imageSchema.type).toMatchObject({
            type: 'string',
            default: 'sprite-frame',
            enum: ['raw', 'texture', 'normal map', 'sprite-frame', 'texture cube'],
        });
        expect(imageSchema.type).not.toHaveProperty('label');
        expect(imageSchema.type).not.toHaveProperty('options');

        expect(spriteFrameSchema.trimType).toMatchObject({
            type: 'string',
            default: 'auto',
            enum: ['auto', 'custom', 'none'],
        });
        expect(spriteFrameSchema.trimThreshold).toMatchObject({
            type: 'number',
            minimum: 0,
            step: 1,
        });
        expect(spriteFrameSchema.trimType).not.toHaveProperty('raw');
    });
});
