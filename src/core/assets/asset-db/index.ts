'use strict';

import { AssetDBOptions, AssetDB, map } from './libs/asset-db';
import { isSubPath, nameToId } from './libs/utils';

/**
 * 创建一个新的资源数据库
 * @param options 
 */
export function create(options: AssetDBOptions) {
    const database = new AssetDB(options);
    return database;
}

/**
 * 循环每一个数据库
 * @param handler 
 */
export function forEach(handler: (db: AssetDB) => void) {
    Object.keys(map).forEach((name) => {
        handler(map[name]);
    });
}

export {
    setDefaultUserData,
} from './libs/default-meta';

export {
    Importer,
} from './libs/importer';

export {
    Asset,
    VirtualAsset,
} from './libs/asset';

export {
    AssetDB,
} from './libs/asset-db';

export const Utils = {
    nameToId,
    isSubPath,
};

export {
    get,
    queryAsset,
    queryMissingInfo,
    queryUrl,
    queryPath,
    queryUUID,
    reimport,
    refresh,
} from './libs/manager';
