'use strict';

import {
    AssetDBContribution,
    AssetDBHookType,
    AssetDBRegisterInfo,
    EditorMethodModule,
    ExecuteAssetDBScriptMethodOptions, IAsset, PackageRegisterInfo,
} from '../../../@types/private';

import { join } from 'path';
import { AssetDB, get, Importer } from '@editor/asset-db';
import EventEmitter from 'events';
import { newConsole } from './../console';

const Profile = require('@base/electron-profile');
const _profile = Profile.load('local://editor/packages.json');
const _profileDefault = Profile.load('defaultPreferences://editor/packages.json');
type PackageEventType = 'register' | 'unregister' | 'enable' | 'disable';

interface packageTask {
    type: PackageEventType;
    pkgName: string;
    handler: Function;
    args: any[];
}

/**
 * 扩展管理器
 * 更新一些场景暴露的扩展数据
 */
class PluginManager extends EventEmitter {
    packageRegisterInfo: Record<string, PackageRegisterInfo> = {};
    hookOrder: string[] = [];
    assetDBProfileMap: Record<string, string> = {};

    _tasks: packageTask[] = [];
    _currentTask: packageTask | null = null;
    // 插件注册控制锁，同一个插件同时只能执行一种任务
    private pkgLock: Record<string, boolean> = {};
    private ready = false;

    async init() {
        Editor.Metrics.trackTimeStart('asset-db:worker-init: initPlugin');
        newConsole.trackMemoryStart('asset-db:worker-init: initPlugin');
        const pkgs = Editor.Package.getPackages({});
        await Promise.all((pkgs).map(async (pkgInfo) => {
            await this.onPackageRegister(pkgInfo);
            if (pkgInfo.enable) {
                await this.onPackageEnable(pkgInfo);
            }
        }));
        Editor.Package.__protected__.on('register', registerAttach);
        Editor.Package.__protected__.on('enable', enableAttach);
        Editor.Package.__protected__.on('disable', disableDetach);
        Editor.Package.__protected__.on('unregister', unRegisterDetach);
        newConsole.trackMemoryEnd('asset-db:worker-init: initPlugin');
        Editor.Metrics.trackTimeEnd('asset-db:worker-init: initPlugin', {
            output: true,
        });
        this.ready = true;
        this.emit('ready');
    }

    async destroyed() {
        Editor.Package.__protected__.removeListener('register', registerAttach);
        Editor.Package.__protected__.removeListener('enable', enableAttach);
        Editor.Package.__protected__.removeListener('disable', disableDetach);
        Editor.Package.__protected__.removeListener('unregister', unRegisterDetach);
    }

    /**
     * 处理插件广播消息任务，由于各个处理消息异步，需要使用队列管理否则可能出现时序问题
     * @param name 
     * @param handler 
     * @param args 
     */
    public addTask(type: PackageEventType, pkgName: string, handler: Function, ...args: any[]) {
        this._tasks.push({
            type,
            pkgName,
            handler,
            args,
        });
        // 正常情况下，当前任务执行完会自动 step，当前无任务正在进行时 才手动调用 step 
        this.step();
    }

    public async onPackageRegister(data: Editor.Interface.PackageInfo) {
        // TODO 如果启动失败，没有机制得知结果
        const disableInfo = _profile.get(`disable-packages.${data.path}`);
        if (disableInfo) {
            return;
        }
        // 关联 issue https://github.com/cocos/3d-tasks/issues/15628
        // HACK 由于 db 需要在其他插件启动之前注册数据库，而此时无法得知插件是否会被启动
        // 这里直接读取了配置里的插件开关信息。如果后续不再支持同名插件的覆盖启动规则或者插件管理器可以获取则可以更改写法。
        const defaultDisableInfo = _profileDefault.get(`disable-packages.${data.path}`);
        if (defaultDisableInfo) {
            return;
        }

        if (!data.info.contributions || !data.info.contributions['asset-db']) {
            return;
        }

        const contribution = data.info.contributions['asset-db'] as AssetDBContribution;
        const registerInfo: PackageRegisterInfo = this.packageRegisterInfo[data.name] || {
            name: data.name,
            hooks: [],
            enable: false,
            internal: Editor.Utils.Path.contains(Editor.App.path, data.path),
        };

        newConsole.trackMemoryStart(`asset-db-plugin-register: ${data.name}`);

        // 3.8.3 废弃此用法，目前暂时兼容
        if (contribution.importer && contribution.importer.script) {
            // TODO 补充警告日志以及升级指南链接
            console.warn(`[Register ${data.name}]` + Editor.I18n.t('asset-db.deprecatedTip', {
                oldName: 'contribution.importer',
                newName: 'contribution.asset-handler',
                version: '3.8.3',
            }));
            if (!contribution.importer.list) {
                return;
            }
            const script = join(data.path, contribution.importer.script);
            try {
                registerInfo.importerRegisterInfo = {
                    script,
                    list: contribution.importer.list,
                };
            } catch (error) {
                console.warn(`Failed to register the importer from ${data.name}: ${script}`);
                console.warn(error);
            }
        }

        newConsole.trackMemoryEnd(`asset-db-plugin-register: ${data.name}`);
        this.packageRegisterInfo[data.name] = registerInfo;
    }

