'use strict';
import * as assetdb from '../asset-db/index';
import EventEmitter from 'events';
import { ensureDirSync, existsSync } from 'fs-extra';
import { extname, join, relative } from 'path';
import { AssetDBRegisterInfo, IAsset, IAssetDBInfo, IAssetWorkerInfo, PackageRegisterInfo } from '../../@types/private';
import { newConsole } from '../console';
import { decidePromiseState, PROMISE_STATE } from '../utils';
import pluginManager from './plugin';
import { assetHandlerManager } from './asset-handler-manager';

const AssetDBPriority: Record<string, number> = {
    internal: 99,
    assets: 98,
};

interface IStartupDatabaseHandleInfo {
    name: string;
    afterPreImportResolve: Function;
    finish?: Function;
}

type RefreshState = 'free' | 'busy' | 'wait';

interface IWaitingTask {
    func: Function;
    args: any[];
    resolve?: Function;
}

interface IWaitingTaskInfo {
    func: Function;
    args: any[];
    resolves?: Function[];
}

/**
 * 总管理器，管理整个资源进程的启动流程、以及一些子管理器的启动流程
 */
export class AssetDBManager extends EventEmitter {
    public assetDBMap: Record<string, assetdb.AssetDB> = {};
    public globalInternalLibrary = false;

    private hasPause = false;
    private startPause = false;
    public get isPause() {
        return this.hasPause || this.startPause;
    }
    public ready = false;
    private waitPauseHandle?: Function;
    private waitPausePromiseTask?: Promise<boolean>;
    private state: RefreshState = 'free';
    public assetDBInfo: Record<string, IAssetDBInfo> = {};
    static useCache = false;
    private waitingTaskQueue: IWaitingTaskInfo[] = [];
    private waitingRefreshAsset: string[] = [];
    private autoRefreshTimer?: NodeJS.Timeout;
    private get assetBusy() {
        return this.assetBusyTask.size > 0;
    }
    private reimportCheck = false;
    private assetBusyTask = new Set();
    private pluginManager = pluginManager;
    private assetHandlerManager = assetHandlerManager;

    static libraryRoot = join(Editor.Project.path, 'library');

    get free() {
        return this.ready && !this.isPause && this.state !== 'free' && !this.assetBusy;
    }

