/**
 * 浏览器类型枚举
 */
export enum BrowserType {
    Chrome = 'chrome',
    Edge = 'msedge',
}

/**
 * 远程调试浏览器接口
 */
export interface IRemoteDebuggingBrowser {
    /**
     * 获取默认浏览器类型
     * @returns 默认浏览器类型，如果无法获取返回 undefined
     */
    getDefaultBrowserType(): BrowserType | undefined;

    /**
     * 检查浏览器是否已安装
     * @param browserType 浏览器类型
     * @returns 如果已安装返回 true，否则返回 false
     */
    isBrowserInstalled(browserType: BrowserType): boolean;

    /**
     * 启动远程调试浏览器
     * @param browserType 浏览器类型
     * @param url 要打开的 URL
     * @param port 远程调试端口
     * @param userDataDir 用户数据目录
     * @param completedCallback 浏览器启动完成后的回调函数
     */
    launchBrowser(
        browserType: BrowserType,
        url: string,
        port: number,
        userDataDir: string,
        completedCallback?: () => void
    ): void;
}

