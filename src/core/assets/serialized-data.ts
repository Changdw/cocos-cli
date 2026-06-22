'use strict';

declare const cc: any;

import { readJSON } from 'fs-extra';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { deserialize as deserializeAssetSource } from './asset-handler/utils';
import type { IAsset } from './@types/protected';
import type { IAssetInfo } from './@types/public';
import type { IProperty } from '../scene/@types/public';
import assetOperation from './manager/operation';
import assetQuery from './manager/query';
import { serialize as editorSerialize } from '../engine/editor-extends';

export type SerializedAssetDump = Record<string, IProperty> | IProperty;
export type SerializedAssetPatch = SerializedAssetDump | Partial<Record<string, IProperty | unknown>>;

export interface SerializedAssetQueryResult {
    uuid: string;
    url: string;
    type: string;
    importer: string;
    dump: SerializedAssetDump;
}

const SUPPORTED_TYPES = new Set(['cc.PhysicsMaterial', 'cc.RenderPipeline']);

const RENDER_PIPELINE_CHANGE_TYPES: Record<string, { componentKey: string; optionalTypes: string[] }> = {
    _flows: {
        componentKey: 'flow',
        optionalTypes: [],
    },
    _stages: {
        componentKey: 'stage',
        optionalTypes: [],
    },
};

export async function querySerializedData(uuidOrUrlOrPath: string): Promise<SerializedAssetQueryResult> {
    const { asset, assetInfo } = resolveSerializedAsset(uuidOrUrlOrPath);
    const instance = await loadSerializedAssetInstance(asset);

    return {
        uuid: asset.uuid,
        url: assetInfo.url,
        type: assetInfo.type,
        importer: assetInfo.importer,
        dump: await encodeSerializedAssetDump(instance, assetInfo.type),
    };
}

export async function saveSerializedData(
    uuidOrUrlOrPath: string,
    patch: SerializedAssetPatch,
): Promise<SerializedAssetQueryResult> {
    const { asset, assetInfo } = resolveSerializedAsset(uuidOrUrlOrPath);
    const instance = await loadSerializedAssetInstance(asset);
    let normalizedInstance = instance;

    if (assetInfo.type === 'cc.RenderPipeline' && isPropertyLike(patch)) {
        normalizedInstance = createRenderPipelineInstanceIfNeeded(normalizedInstance, patch);
    }

    const currentDump = await encodeSerializedAssetDump(normalizedInstance, assetInfo.type);
    const currentFieldDump = getFieldDumpFromAssetDump(assetInfo.type, currentDump);
    const patchFieldDump = normalizePatchFieldDump(assetInfo.type, currentFieldDump, patch);

    await applyFieldDumpPatch(normalizedInstance, currentFieldDump, patchFieldDump);

    const serialized = getEditorSerialize()(normalizedInstance);
    await assetOperation.saveAsset(asset.uuid, formatSerializedContent(serialized));

    return querySerializedData(asset.uuid);
}

function resolveSerializedAsset(uuidOrUrlOrPath: string): { asset: IAsset; assetInfo: IAssetInfo } {
    const asset = assetQuery.queryAsset(uuidOrUrlOrPath);
    if (!asset) {
        throw new Error(`Serialized asset can not be found: ${uuidOrUrlOrPath}`);
    }

    const assetInfo = assetQuery.encodeAsset(asset);
    if (!SUPPORTED_TYPES.has(assetInfo.type)) {
        throw new Error(`Unsupported serialized asset type: ${assetInfo.type}. Only cc.PhysicsMaterial and cc.RenderPipeline are supported.`);
    }

    if (!asset.source) {
        throw new Error(`Serialized asset has no source file: ${uuidOrUrlOrPath}`);
    }

    return { asset, assetInfo };
}

async function loadSerializedAssetInstance(asset: IAsset): Promise<any> {
    const source = await readJSON(asset.source);
    const instance = deserializeAssetSource(source);
    if (!instance) {
        throw new Error(`Deserialize serialized asset failed: ${asset.url || asset.uuid}`);
    }
    if ('_uuid' in instance) {
        instance._uuid = asset.uuid;
    }
    return instance;
}