    /**
     * 初始化，需要优先调用
     * @param info 
     */
    async init(info: IAssetWorkerInfo) {
        newConsole.trackMemoryStart('asset-db:worker-init: initEngine');
        await initEngine(info);
        newConsole.trackMemoryEnd('asset-db:worker-init: initEngine');

        AssetDBManager.useCache = await Editor.Profile.getConfig('asset-db', 'restoreAssetDBFromCache');
        if (AssetDBManager.useCache && Editor.App.version !== await Editor.Project.__protected__.getLastEditorVersion()) {
            AssetDBManager.useCache = false;
            console.log(Editor.I18n.t('asset-db.restoreAssetDBFromCacheInValid.upgrade'));
        }

        if (AssetDBManager.useCache && !existsSync(AssetDBManager.libraryRoot)) {
            AssetDBManager.useCache = false;
            console.log(Editor.I18n.t('asset-db.restoreAssetDBFromCacheInValid.noLibraryPath'));
        }

        Editor.Profile.__protected__.on('change', (protocol: string, file: string, key: string, value: any) => {
            if (protocol === 'local' || protocol === 'global' || protocol === 'project') {
                const name = this.pluginManager.assetDBProfileMap[`${file}(${key})`];
                if (name && this.ready) {
                    if (value) {
                        const info = this.pluginManager.getAssetDBInfo(name);
                        if (!info) {
                            return;
                        }
                        this.assetDBInfo[info.name] = patchAssetDBInfo(info);
                        this.startDB(this.assetDBInfo[name]);
                    } else {
                        this._removeDB(name);
                    }
                }
            }
        });
        Editor.Task.__protected__.updateSyncTask(
            'import-asset',
            'init asset-db ...',
        );
        await this.pluginManager.init();
        await this.pluginManager.runHook('beforeInit', [info]);
        await this.assetHandlerManager.init();

        this.reimportCheck = await Editor.Profile.getConfig('asset-db', 'flagReimportCheck');
        const internalConfig: AssetDBRegisterInfo = {
            name: 'internal',
            target: join(info.engine, './editor/assets'),
            readonly: !Editor.App.dev,
            visible: true,
            ignoreGlob: '',
        };

        // 开启全局 internal library 缓存后，修改 internal 默认的导入地址
        this.globalInternalLibrary = await Editor.Profile.getConfig('asset-db', 'globalInternalLibrary');
        if (this.globalInternalLibrary) {
            internalConfig.library = join(Editor.App.temp, 'asset-db', 'library');
            internalConfig.temp = join(Editor.App.temp, 'asset-db', 'temp');
        }
        // 初始化所有即将启动 db 的配置信息
        this.assetDBInfo.internal = patchAssetDBInfo(internalConfig);
        const ignoreGlob = await Editor.Profile.getConfig('asset-db', 'ignoreGlob');
        this.assetDBInfo.assets = patchAssetDBInfo({
            name: 'assets',
            target: join(Editor.Project.path, 'assets'),
            readonly: false,
            visible: true,
            ignoreGlob,
        });
        // 启动插件注册的数据库
        const packageAssetDBInfo = await this.pluginManager.queryAssetDBInfos();
        this.pluginManager.on('enable', async (name: string, registerInfo: PackageRegisterInfo) => {
            registerInfo.assetHandlerInfos && this.assetHandlerManager.register(name, registerInfo.assetHandlerInfos, registerInfo.internal);
            const info = await this.pluginManager.queryAssetDBInfo(name);
            if (!info) {
                return;
            }
            console.debug(`start custom db ${info.name}...`);
            this.addDB(info);
        });
        this.pluginManager.on('disabled', async (name: string, registerInfo: PackageRegisterInfo) => {
            registerInfo.assetHandlerInfos && this.assetHandlerManager.unregister(name, registerInfo.assetHandlerInfos);
            await this._removeDB(name);
        });
        for (const info of packageAssetDBInfo) {
            this.assetDBInfo[info.name] = patchAssetDBInfo(info);
        }
        await this.pluginManager.runHook('afterInit', [info]);
    }

    /**
     * 启动数据库入口
     */
    async start() {
        Editor.Metrics.trackTimeStart('asset-db:start-database');

        if (AssetDBManager.useCache) {
            await this._startFromCache();
        } else {
            await this._start();
        }
        await this.pluginManager.runHook('beforeReady');
        this.ready = true;
        Editor.Metrics.trackTimeEnd('asset-db:start-database', { output: true });
        // 性能测试: 资源冷导入
        Editor.Metrics.trackTimeEnd('asset-db:ready', { output: true });
        Editor.Message.broadcast('asset-db:ready');
        await this.pluginManager.runHook('afterReady');
        // 启动成功后，开始加载尚未注册的资源处理器
        this.assetHandlerManager.activateRegisterAll();

        this.step();
        // 启动成功后开始再去做一些缓存清理
        newConsole.clearAuto();
    }

    /**
     * 首次启动数据库
     */
    private async _start() {
        newConsole.trackMemoryStart('asset-db:worker-init: preStart');
        // 目前专为脚本系统设计的钩子函数：beforePreStart，afterPreStart ，不对外
        await this.pluginManager.runHook('beforePreStart', [this.assetDBInfo]);
        const assetDBNames = Object.keys(this.assetDBInfo).sort((a, b) => (AssetDBPriority[b] || 0) - (AssetDBPriority[a] || 0));
        const startupDatabaseQueue: IStartupDatabaseHandleInfo[] = [];
        for (const assetDBName of assetDBNames) {
            const db = await this._createDB(this.assetDBInfo[assetDBName]);
            await this.pluginManager.runHook('beforeStartDB', [this.assetDBInfo[assetDBName]]);
            const waitingStartupDBInfo = await this._preStartDB(db);
            startupDatabaseQueue.push(waitingStartupDBInfo);
        }
        await this.pluginManager.runHook('afterPreStart', [this.assetDBInfo]);
        newConsole.trackMemoryEnd('asset-db:worker-init: preStart');

        newConsole.trackMemoryStart('asset-db:worker-init: startup');
        for (let i = 0; i < startupDatabaseQueue.length; i++) {
            const startupDatabase = startupDatabaseQueue[i];
            await this._startupDB(startupDatabase);
            await this.pluginManager.runHook('afterStartDB', [this.assetDBInfo[startupDatabase.name]]);
        }
        newConsole.trackMemoryEnd('asset-db:worker-init: startup');
    }

