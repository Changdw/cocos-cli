import type { AssetPropertySchema, AssetPropertySchemaMap, AssetPropertySchemaOption } from './@types/public';
import type { IUerDataConfigItem } from './@types/protected';
import {
    createTitleFromKey,
    normalizeDisplayText,
    translateMetadataText,
} from '../configuration/script/metadata';

type LegacyConfigItem = IUerDataConfigItem & {
    assetType?: string;
    labelI18nKey?: string;
    descriptionI18nKey?: string;
    readOnly?: boolean;
    readonly?: boolean;
    order?: number;
};

type LegacyOption = AssetPropertySchemaOption & {
    labelI18nKey?: string;
};

type LegacyRenderAttributes = Record<string, string | boolean | number>;

const UI_TYPE_MAP: Record<string, AssetPropertySchema['type']> = {
    'ui-checkbox': 'boolean',
    'ui-number-input': 'number',
    'ui-num-input': 'number',
    'ui-slider': 'number',
    'ui-input': 'string',
    'ui-textarea': 'string',
    'ui-select': 'enum',
    'ui-asset': 'asset',
    'ui-asset-picker': 'asset',
};

export function convertUserDataConfigToPropertySchema(
    config: Record<string, IUerDataConfigItem> | undefined
): AssetPropertySchemaMap {
    const result: AssetPropertySchemaMap = {};
    if (!config) {
        return result;
    }

    for (const [key, item] of Object.entries(config)) {
        const fieldName = item.key || key;
        result[fieldName] = convertUserDataConfigItemToPropertySchema(fieldName, item);
    }

    return result;
}

export function mergeUserDataConfigForPropertySchema(
    runtimeConfig: Record<string, IUerDataConfigItem> | undefined,
    schemaOnlyConfig: Record<string, IUerDataConfigItem> | undefined
): Record<string, IUerDataConfigItem> | undefined {
    if (!runtimeConfig && !schemaOnlyConfig) {
        return undefined;
    }

    return {
        ...(runtimeConfig ?? {}),
        ...(schemaOnlyConfig ?? {}),
    };
}

export function convertUserDataConfigItemToPropertySchema(
    key: string,
    item: IUerDataConfigItem
): AssetPropertySchema {
    const legacyItem = item as LegacyConfigItem;
    const attributes = item.render?.attributes;
    const label = resolveDisplayText(item.label, legacyItem.labelI18nKey, createTitleFromKey(key));
    const schema: AssetPropertySchema = {
        label: label.text,
        type: inferSchemaType(item),
        raw: item,
    };
    if (label.i18nKey) {
        schema.labelI18nKey = label.i18nKey;
    }

    const description = resolveOptionalDisplayText(item.description, legacyItem.descriptionI18nKey);
    if (description.text) {
        schema.description = description.text;
    }
    if (description.i18nKey) {
        schema.descriptionI18nKey = description.i18nKey;
    }

    if (item.default !== undefined) {
        schema.default = item.default;
    }

    const options = convertOptions(item, schema.default);
    if (options.length) {
        schema.options = options;
        schema.type = 'enum';
    }

    const assetType = readStringAttribute(attributes, 'assetType') ?? legacyItem.assetType;
    if (assetType) {
        schema.type = 'asset';
        schema.assetType = assetType;
    }

    const min = readNumberAttribute(attributes, 'min') ?? readNumberAttribute(attributes, 'minimum');
    if (min !== undefined) {
        schema.min = min;
    }

    const max = readNumberAttribute(attributes, 'max') ?? readNumberAttribute(attributes, 'maximum');
    if (max !== undefined) {
        schema.max = max;
    }

    const step = readNumberAttribute(attributes, 'step');
    if (step !== undefined) {
        schema.step = step;
    }

    const readOnly = readBooleanAttribute(attributes, 'readOnly')
        ?? readBooleanAttribute(attributes, 'readonly')
        ?? legacyItem.readOnly
        ?? legacyItem.readonly;
    if (readOnly !== undefined) {
        schema.readOnly = readOnly;
    }

    const order = readNumberAttribute(attributes, 'order') ?? legacyItem.order;
    if (order !== undefined) {
        schema.order = order;
    }

    applyNestedConfig(schema, item);

    return schema;
}