    public async onPackageEnable(data: Editor.Interface.PackageInfo) {
        if (data.invalid) {
            return;
        }
        const registerInfo = this.packageRegisterInfo[data.name];
        if (!registerInfo) {
            return;
        }
        registerInfo.enable = true;
        const contribution = data.info.contributions!['asset-db'] as AssetDBContribution;
        if (contribution.script) {
            const registerScript = join(data.path, contribution.script);
            try {
                const mod = Editor.Module.__protected__.requireFile(registerScript);
                if (typeof mod.load === 'function') {
                    await mod.load();
                }
                // 注册钩子函数索引
                if (Array.isArray(contribution['global-hook'])) {
                    registerInfo.hooks.push(...contribution['global-hook']);
                }
                if (Array.isArray(contribution['mount-hook'])) {
                    registerInfo.hooks.push(...contribution['mount-hook']);
                }
                if (registerInfo.hooks.length) {
                    this.hookOrder.push(data.name);
                }

                // 预注册自定义资源处理器
                if (contribution['asset-handler']) {
                    registerInfo.assetHandlerInfos = contribution['asset-handler'];
                }
                registerInfo.script = registerScript;
                // 注册自定义资源处理器
            } catch (error) {
                delete registerInfo.script;
                console.warn(`Description Failed to register the Asset-DB script from ${data.name}: ${registerInfo.script}.`);
                console.warn(error);
            }

        }

        if (contribution.mount) {
            registerInfo.mount = {
                ...contribution.mount,
                path: contribution.mount.path ? join(data.path, contribution.mount.path) : contribution.mount.path,
            };

            // 配置了 db 开关
            if (contribution.mount.enable) {
                this.assetDBProfileMap[`packages/${data.name}.json(${contribution.mount.enable})`] = data.name;
            }
        }
        this.emit('enable', data.name, registerInfo);
    }

    /**
     * 插件关闭后的一些卸载操作缓存清理，需要与 enable 里的处理互相呼应
     * @param data 
     * @returns 
     */
    public async onPackageDisable(data: Editor.Interface.PackageInfo) {
        const registerInfo = this.packageRegisterInfo[data.name];
        if (!registerInfo) {
            return;
        }
        registerInfo.enable = false;
        if (registerInfo.script) {
            try {
                const mod = Editor.Module.__protected__.requireFile(registerInfo.script);
                mod.unload && mod.unload();
            } catch (error) {
                console.warn(error);
            }
            delete registerInfo.assetHandlerInfos;
            delete registerInfo.script;
        }

        this.hookOrder.splice(this.hookOrder.indexOf(data.name), 1);
        // 3.8.3 已废弃，暂时兼容
        if (registerInfo.importerRegisterInfo) {
            try {
                const mod = Editor.Module.__protected__.requireFile(registerInfo.importerRegisterInfo.script);
                mod.unload && mod.unload();
            } catch (error) {
                console.warn(error);
            }
            delete registerInfo.importerRegisterInfo;
        }

        if (registerInfo.mount) {
            delete this.assetDBProfileMap[`packages/${data.name}.json(${registerInfo.mount.enable})`];
            delete registerInfo.mount;
        }
        
        this.emit('disabled', data.name, registerInfo);
    }
    public async unRegisterDetach(data: Editor.Interface.PackageInfo) {
        const registerInfo = this.packageRegisterInfo[data.name];
        if (!registerInfo) {
            return;
        }
        delete this.packageRegisterInfo[data.name];
    }

    private async step() {
        if (!this._tasks.length) {
            return;
        }
        const nextTaskIndex = this._tasks.findIndex((task) => !this.pkgLock[task.pkgName]);
        if (nextTaskIndex === -1) {
            return;
        }
        const task = this._tasks[nextTaskIndex];
        this.pkgLock[task.pkgName] = true;
        this._tasks.splice(nextTaskIndex, 1);
        const logTitle = `run package(${task.pkgName}) handler(${task.type})`;
        try {
            console.debug(logTitle + ' start');
            await task.handler.call(this, ...task.args);
            console.debug(logTitle + ` success!`);
        } catch (error) {
            console.error(error);
            console.error(logTitle + ` failed!`);
        }
        this.pkgLock[task.pkgName] = false;
        await this.step();
    }

    public async queryAssetDBInfos(): Promise<AssetDBRegisterInfo[]> {
        const res: AssetDBRegisterInfo[] = [];
        for (const name of Object.keys(this.packageRegisterInfo)) {
            const dbInfo = await this.queryAssetDBInfo(name);
            dbInfo && (res.push(dbInfo));
        }
        return res;
    }