    /**
     * 从缓存启动数据库，如果恢复失败会回退到原始的启动流程
     */
    private async _startFromCache() {
        console.debug('try start all assetDB from cache...');
        const assetDBNames = Object.keys(this.assetDBInfo).sort((a, b) => (AssetDBPriority[b] || 0) - (AssetDBPriority[a] || 0));
        // 目前专为脚本系统设计的钩子函数：beforePreStart，afterPreStart ，不对外
        await this.pluginManager.runHook('beforePreStart', [this.assetDBInfo]);
        for (const assetDBName of assetDBNames) {
            const db = await this._createDB(this.assetDBInfo[assetDBName]);
            if (existsSync(db.cachePath)) {
                try {
                    await db.startWithCache();
                    this.assetDBInfo[assetDBName].state = 'startup';
                    this.emit('db-started', db);
                    console.debug(`start db ${assetDBName} with cache success`);
                    Editor.Message.broadcast('asset-db:db-ready', assetDBName);
                    continue;
                } catch (error) {
                    console.error(error);
                    console.warn(`start db ${assetDBName} with cache failed, try to start db ${assetDBName} without cache`);
                }
            }

            // 没有正常走完缓存恢复，走普通的启动流程
            const waitingStartupDBInfo = await this._preStartDB(db);
            await this._startupDB(waitingStartupDBInfo);
        }
        await this.pluginManager.runHook('afterPreStart', [this.assetDBInfo]);
    }

    public isBusy() {
        for (const name in this.assetDBMap) {
            if (!this.assetDBMap[name]) {
                continue;
            }
            const db = this.assetDBMap[name];
            if (db.assetProgressInfo.wait > 0) {
                return true;
            }
        }
        return false;
    }

    public hasDB(name: string) {
        return !!this.assetDBMap[name];
    }

    private async startDB(info: IAssetDBInfo) {
        if (this.hasDB(info.name)) {
            return;
        }
        await this._createDB(info);
        await this.pluginManager.runHook('beforeStartDB', [info]);
        await this._startDB(info.name);
        await this.pluginManager.runHook('afterStartDB', [info]);
        Editor.Message.broadcast('asset-db:db-ready', info.name);
    }

    /**
     * 将一个绝对路径，转成 url 地址
     * @param path
     * @param dbName 可选
     */
    public path2url(path: string, dbName?: string): string {
        // 否则会出现返回 'db://internal/../../../../../db:/internal' 的情况
        if (path === `db://${name}`) {
            return path;
        }
        let database;
        if (!dbName) {
            database = Object.values(assetDBManager.assetDBMap).find((db) => Editor.Utils.Path.contains(db.options.target, path));
        } else {
            database = assetDBManager.assetDBMap[dbName];
        }
        if (!database) {
            console.error(`Can not find asset db with asset path: ${path}`);
            return path;
        }

        // 将 windows 上的 \ 转成 /，统一成 url 格式
        let _path = relative(database.options.target, path);
        _path = _path.replace(/\\/g, '/');

        return `db://${database.options.name}/${_path}`;
    }

