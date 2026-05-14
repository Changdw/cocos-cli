import bundledRenderConfig from '../../engine/features/render-config.json';
import { GlobalPaths } from '../../../global';
import { getEngineRenderConfig } from '../../engine/dynamic-metadata';
import type { IDisplayModuleCache, IFeatureItem, IFlags, IModuleItem, ModuleRenderConfig } from '../../engine/@types/modules';

function isFeatureGroup(moduleItem: IModuleItem): moduleItem is Extract<IModuleItem, { options: Record<string, IFeatureItem> }> {
    return 'options' in moduleItem;
}

function normalizeFlagDefault(value: unknown): boolean | number {
    return typeof value === 'number' ? value : Boolean(value);
}

function collectFlagDefaults(featureItem: Partial<IFeatureItem>): IFlags | undefined {
    const flags = Object.fromEntries(
        Object.entries(featureItem.flags ?? {}).map(([key, flag]) => [
            key,
            normalizeFlagDefault(flag.default),
        ])
    );

    return Object.keys(flags).length ? flags : undefined;
}

function assignFlagDefaults(target: IFlags, flagDefaults?: IFlags) {
    if (!flagDefaults) {
        return;
    }

    for (const [key, value] of Object.entries(flagDefaults)) {
        if (!(key in target)) {
            target[key] = value;
        }
    }
}

function buildDefaultModuleConfig(renderConfig: ModuleRenderConfig): {
    cache: Record<string, IDisplayModuleCache>;
    flags: IFlags;
    includeModules: string[];
} {
    const cache: Record<string, IDisplayModuleCache> = {};
    const flags: IFlags = {};
    const includeModules: string[] = [];

    for (const [featureKey, moduleItem] of Object.entries(renderConfig.features)) {
        if (isFeatureGroup(moduleItem)) {
            let selectedOption: string | undefined;

            for (const [optionKey, optionItem] of Object.entries(moduleItem.options)) {
                const flagDefaults = collectFlagDefaults(optionItem);
                const enabled = Boolean(optionItem.default);

                if (enabled) {
                    includeModules.push(optionKey);
                    selectedOption ??= optionKey;
                }

                assignFlagDefaults(flags, flagDefaults);
                cache[optionKey] = flagDefaults ? {
                    _value: enabled,
                    _flags: flagDefaults,
                } : {
                    _value: enabled,
                };
            }

            cache[featureKey] = selectedOption ? {
                _value: true,
                _option: selectedOption,
            } : {
                _value: false,
            };
            continue;
        }

        const flagDefaults = collectFlagDefaults(moduleItem);
        const enabled = Boolean(moduleItem.default);

        if (enabled) {
            includeModules.push(featureKey);
        }

        assignFlagDefaults(flags, flagDefaults);
        cache[featureKey] = flagDefaults ? {
            _value: enabled,
            _flags: flagDefaults,
        } : {
            _value: enabled,
        };
    }

    return {
        cache,
        flags,
        includeModules,
    };
}

function loadRenderConfig(engineRoot: string): ModuleRenderConfig {
    try {
        return getEngineRenderConfig(engineRoot);
    } catch (error) {
        console.warn('[Project] Failed to load engine render-config from repository, fallback to bundled copy.', error);
        return bundledRenderConfig as unknown as ModuleRenderConfig;
    }
}

export function createDefaultEngineSettings(engineRoot: string = GlobalPaths.enginePath) {
    const moduleDefaults = buildDefaultModuleConfig(loadRenderConfig(engineRoot));

    return {
        '__version__': '1.0.12',
        'modules': {
            'configs': {
                'defaultConfig': {
                    'name': '\u9ed8\u8ba4\u914d\u7f6e',
                    'cache': moduleDefaults.cache,
                    'flags': moduleDefaults.flags,
                    'includeModules': moduleDefaults.includeModules,
                    'noDeprecatedFeatures': {
                        'value': false,
                        'version': ''
                    }
                }
            }
        }
    };
}

export const defaultEngineSettings = createDefaultEngineSettings();

export const defaultProjectSettings = {
    '__version__': '1.0.6',
    'general': {
        'designResolution': {
            'width': 960,
            'height': 640
        }
    },
    'script': {
        'preserveSymlinks': true
    }
};