async function encodeSerializedAssetDump(instance: any, type: string): Promise<SerializedAssetDump> {
    const { encodeObject } = await loadDumpEncode();

    if (type === 'cc.RenderPipeline') {
        const dump = encodeComponentAsset(instance, modifyRenderPipelineProp, encodeObject);
        return {
            name: 'Pipeline',
            type: instance.constructor.name,
            value: dump,
            visible: true,
            readonly: false,
            optionalTypes: queryRenderComponents('pipeline'),
            path: '',
        };
    }

    return encodeComponentAsset(instance, modifyPropName, encodeObject);
}

function encodeComponentAsset(
    instance: any,
    modifyProp: (prop: IProperty, name?: string) => void,
    encodeObject: (object: any, attributes: any, owner?: any, objectKey?: string, isTemplate?: boolean) => IProperty,
): Record<string, IProperty> {
    const ctor = instance.constructor;
    if (!ctor.__props__) {
        throw new Error(`Serialized asset type has no editable properties: ${ctor.name || 'Unknown'}`);
    }

    const value: Record<string, IProperty> = {};
    ctor.__props__.forEach((key: string) => {
        try {
            if (!(key in instance)) {
                return;
            }
            const attrs = cc.Class.attr(ctor, key);
            const dumpData = encodeObject(instance[key], attrs, instance, key);
            if (dumpData.type !== 'Unknown') {
                value[key] = dumpData;
                modifyProp(value[key], key);
            }
        } catch (error) {
            console.warn(`Asset property dump failed:\n Asset: ${ctor.name}\n Property: ${key}`);
            console.warn(error);
            delete value[key];
        }
    });
    return value;
}

function modifyPropName(prop: IProperty, name?: string) {
    prop.name = name;

    if (prop.value && typeof prop.value === 'object') {
        for (const key in prop.value as Record<string, unknown>) {
            const child = (prop.value as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
                modifyPropName(child as IProperty, key);
            }
        }
    }
}

function modifyRenderPipelineProp(prop: IProperty, name?: string) {
    prop.name = name;

    if (prop.visible === false) {
        return;
    }

    if (prop.value && typeof prop.value === 'object') {
        const changeType = name ? RENDER_PIPELINE_CHANGE_TYPES[name] : undefined;

        if (changeType) {
            changeType.optionalTypes = queryRenderComponents(changeType.componentKey);
        }

        if (prop.isArray && prop.elementTypeData && changeType) {
            modifyRenderPipelineProp(prop.elementTypeData);
            prop.elementTypeData.optionalTypes = changeType.optionalTypes;
        }

        for (const key in prop.value as Record<string, unknown>) {
            const child = (prop.value as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
                modifyRenderPipelineProp(child as IProperty, key);

                if (prop.isArray && changeType) {
                    (child as IProperty).optionalTypes = changeType.optionalTypes;
                }
            }
        }
    }
}

function queryRenderComponents(type: string | undefined = undefined): string[] {
    const editorExtends = (globalThis as any).EditorExtends;
    const menus = editorExtends?.Component?.getMenus?.() || [];
    const prefix = `hidden:render_${type}/`;

    return menus
        .map((item: any) => {
            if (!item?.component || typeof item.menuPath !== 'string') {
                return null;
            }
            if (!item.menuPath.includes(prefix)) {
                return null;
            }
            return item.menuPath.replace(prefix, '');
        })
        .filter(Boolean);
}

function getFieldDumpFromAssetDump(type: string, dump: SerializedAssetDump): Record<string, IProperty> {
    if (type === 'cc.RenderPipeline') {
        if (!isPropertyLike(dump) || !isRecord(dump.value)) {
            throw new Error('Invalid RenderPipeline serialized dump.');
        }
        return dump.value as Record<string, IProperty>;
    }
    return dump as Record<string, IProperty>;
}