    private async _createDB(info: IAssetDBInfo) {
        // 编辑器目录下的数据库地址，统一做转换处理，否则内置插件将无法使用此功能
        if (info.target.includes('app.asar') && Editor.Utils.Path.contains(Editor.App.path, info.target)) {
            const newTarget = info.target.replace('app.asar', 'app.asar.unpacked');
            if (existsSync(newTarget)) {
                info.target = newTarget;
            } else {
                // 包含 asar 的自定义数据库，可能会导致一些问题，需要提示移动到 unpack 目录
                console.warn(`[asset-db] The current database address(${info.target}) is in the installation package and may cause problems, please move to the unpack directory`);
            }
        }
        ensureDirSync(info.library);
        ensureDirSync(info.temp);
        // TODO 目标数据库地址为空的时候，其实无需走后续完整的启动流程，可以考虑优化
        ensureDirSync(info.target);
        info.flags = {
            reimportCheck: this.reimportCheck,
        };
        const db = assetdb.create(info);
        this.assetDBMap[info.name] = db;
        // 判断项目类型，加载对应的 importer
        await this.pluginManager.registerImporterList(db);
        const rawFind: Function = db.importerManager.find;
        db.importerManager.find = async (asset: IAsset) => {
            let importer = await this.assetHandlerManager.findImporter(asset, true);
            if (importer) {
                return importer;
            }
            // HACK 为了兼容旧版本的导入器
            importer = await rawFind.call(db.importerManager, asset);
            if (importer && importer.name !== '*') {
                return importer;
            }
            const newImporter = await this.assetHandlerManager.getDefaultImporter(asset);
            return newImporter || importer;
        };
        this.emit('db-created', db);
        return db;
    }

    /**
     * 预启动 db, 需要与 _startupDB 搭配使用，请勿单独调用
     * @param db 
     * @returns 
     */
    private async _preStartDB(db: assetdb.AssetDB) {
        const hooks: Record<string, Function> = {
            afterScan,
        };
        // HACK 目前因为一些特殊的导入需求，将 db 启动流程强制分成了两次
        return await new Promise<IStartupDatabaseHandleInfo>(async (resolve, reject) => {
            const handleInfo: IStartupDatabaseHandleInfo = {
                name: db.options.name,
                afterPreImportResolve: () => {
                    console.error(`Start database ${db.options.name} failed!`);
                    // 防止意外情况下，资源进程卡死无任何信息
                    handleInfo.finish && handleInfo.finish();
                },
            };
            // HACK 1/3 启动数据库时，不导入全部资源，先把预导入资源导入完成后进入等待状态
            hooks.afterPreImport = async () => {
                await afterPreImport(db);
                console.debug(`Preimport db ${name} success`);
                resolve(handleInfo);
                return new Promise((resolve) => {
                    handleInfo.afterPreImportResolve = resolve;
                });
            };
            hooks.afterStart = () => {
                handleInfo.finish && handleInfo.finish();
            };
            db.start({
                hooks,
            }).catch((error) => {
                reject(error);
            });
            this.assetDBInfo[db.options.name].state = 'start';
        });
    }

    /**
     * 完全启动之前预启动的 db ，请勿单独调用
     * @param startupDatabase 
     */
    private async _startupDB(startupDatabase: IStartupDatabaseHandleInfo) {
        console.debug(`Start up the '${startupDatabase.name}' database...`);
        Editor.Metrics.trackTimeStart(`asset-db: startup '${startupDatabase.name}' database...`);
        // 2/3 结束 afterPreImport 预留的等待状态，正常进入资源的导入流程,标记 finish 作为结束判断
        await new Promise(async (resolve) => {
            startupDatabase.finish = resolve;
            startupDatabase.afterPreImportResolve();
        });
        Editor.Metrics.trackTimeEnd(`asset-db:worker-startup-database[${startupDatabase.name}]`, { output: true });
        newConsole.trackMemoryEnd(`asset-db:worker-startup-database[${startupDatabase.name}]`);

        this.assetDBInfo[startupDatabase.name].state = 'startup';
        const db = this.assetDBMap[startupDatabase.name];
        this.emit('db-started', db);
        Editor.Metrics.trackTimeEnd(`asset-db: startup '${startupDatabase.name}' database...`);
    }

