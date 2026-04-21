import lodash from 'lodash';
import type { IBuildCacheUseConfig } from '../@types';
import type { ICocosConfigurationNode, IConfigurationItem } from '../../configuration/script/metadata';
import {
    convertConfigItem,
    createNode,
    hasConfigItemShape,
    objectSchema,
    translateMetadataText,
} from '../../configuration/script/metadata';

interface IBuilderMetadataSource {
    commonOptionConfigs: Record<string, IConfigurationItem>;
    useCacheDefaults: IBuildCacheUseConfig;
    commonOptionConfig: Record<string, Record<string, IConfigurationItem>>;
    configMap: Record<string, Record<string, {
        displayName?: string;
        options?: Record<string, IConfigurationItem>;
    }>>;
    platformTitles: Record<string, string>;
}

export function createBuilderCoreMetadataNodes(
    commonOptionConfigs: Record<string, IConfigurationItem>,
    useCacheDefaults: IBuildCacheUseConfig
): ICocosConfigurationNode[] {
    return [
        createBuilderCommonNode(commonOptionConfigs, 11),
        createBuilderUseCacheNode(useCacheDefaults, 12),
    ];
}

export function createBuilderPlatformMetadataNodes(
    platform: string,
    source: IBuilderMetadataSource,
    order = 20
): ICocosConfigurationNode[] {
    const node = createBuilderPlatformNode(platform, source, order);
    return node ? [node] : [];
}

export function createBuilderMetadataNodes(source: IBuilderMetadataSource): ICocosConfigurationNode[] {
    const nodes: ICocosConfigurationNode[] = createBuilderCoreMetadataNodes(
        source.commonOptionConfigs,
        source.useCacheDefaults
    );

    const registeredPlatforms = Object.keys(source.configMap);
    registeredPlatforms.forEach((platform, index) => {
        nodes.push(...createBuilderPlatformMetadataNodes(platform, source, 20 + index));
    });

    return nodes;
}

function createBuilderCommonNode(
    commonOptionConfigs: Record<string, IConfigurationItem>,
    order: number
): ICocosConfigurationNode {
    const properties: Record<string, ReturnType<typeof convertConfigItem>> = {};

    for (const [key, item] of Object.entries(commonOptionConfigs)) {
        if (hasConfigItemShape(item)) {
            properties[`builder.common.${key}`] = convertConfigItem(item, key);
        }
    }

    return createNode('builder.common', 'i18n:configuration.builder.common.title', 'builder', properties, order);
}

function createBuilderUseCacheNode(
    defaults: IBuildCacheUseConfig,
    order: number
): ICocosConfigurationNode {
    return createNode('builder.useCacheConfig', 'i18n:configuration.builder.useCache.title', 'builder', {
        'builder.useCacheConfig.serializeData': {
            type: 'boolean',
            default: defaults.serializeData,
            title: 'i18n:configuration.builder.useCache.serializeData.title',
        },
        'builder.useCacheConfig.engine': {
            type: 'boolean',
            default: defaults.engine,
            title: 'i18n:configuration.builder.useCache.engine.title',
        },
        'builder.useCacheConfig.textureCompress': {
            type: 'boolean',
            default: defaults.textureCompress,
            title: 'i18n:configuration.builder.useCache.textureCompress.title',
        },
        'builder.useCacheConfig.autoAtlas': {
            type: 'boolean',
            default: defaults.autoAtlas,
            title: 'i18n:configuration.builder.useCache.autoAtlas.title',
        },
    }, order);
}

function createBuilderPlatformNode(
    platform: string,
    source: IBuilderMetadataSource,
    order: number
): ICocosConfigurationNode | undefined {
    const configs = source.configMap[platform];
    if (!configs || !Object.keys(configs).length) {
        return undefined;
    }

    const properties: Record<string, ReturnType<typeof objectSchema> | ReturnType<typeof convertConfigItem>> = {
        [`builder.platforms.${platform}.outputName`]: {
            type: 'string',
            default: platform,
            title: 'i18n:configuration.builder.platform.outputName.title',
        },
    };

    for (const [pkgName, config] of Object.entries(configs)) {
        const mergedCommonOptions = lodash.defaultsDeep(
            {},
            source.commonOptionConfig[platform] ?? {},
            source.commonOptionConfigs
        ) as Record<string, IConfigurationItem>;

        const packageProperties: Record<string, ReturnType<typeof convertConfigItem>> = {};
        for (const [key, item] of Object.entries(mergedCommonOptions)) {
            if (hasConfigItemShape(item)) {
                packageProperties[key] = convertConfigItem(item, key);
            }
        }

        for (const [key, item] of Object.entries(config.options ?? {})) {
            if (hasConfigItemShape(item)) {
                packageProperties[key] = convertConfigItem(item, key);
            }
        }

        if (packageProperties.platform) {
            packageProperties.platform.default = platform;
        }

        if (packageProperties.outputName) {
            packageProperties.outputName.default = platform;
        }

        properties[`builder.platforms.${platform}.packages.${pkgName}`] = objectSchema(packageProperties, {
            title: 'i18n:configuration.builder.platform.packageOptions.title',
        });
    }

    const platformTitle = translateMetadataText(source.platformTitles[platform], platform) ?? platform;
    const configSuffix = translateMetadataText('i18n:configuration.builder.platform.configSuffix')
        ?? 'Platform Config';

    return createNode(
        `builder.platforms.${platform}`,
        `${platformTitle} ${configSuffix}`,
        'builder',
        properties,
        order
    );
}