function inferSchemaType(item: IUerDataConfigItem): AssetPropertySchema['type'] {
    if (item.type === 'array' || item.type === 'object') {
        return item.type;
    }

    const uiType = item.render?.ui?.toLowerCase();
    if (uiType && UI_TYPE_MAP[uiType]) {
        return UI_TYPE_MAP[uiType];
    }

    const value = item.default;
    if (Array.isArray(value)) {
        return 'array';
    }

    if (value !== null && typeof value === 'object') {
        return 'object';
    }

    if (typeof value === 'number') {
        return 'number';
    }

    if (typeof value === 'boolean') {
        return 'boolean';
    }

    return 'string';
}

function convertOptions(item: IUerDataConfigItem, defaultValue: unknown): AssetPropertySchemaOption[] {
    return (item.render?.items ?? []).map((option) => {
        const legacyOption = option as LegacyOption;
        const label = resolveDisplayText(option.label, legacyOption.labelI18nKey, String(option.value));
        const schemaOption: AssetPropertySchemaOption = {
            label: label.text,
            value: normalizeOptionValue(option.value, defaultValue),
        };
        if (label.i18nKey) {
            schemaOption.labelI18nKey = label.i18nKey;
        }
        return schemaOption;
    });
}

function resolveDisplayText(value: string | undefined, i18nKey: string | undefined, fallback: string): {
    text: string;
    i18nKey?: string;
} {
    const rawI18nKey = getI18nKey(i18nKey) ?? getI18nKey(value);
    if (rawI18nKey) {
        return {
            text: translateMetadataText(rawI18nKey, getPlainDisplayText(value) ?? fallback) ?? fallback,
            i18nKey: rawI18nKey,
        };
    }
    return {
        text: normalizeDisplayText(value, fallback),
    };
}

function resolveOptionalDisplayText(value: string | undefined, i18nKey: string | undefined): {
    text?: string;
    i18nKey?: string;
} {
    const rawI18nKey = getI18nKey(i18nKey) ?? getI18nKey(value);
    if (rawI18nKey) {
        return {
            text: translateMetadataText(rawI18nKey, getPlainDisplayText(value)),
            i18nKey: rawI18nKey,
        };
    }
    return {
        text: translateMetadataText(value),
    };
}

function getPlainDisplayText(value: string | undefined): string | undefined {
    return value && !getI18nKey(value) ? value : undefined;
}

function getI18nKey(value: string | undefined): string | undefined {
    return value?.startsWith('i18n:') ? value : undefined;
}

function normalizeOptionValue(value: string | number | boolean, defaultValue: unknown): string | number | boolean {
    if (typeof value !== 'string') {
        return value;
    }

    if (typeof defaultValue === 'boolean') {
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
    }

    if (typeof defaultValue === 'number') {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) {
            return numericValue;
        }
    }

    return value;
}

function applyNestedConfig(schema: AssetPropertySchema, item: IUerDataConfigItem): void {
    const { itemConfigs } = item;
    if (!itemConfigs) {
        return;
    }

    if (Array.isArray(itemConfigs)) {
        const children = itemConfigs.map((child, index) => (
            convertUserDataConfigItemToPropertySchema(child.key || String(index), child)
        ));
        if (schema.type === 'array') {
            schema.items = children.length === 1 ? children[0] : children;
        } else {
            schema.type = 'object';
            schema.properties = Object.fromEntries(children.map((child, index) => [itemConfigs[index].key || String(index), child]));
        }
        return;
    }

    const children = convertUserDataConfigToPropertySchema(itemConfigs);
    if (schema.type === 'array') {
        schema.items = {
            label: 'Item',
            type: 'object',
            default: {},
            properties: children,
        };
        return;
    }

    schema.type = 'object';
    schema.properties = children;
}

function readStringAttribute(attributes: LegacyRenderAttributes | undefined, name: string): string | undefined {
    const value = attributes?.[name];
    return typeof value === 'string' && value ? value : undefined;
}

function readNumberAttribute(attributes: LegacyRenderAttributes | undefined, name: string): number | undefined {
    const value = attributes?.[name];
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value !== '') {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : undefined;
    }
    return undefined;
}

function readBooleanAttribute(attributes: LegacyRenderAttributes | undefined, name: string): boolean | undefined {
    const value = attributes?.[name];
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return undefined;
}