    /**
     * 启动某个指定数据库
     * @param name 
     */
    public async _startDB(name: string) {
        const db = this.assetDBMap[name];
        Editor.Metrics.trackTimeStart(`asset-db:worker-startup-database[${db.options.name}]`);
        newConsole.trackMemoryStart(`asset-db:worker-startup-database[${db.options.name}]`);
        this.assetDBInfo[name].state = 'start';

        const preImporterHandler = getPreImporterHandler(this.assetDBInfo[name].preImportExtList);
        if (preImporterHandler) {
            db.preImporterHandler = preImporterHandler;
        }
        const hooks: Record<string, Function> = {
            afterScan,
        };

        hooks.afterPreImport = async () => {
            await afterPreImport(db);
        };
        console.debug(`start asset-db(${name})...`);
        await db.start({
            hooks,
        });
        this.assetDBInfo[name].state = 'startup';
        this.emit('db-started', db);
        Editor.Metrics.trackTimeEnd(`asset-db:worker-startup-database[${db.options.name}]`, { output: true });
        newConsole.trackMemoryEnd(`asset-db:worker-startup-database[${db.options.name}]`);
        return;
    }

    /**
     * 添加某个 asset db
     */
    async addDB(info: AssetDBRegisterInfo) {
        this.assetDBInfo[info.name] = patchAssetDBInfo(info);
        await this.startDB(this.assetDBInfo[info.name]);
    }

    /**
     * 移除某个 asset-db
     * @param name 
     * @returns 
     */
    async removeDB(name: string) {
        if (this.isPause) {
            console.log(Editor.I18n.t('asset-db.assetDBPauseTips',
                { operate: 'removeDB' }
            ));
            return new Promise((resolve) => {
                this._addTaskToQueue({
                    func: this._removeDB.bind(this),
                    args: [name],
                    resolve,
                });
            });
        }
        return await this._removeDB(name);
    }

    private async _operate(name: string, ...args: any[]) {
        const taskId = name + Date.now();
        if (name.endsWith('Asset')) {
            this.assetBusyTask.add(taskId);
        }
        try {
            // @ts-ignore
            const res = await this[name](...args);
            this.assetBusyTask.delete(taskId);
            return res;
        } catch (error) {
            console.error(`${name} failed with args: ${args.toString()}`);
            console.error(error);
            this.assetBusyTask.delete(taskId);
        }
    }

    private async _removeDB(name: string) {
        const db = this.assetDBMap[name];
        if (!db) {
            return;
        }
        const assetDBInfo = this.assetDBInfo[name];
        this.ready && await this.pluginManager.runHook('beforeStopDB', [assetDBInfo]);
        await db.stop();
        this.ready && await this.pluginManager.runHook('afterStopDB', [assetDBInfo]);
        this.emit('db-removed', db);
        delete this.assetDBMap[name];
        delete this.assetDBInfo[name];
        Editor.Message.broadcast('asset-db:db-close', name);
    }

    /**
     * 刷新所有数据库
     * @returns 
     */
    async refresh() {
        if (!this.ready) {
            return;
        }
        if (this.state !== 'free' || this.isPause || this.assetBusy) {
            if (this.isPause) {
                console.log(Editor.I18n.t('asset-db.assetDBPauseTips',
                    { operate: 'refresh' }
                ));
            }
            return new Promise((resolve) => {
                this._addTaskToQueue({
                    func: this._refresh.bind(this),
                    args: [],
                    resolve,
                });
            });
        }
        return await this._refresh();
    }