function normalizePatchFieldDump(
    type: string,
    currentDump: Record<string, IProperty>,
    patch: SerializedAssetPatch,
): Record<string, IProperty> {
    const patchRecord = type === 'cc.RenderPipeline' && isPropertyLike(patch)
        ? patch.value
        : patch;

    if (!isRecord(patchRecord)) {
        throw new Error('Serialized asset patch must be a dump object.');
    }

    const result: Record<string, IProperty> = {};
    for (const [key, value] of Object.entries(patchRecord)) {
        const current = currentDump[key];
        if (!current) {
            throw new Error(`Unknown serialized field: ${key}`);
        }

        const next = isPropertyLike(value)
            ? cloneDeep(value)
            : {
                ...cloneDeep(current),
                value,
            };

        validatePropertyPatch(key, current, next);
        result[key] = next;
    }
    return result;
}

function validatePropertyPatch(path: string, current: IProperty, next: IProperty) {
    const changed = !isEqual(current.value, next.value);
    if ((current.visible === false || current.readonly === true) && changed) {
        throw new Error(`Serialized field is readonly or hidden and can not be modified: ${path}`);
    }

    if (Array.isArray(current.value) && Array.isArray(next.value)) {
        for (let i = 0; i < next.value.length; i++) {
            const nextChild = next.value[i];
            const currentChild = findCurrentArrayChild(current.value, nextChild, i);
            if (!currentChild) {
                continue;
            }
            if (isPropertyLike(currentChild) && isPropertyLike(nextChild)) {
                validatePropertyPatch(`${path}.${i}`, currentChild, nextChild);
            }
        }
        return;
    }

    if (!isRecord(current.value) || !isRecord(next.value)) {
        return;
    }

    for (const [key, value] of Object.entries(next.value)) {
        const currentChild = current.value[key];
        if (!currentChild) {
            throw new Error(`Unknown serialized field: ${path}.${key}`);
        }
        if (isPropertyLike(currentChild) && isPropertyLike(value)) {
            validatePropertyPatch(`${path}.${key}`, currentChild, value);
        }
    }
}

function findCurrentArrayChild(currentValue: unknown[], nextChild: unknown, index: number): unknown {
    if (isPropertyLike(nextChild) && typeof nextChild.name === 'string') {
        const originalIndex = Number(nextChild.name);
        if (Number.isInteger(originalIndex) && originalIndex >= 0 && originalIndex < currentValue.length) {
            return currentValue[originalIndex];
        }
    }
    return currentValue[index];
}

async function applyFieldDumpPatch(
    instance: any,
    currentDump: Record<string, IProperty>,
    patchDump: Record<string, IProperty>,
) {
    for (const key in patchDump) {
        const current = currentDump[key];
        if (current.visible === false || current.readonly === true) {
            continue;
        }
        await setValue(instance, patchDump, key);
    }
}

