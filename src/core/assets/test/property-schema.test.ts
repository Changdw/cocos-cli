import { createAssetPropertySchemaMap } from '../property-schema';
import { ImageHandler } from '../asset-handler/assets/image';
import { SpriteFrameHandler } from '../asset-handler/assets/sprite-frame';
import i18n from '../../base/i18n';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('asset property schema map', () => {
    afterEach(async () => {
        await i18n.setLanguage('en');
    });

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

    it('localizes config-style display fields before returning the property schema', async () => {
        i18n.registerLanguagePatch('en', 'assets.propertySchemaTest', {
            field: 'Localized Field',
            help: 'Localized Help',
            option: 'Localized Option',
        });
        i18n.registerLanguagePatch('zh', 'assets.propertySchemaTest', {
            field: 'ZH Field',
            help: 'ZH Help',
            option: 'ZH Option',
        });

        const config = {
            localized: {
                title: 'i18n:assets.propertySchemaTest.field',
                description: 'i18n:assets.propertySchemaTest.help',
                type: 'string' as const,
                default: 'enabled',
                enum: ['enabled'],
                enumDescriptions: ['i18n:assets.propertySchemaTest.option'],
            },
        };

        await i18n.setLanguage('en');
        expect(createAssetPropertySchemaMap(config).localized).toMatchObject({
            title: 'Localized Field',
            description: 'Localized Help',
            enumDescriptions: ['Localized Option'],
        });

        await i18n.setLanguage('zh');
        expect(createAssetPropertySchemaMap(config).localized).toMatchObject({
            title: 'ZH Field',
            description: 'ZH Help',
            enumDescriptions: ['ZH Option'],
        });
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

    it('keeps built-in property schema i18n keys resolvable', () => {
        const engineAssetsI18n = require('../../../../packages/engine/editor/i18n/en/assets.js');
        const importerI18n = {
            en: JSON.parse(readFileSync(join(__dirname, '../../../../static/i18n/en/importer.json'), 'utf8')),
            zh: JSON.parse(readFileSync(join(__dirname, '../../../../static/i18n/zh/importer.json'), 'utf8')),
        };
        const files = [
            join(__dirname, '../asset-handler/assets/auto-atlas.ts'),
            join(__dirname, '../asset-handler/assets/gltf.ts'),
            join(__dirname, '../asset-handler/assets/fbx.ts'),
            join(__dirname, '../asset-handler/assets/image/index.ts'),
            join(__dirname, '../asset-handler/assets/sprite-frame.ts'),
            join(__dirname, '../asset-handler/assets/texture-base.ts'),
            join(__dirname, '../asset-handler/assets/texture.ts'),
        ];
        const missingKeys: string[] = [];

        for (const file of files) {
            const source = extractPropertySchemaSource(readFileSync(file, 'utf8'));
            for (const match of source.matchAll(/i18n:ENGINE\.([A-Za-z0-9_.]+)/g)) {
                if (readNestedValue(engineAssetsI18n, match[1]) === undefined) {
                    missingKeys.push(match[0]);
                }
            }
            for (const match of source.matchAll(/i18n:importer\.([A-Za-z0-9_.]+)/g)) {
                if (readNestedValue(importerI18n.en, match[1]) === undefined) {
                    missingKeys.push(`${match[0]}#en`);
                }
                if (readNestedValue(importerI18n.zh, match[1]) === undefined) {
                    missingKeys.push(`${match[0]}#zh`);
                }
            }
        }

        expect(missingKeys).toEqual([]);
    });
});

function readNestedValue(value: unknown, key: string): unknown {
    return key.split('.').reduce<unknown>((result, segment) => {
        if (!result || typeof result !== 'object') {
            return undefined;
        }
        return (result as Record<string, unknown>)[segment];
    }, value);
}

function extractPropertySchemaSource(source: string): string {
    const start = [
        source.indexOf('propertySchemaConfig'),
        source.indexOf('userDataConfig'),
        source.indexOf('createTextureBasePropertySchema'),
    ].filter((index) => index >= 0).sort((a, b) => a - b)[0];
    return start === undefined ? source : source.slice(start);
}
