import * as utils from './utils';
import { ConfigurationScope, MessageType } from './interface';
import { EventEmitter } from 'events';

type EventEmitterMethods = Pick<EventEmitter, 'on' | 'off' | 'once' | 'emit'>;

/**
 * 配置基类接口
 */
export interface IBaseConfiguration extends EventEmitterMethods {
    /**
     * 模块名
     */
    moduleName: string;

    /**
     * 默认配置数据
     */
    getDefaultConfig(): Record<string, any> | undefined;
    mergeDefaultConfig(defaultConfig?: Record<string, any>): void;

    /**
     * 获取配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，不指定时按优先级查找
     */
    get<T>(key?: string, scope?: ConfigurationScope): Promise<T>;

    /**
     * 获取指定范围的所有配置，默认是 project
     * @param scope
     */
    getAll(scope?: ConfigurationScope): Record<string, any> | undefined;

    /**
     * 设置配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    set<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;

    /**
     * 移除配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，默认为 'project'
     */
    remove(key: string, scope?: ConfigurationScope): Promise<boolean>;

    /**
     * 保存配置
     * @param scope 'project'(默认) 保存项目配置；'local' 保存个人/本机配置
     */
    save(scope?: ConfigurationScope): Promise<boolean>;
}

/**
 * 抽象配置类实现
 */
export class BaseConfiguration extends EventEmitter implements IBaseConfiguration {
    protected configs: Record<string, any> = {};
    protected localConfigs: Record<string, any> = {};

    constructor(
        public readonly moduleName: string,
        protected defaultConfigs: Record<string, any> = {}
    ) {
        super();
    }

    public getDefaultConfig(): Record<string, any> {
        return this.defaultConfigs;
    }

    public mergeDefaultConfig(defaultConfig?: Record<string, any>): void {
        if (!defaultConfig) {
            return;
        }
        this.defaultConfigs = utils.deepMerge(
            utils.deepMerge({}, this.defaultConfigs),
            defaultConfig
        );
    }

    public getAll(scope: ConfigurationScope = 'project'): Record<string, any> | undefined {
        if (scope === 'default') {
            return this.getDefaultConfig();
        }
        if (scope === 'local') {
            return this.localConfigs;
        }
        return this.configs;
    }

    public async get<T>(key?: string, scope?: ConfigurationScope): Promise<T> {
        if (key === undefined) {
            // 不带 key 的合并读：default ← project ← local（后者覆盖前者）
            if (scope === 'default') {
                return (this.getDefaultConfig() as T);
            }
            if (scope === 'project') {
                return (this.configs as T);
            }
            if (scope === 'local') {
                return (this.localConfigs as T);
            }
            return utils.deepMerge(
                utils.deepMerge(this.getDefaultConfig(), this.configs),
                this.localConfigs,
            );
        }
        const projectConfig = utils.getByDotPath(this.configs, key);
        const localConfig = utils.getByDotPath(this.localConfigs, key);
        const defaultConfig = utils.getByDotPath(this.getDefaultConfig(), key);
        const hasProjectValue = projectConfig !== undefined;
        const hasLocalValue = localConfig !== undefined;
        const hasDefaultValue = defaultConfig !== undefined;

        // 根据作用域决定返回策略
        if (scope === 'project') {
            if (!hasProjectValue) {
                throw new Error(`[Configuration] 通过 ${this.moduleName}.${key} 获取配置失败`);
            }
            return (projectConfig as T);
        }

        if (scope === 'local') {
            // 显式 local 读取只返回本地配置，缺失时返回 undefined，避免和 default 值混淆。
            return (localConfig as T);
        }

        if (scope === 'default') {
            if (!hasDefaultValue) {
                throw new Error(`[Configuration] 通过 ${this.moduleName}.${key} 获取配置失败`);
            }
            return (defaultConfig as T);
        }

        // 合并读：三处都不存在才抛错
        if (!hasProjectValue && !hasLocalValue && !hasDefaultValue) {
            throw new Error(`[Configuration] 通过 ${this.moduleName}.${key} 获取配置失败`);
        }

        return (utils.deepMerge(utils.deepMerge(defaultConfig, projectConfig), localConfig) as T);
    }

    public async set<T>(key: string, value: T, scope: ConfigurationScope = 'project'): Promise<boolean> {
        if (scope === 'default') {
            utils.setByDotPath(this.defaultConfigs, key, value);
        } else if (scope === 'local') {
            utils.setByDotPath(this.localConfigs, key, value);
            await this.save('local');
        } else {
            utils.setByDotPath(this.configs, key, value);
            await this.save();
        }
        return true;
    }

    public async remove(key: string, scope: ConfigurationScope = 'project'): Promise<boolean> {
        let removed = false;

        if (scope === 'default') {
            // 从默认配置中移除
            if (this.defaultConfigs) {
                removed = utils.removeByDotPath(this.defaultConfigs, key);
            }
        } else if (scope === 'local') {
            removed = utils.removeByDotPath(this.localConfigs, key);
            if (removed) {
                await this.save('local');
            }
        } else {
            // 从项目配置中移除
            removed = utils.removeByDotPath(this.configs, key);
            if (removed) {
                await this.save();
            }
        }

        return removed;
    }

    public async save(scope: ConfigurationScope = 'project') {
        this.emit(MessageType.Save, this, scope);
        return true;
    }
}