    private async _refresh() {
        this.state = 'busy';
        await this.pluginManager.runHook('beforeRefresh');
        Editor.Metrics.trackTimeStart('asset-db:refresh-all-database');
        for (const name in this.assetDBMap) {
            if (!this.assetDBMap[name]) {
                console.debug(`Get assetDB ${name} form manager failed!`);
                continue;
            }
            const db = this.assetDBMap[name];
            await db.refresh(db.options.target, {
                ignoreSelf: true,
                // 只有 assets 资源库做 effect 编译处理
                hooks: name === 'assets' ? {
                    afterPreImport: async () => {
                        await afterPreImport(db);
                    },
                } : {},
            });
            console.debug(`refresh db ${name} success`);
        }
        Editor.Metrics.trackTimeEnd('asset-db:refresh-all-database', { output: true });
        await this.pluginManager.runHook('afterRefresh');
        Editor.Message.broadcast('asset-db:refresh-finish');
        this.state = 'free';
        this.step();
    }

    /**
     * 懒刷新资源，请勿使用，目前的逻辑是针对重刷文件夹定制的
     * @param file 
     */
    public async autoRefreshAssetLazy(pathOrUrlOrUUID: string) {
        if (!this.waitingRefreshAsset.includes(pathOrUrlOrUUID)) {
            this.waitingRefreshAsset.push(pathOrUrlOrUUID);
        }

        this.autoRefreshTimer && clearTimeout(this.autoRefreshTimer);
        return new Promise((resolve) => {
            this.autoRefreshTimer = setTimeout(async () => {
                const taskId = 'autoRefreshAssetLazy' + Date.now();
                this.assetBusyTask.add(taskId);
                const files = JSON.parse(JSON.stringify(this.waitingRefreshAsset));
                this.waitingRefreshAsset.length = 0;
                await Promise.all(files.map((file: string) => assetdb.refresh(file)));
                this.assetBusyTask.delete(taskId);
                this.step();
                resolve(true);
            }, 100);
        });
    }

    /**
     * 恢复被暂停的数据库
     * @returns 
     */
    async resume(): Promise<boolean> {
        if (!this.hasPause && !this.startPause) {
            return true;
        }
        this.hasPause = false;
        this.startPause = false;
        Editor.Message.broadcast('asset-db:resume');
        newConsole.record();
        console.log('Asset DB is resume!');
        await this.step();
        return true;
    }

    async addTask(func: Function, args: any[]): Promise<any> {
        if (this.isPause || this.state === 'busy') {
            console.log(Editor.I18n.t('asset-db.assetDBPauseTips',
                { operate: func.name }
            ));
            return new Promise((resolve) => {
                this._addTaskToQueue({
                    func,
                    args: args,
                    resolve,
                });
            });
        }
        return await func(...args);
    }

    private _addTaskToQueue(task: IWaitingTask) {
        const last = this.waitingTaskQueue[this.waitingTaskQueue.length - 1];
        const curTask: IWaitingTaskInfo = {
            func: task.func,
            args: task.args,
        };
        if (task.resolve) {
            curTask.resolves = [task.resolve];
        }
        if (!last) {
            this.waitingTaskQueue.push(curTask);
            this.step();
            return;
        }

        // 不一样的任务添加进队列
        if (last.func.name !== curTask.func.name || curTask.args.toString() !== last.args.toString()) {
            this.waitingTaskQueue.push(curTask);
            this.step();
            return;
        }
        // 将一样的任务合并
        if (!task.resolve) {
            return;
        }

        if (last.resolves) {
            last.resolves.push(task.resolve);
        } else {
            last.resolves = curTask.resolves;
        }
        this.step();
    }

