import { Asset, VirtualAsset } from '@cocos/asset-db';
import { CCON } from 'cc/editor/serialization';
export type IAssetEvent = 'asset-add' | 'asset-change' | 'asset-delete';
export type IAssetEventCallback = (asset: IAsset) => void;
export interface IExportData {
    import: {
        type: 'buffer' | 'json';
        path: string;
    };
    // 例如 { 'test.font': 'test.font' }
    native?: Record<string, string>;
}

/**
 * 资源变更信息
 */
export interface IAssetChangeInfo {
    uuid: string;
    name: string;
    type: string;
    url: string;    // 逻辑路径，例如 db://assets/image.png
    source: string;  // 物理路径，例如 D:\project\assets\image.png
}

/**
 * AssetManager 事件类型定义
 */
export interface AssetManagerEvents {
    'asset-add': (asset: IAsset) => void;
    'asset-change': (asset: IAsset) => void;
    'asset-delete': (asset: IAsset) => void;
    'onAssetAdded': (info: IAssetChangeInfo) => void;
    'onAssetChanged': (info: IAssetChangeInfo) => void;
    'onAssetRemoved': (info: IAssetChangeInfo) => void;
}

export * from '../public';
export * from './plugin';

export class VirtualAsset extends VirtualAsset {
    /**
     * 获取资源的导出数据
     */
    getData: (name: 'output') => IExportData;
    setData: (name: 'output', data: IExportData) => void;
}

export class Asset extends Asset, IVirtualAsset { };

export type IAsset = VirtualAsset | Asset;

export type QueryAssetType = 'asset' | 'script' | 'all';

export interface ISerializedOptions {
    debug: boolean;
    _exporting?: boolean;
    dontStripDefault?: boolean;
}

export type SerializedAsset = string | object | CCON;
