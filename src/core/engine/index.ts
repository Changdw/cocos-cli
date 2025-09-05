/**
 * 整合 engine 的一些编译、配置读取等功能
 */
export interface FeatureConfig {
    // TODO 
}
export default class Engine {
    featureConfigs: FeatureConfig[];
    private constructor() {

    }

    static async create(path: string) {
        // TODO 根据 Engine 地址读取引擎配置文件，确认初始化信息
        return new Engine(path);
    }
}