    async step() {
        // 存在等待的 handle 先处理回调
        if (this.startPause && this.waitPauseHandle) {
            this.waitPauseHandle(true);
            this.waitPauseHandle = undefined;
        }
        // db 暂停时，不处理等待任务
        if (this.isPause || !this.waitingTaskQueue.length || this.state === 'busy') {
            return;
        }
        // 深拷贝以避免在处理的过程中持续收到任务
        let waitingTaskQueue = Array.from(this.waitingTaskQueue);
        const lastWaitingQueue: IWaitingTaskInfo[] = [];
        // 当同时有资源操作与整体的检查刷新任务时，优先执行资源操作任务
        waitingTaskQueue = waitingTaskQueue.filter((task) => {
            if (!this.assetBusy || (this.assetBusy && task.func.name !== '_refresh')) {
                return true;
            }
            lastWaitingQueue.push(task);
            return false;
        });
        this.waitingTaskQueue = lastWaitingQueue;
        for (let index = 0; index < waitingTaskQueue.length; index++) {
            const task = waitingTaskQueue[index];
            try {
                if (task.func.name === '_refresh' && this.assetBusy) {
                    // 没有执行的任务塞回队列
                    this.waitingTaskQueue.push(task);
                    continue;
                }
                const res = await task.func(...task.args);
                if (!task.resolves) {
                    return;
                }
                task.resolves.forEach((resolve) => resolve(res));
            } catch (error) {
                console.warn(error);
            }
        }

        // 当前 step 的处理任务完成即可结束，剩余任务会在下一次 step 中处理
    }

    /**
     * 暂停数据库
     * @param source 来源标识
     * @returns 
     */
    async pause(source = 'unkown') {
        this.startPause = true;
        // 只要当前底层没有正在处理的资源都视为资源进入可暂停状态
        if (!this.isBusy()) {
            this.hasPause = true;
            Editor.Message.broadcast('asset-db:pause', source);
            console.log(`Asset DB is paused with ${source}!`);
            return true;
        }
        if (!this.hasPause) {
            return this.waitPausePromiseTask;
        }
        this.waitPausePromiseTask = new Promise((resolve) => {
            this.waitPauseHandle = () => {
                this.waitPausePromiseTask = undefined;
                Editor.Message.broadcast('asset-db:pause', source);
                console.log(`Asset DB is paused with ${source}!`);
                newConsole.stopRecord();
                this.hasPause = true;
                newConsole.stopRecord();
                resolve(true);
            };
        });
        // 2 分钟的超时时间，超过自动返回回调
        setTimeout(() => {
            this.waitPausePromiseTask && decidePromiseState(this.waitPausePromiseTask).then(state => {
                if (state === PROMISE_STATE.PENDING) {
                    this.hasPause = true;
                    Editor.Message.broadcast('asset-db:pause', source);
                    this.waitPauseHandle!();
                    console.debug('Pause asset db time out');
                }
            });
        }, 2000 * 60);
        return this.waitPausePromiseTask;
    }
}

export const assetDBManager = new AssetDBManager();

function patchAssetDBInfo(config: AssetDBRegisterInfo): IAssetDBInfo {
    return {
        name: config.name,
        target: Editor.Utils.Path.normalize(config.target),
        readonly: !!config.readonly,

        temp: config.temp || Editor.Utils.Path.normalize(join(Editor.Project.path, 'temp/asset-db', config.name)),
        library: config.library || AssetDBManager.libraryRoot,

        level: 4,
        ignoreGlob: config.ignoreGlob,
        ignoreFiles: ['.DS_Store', '.rename_temp'],
        visible: config.visible,
        state: 'none',
        preImportExtList: config.preImportExtList || [],
    };
}