    public async queryAssetDBInfo(name: string): Promise<AssetDBRegisterInfo | null> {
        const info = this.packageRegisterInfo[name];
        if (!info || !info.mount) {
            return null;
        }
        if (info.mount!.enable) {
            const enable = await Editor.Profile.getProject(info.name, info.mount!.enable) || await Editor.Profile.getConfig(info.name, info.mount!.enable);
            if (!enable) {
                return null;
            }
        }
        return {
            name,
            readonly: !!info.mount.readonly,
            visible: info.mount.visible === false ? false : true,
            target: info.mount.path,
        };
    }

    public getAssetDBInfo(name: string): AssetDBRegisterInfo | null {
        const info = this.packageRegisterInfo[name];
        if (!info || !info.mount) {
            return null;
        }
        return {
            name,
            readonly: !!info.mount.readonly,
            visible: info.mount.visible === false ? false : true,
            target: info.mount.path,
        };
    }

    /**
     * 执行一个 db 脚本（直接承接对外接口）
     * @param options 
     */
    public async executeScript(options: ExecuteAssetDBScriptMethodOptions) {
        if (!this.packageRegisterInfo[options.name]) {
            // TODO 此段逻辑不应该有机会进入
            // 支持在插件脚本的 load 函数内执行 db 脚本
            const pkgInfo = (await Editor.Package.getPackages({ name: options.name }))[0];
            pkgInfo && (await enableAttach(pkgInfo));
        }
        const registerInfo = this.packageRegisterInfo[options.name];
        // 初始化后，不支持执行未启动的插件脚本
        if (!registerInfo || !registerInfo.script || !registerInfo.enable && this.ready) {
            throw 'Asset database scripts do not exist: ' + options.name + '/' + options.method;
        }
        const mod = Editor.Module.__protected__.requireFile(registerInfo.script);
        if (mod.methods && mod.methods[options.method]) {
            return await mod.methods[options.method](...(options.args || []));
        } else {
            throw 'Asset database scripts do not exist: ' + options.name + '/' + options.method;
        }
    }

    public async executeScriptSafe(options: ExecuteAssetDBScriptMethodOptions) {
        try {
            const script = this.packageRegisterInfo[options.name].script!;
            const mod = Editor.Module.__protected__.requireFile(script);
            if (mod.methods && mod.methods[options.method]) {
                return await mod.methods[options.method](...(options.args || []));
            } 
        } catch (error) {
            console.debug(error);
        }
    }

    /**
     * 执行某个生命周期钩子函数
     * @param hookName 
     */
    public async runHook(hookName: AssetDBHookType, params: any[] = []) {
        const pkgNameOrder = this.hookOrder;
        for (const pkgName of pkgNameOrder) {
            const { script, hooks, enable } = this.packageRegisterInfo[pkgName];
            if (!enable && this.ready || !hooks.includes(hookName)) {
                continue;
            }
            Editor.Metrics.trackTimeStart(`asset-db-hook-${pkgName}-${hookName}`);
            console.debug(`Run asset db hook ${pkgName}:${hookName} ...`);
            await this.executeScriptSafe({
                name: pkgName,
                method: hookName,
                args: params,
            });
            console.debug(`Run asset db hook ${pkgName}:${hookName} success!`);
            Editor.Metrics.trackTimeEnd(`asset-db-hook-${pkgName}-${hookName}`, { output: true });
            // try {
            // } catch (error) {
            //     console.error(error);
            //     console.error(`Run asset-db hook ${pkgName}:${hookName} failed!`);
            // }
        }
    }

    public async registerImporterList(database: AssetDB) {
        // 兼容 3.9 之前版本使用旧的导入器注册方式的流程
        for (const name in pluginManager.packageRegisterInfo) {
            const item = pluginManager.packageRegisterInfo[name];

            if (item.importerRegisterInfo) {
                const mod = Editor.Module.__protected__.requireFile(item.importerRegisterInfo.script) as EditorMethodModule;
                for (const name of item.importerRegisterInfo.list) {
                    if (mod.methods && mod.methods[name]) {
                        try {
                            const result: { importer: typeof Importer, extname: string[] } = await mod.methods[name]!();
                            database.importerManager.add(result.importer, result.extname);
                        } catch (error) {
                            console.warn(`Failed to register importer. Data is not compliant: ${database.options.name} ${name}`);
                            console.warn(error);
                        }
                    } else {
                        console.warn(`Failed to register importer. Data is not compliant: ${database.options.name} ${name}`);
                    }
                }
            }
        }
    }
}

const registerAttach = async function(data: Editor.Interface.PackageInfo) {
    pluginManager.addTask('register', data.name, pluginManager.onPackageRegister, data);
};

const enableAttach = async function(data: Editor.Interface.PackageInfo) {
    pluginManager.addTask('enable', data.name, pluginManager.onPackageEnable, data);
};

const disableDetach = async function(data: Editor.Interface.PackageInfo) {
    pluginManager.addTask('disable', data.name, pluginManager.onPackageDisable, data);
};

const unRegisterDetach = async function(data: Editor.Interface.PackageInfo) {
    pluginManager.addTask('unregister', data.name, pluginManager.unRegisterDetach, data);
};

const pluginManager = new PluginManager();

export default pluginManager;