async function setValue(prop: any, dump: Record<string, any> | any, key: string) {
    if (!dump) {
        return;
    }

    if (typeof dump !== 'object') {
        if (key === 'uuid' && '_uuid' in prop) {
            prop._uuid = dump;
            return;
        }
        prop[key] = dump;
        return;
    }

    if (!dump[key].isArray) {
        if (dump[key].value === null || typeof dump[key].value !== 'object') {
            prop[key] = dump[key].value;
        } else {
            const names = Object.keys(dump[key].value);
            for (const name of names) {
                if (name === 'uuid') {
                    const uuid = extractUuidValue(dump[key].value[name]);
                    prop[key] = uuid ? createAssetReference(uuid, dump[key].type) : null;
                } else {
                    await setValue(prop[key], dump[key].value, name);
                }
            }
        }
    } else {
        const propKeyAttr = cc.Class.attr(prop.constructor, key);

        if (!Array.isArray(prop[key])) {
            const dumpUtil = await loadDumpUtils();
            prop[key] = dumpUtil.default.ccClassAttrPropertyDefaultValue(propKeyAttr);
        }

        if (!Array.isArray(prop[key])) {
            delete prop[key];
        } else {
            const oldLength = prop[key].length;
            const newLength = Array.isArray(dump[key].value) ? dump[key].value.length : 0;
            if (newLength > oldLength) {
                for (let i = oldLength; i < newLength; i++) {
                    prop[key][i] = await createValueForDumpItem(dump[key].value[i]);
                    await setValue(prop[key], dump[key].value, i.toString());
                }
            } else if (newLength < oldLength) {
                while (prop[key].length > newLength) {
                    prop[key].pop();
                }
            } else if (oldLength) {
                const arrayClone = prop[key].slice();
                prop[key] = [];
                for (let i = 0; i < oldLength; i++) {
                    if (dump[key].value[i] === undefined) {
                        continue;
                    }
                    prop[key][i] = arrayClone[dump[key].value[i].name];
                }
            }

            for (let i = 0; i < prop[key].length; i++) {
                const itemDump = dump[key].value[i];
                if (itemDump?.type && (!prop[key][i] || itemDump.type !== prop[key][i].constructor.name)) {
                    const typeClass = cc.js.getClassByName(itemDump.type);
                    if (typeClass) {
                        prop[key][i] = new typeClass();
                    }
                }

                await setValue(prop[key], dump[key].value, i.toString());
            }
        }
    }
}

async function createValueForDumpItem(itemDump: IProperty) {
    if (!itemDump?.type) {
        return null;
    }

    const typeClass = cc.js.getClassByName(itemDump.type);
    if (typeClass) {
        return new typeClass();
    }

    const assetDumpUtil = await loadAssetDumpUtil();
    return assetDumpUtil.default.getDefaultValue(itemDump.type);
}

function createRenderPipelineInstanceIfNeeded(instance: any, patch: IProperty) {
    if (!patch.type || instance.constructor.name === patch.type) {
        return instance;
    }

    const ctor = cc.js.getClassByName(patch.type);
    if (!ctor) {
        throw new Error(`RenderPipeline type can not be found: ${patch.type}`);
    }

    const next = new ctor();
    if ('_uuid' in next && '_uuid' in instance) {
        next._uuid = instance._uuid;
    }
    return next;
}

function extractUuidValue(value: unknown): string {
    if (isPropertyLike(value)) {
        return typeof value.value === 'string' ? value.value : '';
    }
    return typeof value === 'string' ? value : '';
}

function createAssetReference(uuid: string, type?: string) {
    const ctor = type ? cc.js.getClassByName(type) : undefined;
    return getEditorSerialize().asAsset(uuid, ctor);
}

function getEditorSerialize() {
    const serialize = (globalThis as any).EditorExtends?.serialize || editorSerialize;
    if (!serialize) {
        throw new Error('EditorExtends.serialize is not initialized.');
    }
    return serialize;
}

function formatSerializedContent(serialized: string | object) {
    return typeof serialized === 'string'
        ? serialized
        : JSON.stringify(serialized, null, 4);
}

function isPropertyLike(value: unknown): value is IProperty {
    return isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value');
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

let dumpEncodeModule: Promise<typeof import('../scene/scene-process/service/dump/encode')> | undefined;
function loadDumpEncode() {
    dumpEncodeModule = dumpEncodeModule || import('../scene/scene-process/service/dump/encode');
    return dumpEncodeModule;
}

let dumpUtilsModule: Promise<typeof import('../scene/scene-process/service/dump/utils')> | undefined;
function loadDumpUtils() {
    dumpUtilsModule = dumpUtilsModule || import('../scene/scene-process/service/dump/utils');
    return dumpUtilsModule;
}

let assetDumpUtilModule: Promise<typeof import('../scene/scene-process/service/dump/asset')> | undefined;
function loadAssetDumpUtil() {
    assetDumpUtilModule = assetDumpUtilModule || import('../scene/scene-process/service/dump/asset');
    return assetDumpUtilModule;
}