// TODO 排队队列做合并
// class AutoMergeQueue extends Array {
//     add(item: IWaitingTask) {
//         const lastTask = this[this.length - 1];
//         // 自动合并和上一个任务一样的
//         if (!lastTask || !lodash.isEqual({name: item.name, args: item.args}, {name: lastTask.name, args: lastTask.args})) {
//             return this.push(item);
//         }
//         if (!item.resolve) {
//             return this.length - 1;
//         }
//         lastTask.resolves = lastTask.resolves ? [] : lastTask.resolves;
//         lastTask.resolve && lastTask.resolves.push(lastTask.resolve);
//         lastTask.resolves.push(item.resolve);
//     }
// }

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}
// let cc!: typeof import('cc');
async function initEngine(info: IAssetWorkerInfo) {
    // @ts-ignore
    window.CC_PREVIEW = false;
    Editor.Metrics.trackTimeStart('asset-db:require-engine-code');
    Editor.Task.__protected__.updateSyncTask(
        'import-asset',
        'preload cc engine ...',
    );
    // 加载引擎
    const { default: preload } = await import('cc/preload');
    await preload({
        requiredModules: [
            'cc',
            'cc/editor/populate-internal-constants',
            'cc/editor/serialization',
            'cc/editor/animation-clip-migration',
            'cc/editor/exotic-animation',
            'cc/editor/new-gen-anim',
            'cc/editor/offline-mappings',
            'cc/editor/embedded-player',
            'cc/editor/color-utils',
            'cc/editor/custom-pipeline',
        ],
    });

    // @ts-ignore
    // window.cc.debug._resetDebugSetting(cc.DebugMode.INFO);
    Editor.Metrics.trackTimeEnd('asset-db:require-engine-code', { output: true });

    const modules = (await Editor.Message.request('engine', 'query-engine-modules-profile'))?.includeModules || [];
    let physicsEngine = '';
    const engineList = ['physics-cannon', 'physics-ammo', 'physics-builtin', 'physics-physx'];
    for (let i = 0; i < engineList.length; i++) {
        if (modules.indexOf(engineList[i]) >= 0) {
            physicsEngine = engineList[i];
            break;
        }
    }
    const physics = await Editor.Profile.getProject('project', 'physics');
    const macroConfig = await Editor.Profile.getProject('engine', 'macroConfig');
    const layers = await Editor.Profile.getProject('project', 'layer');
    const sortingLayer = (await Editor.Profile.getProject('project', 'sorting-layer')) || {};
    const customLayers = layers.map((layer: any) => {
        const index = layerMask.findIndex((num) => { return layer.value === num; });
        return {
            name: layer.name,
            bit: index,
        };
    });
    const sortingLayers = sortingLayer.layers || [];
    const highQuality = await Editor.Profile.getProject('project', 'general.highQuality');
    const defaultConfig = {
        debugMode: cc.debug.DebugMode.WARN,
        overrideSettings: {
            engine: {
                builtinAssets: [],
                macros: macroConfig,
                sortingLayers,
                customLayers,
            },
            profiling: {
                showFPS: false,
            },
            screen: {
                frameRate: 30,
                exactFitScreen: true,
            },
            rendering: {
                renderMode: 3,
                highQualityMode: highQuality,
            },
            physics: {
                ...physics,
                physicsEngine,
                enabled: false,
            },
            assets: {
                importBase: AssetDBManager.libraryRoot,
                nativeBase: AssetDBManager.libraryRoot,
            },
        },
        exactFitScreen: true,
    };
    cc.physics.selector.runInEditor = true;
    await cc.game.init(defaultConfig);
    Editor.Task.__protected__.updateSyncTask(
        'import-asset',
        'init engine success',
    );
}

function getPreImporterHandler(preImportExtList?: string[]) {
    if (!preImportExtList || !preImportExtList.length) {
        return null;
    }

    return function (file: string) {
        // HACK 用于指定部分资源优先导入
        const ext = extname(file);
        if (!ext) {
            return true;
        } else {
            return preImportExtList.includes(ext);
        }
    };
}

const afterScan = async function (files: string[]) {
    let dirIndex = 0;
    let chunkIndex = 0;
    let effectIndex = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = extname(file);
        if (!ext) {
            files.splice(i, 1);
            files.splice(dirIndex, 0, file);
            dirIndex += 1;
        } else if (ext === '.chunk') {
            files.splice(i, 1);
            files.splice(dirIndex + chunkIndex, 0, file);
            chunkIndex += 1;
        } else if (ext === '.effect') {
            files.splice(i, 1);
            files.splice(dirIndex + chunkIndex + effectIndex, 0, file);
            effectIndex += 1;
        }
    }
};

async function afterPreImport(db: assetdb.AssetDB) {
    // 先把已收集的任务队列（preImporterHandler 过滤出来的那部分资源类型）内容优先导入执行完毕
    db.taskManager.start();
    await db.taskManager.waitQueue();
    db.taskManager.stop();
}
