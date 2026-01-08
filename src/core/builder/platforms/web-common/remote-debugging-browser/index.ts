import { platform } from "os";
import { BrowserType, IRemoteDebuggingBrowser } from "./interface";
import { RemoteDebuggingBrowserWin32 } from "./win32";
import { RemoteDebuggingBrowserDarwin } from "./darwin";
import { RemoteDebuggingBrowserLinux } from "./linux";

/**
 * 支持浏览器数组
 */
export const SUPPORTED_BROWSERS: BrowserType[] = [BrowserType.Chrome, BrowserType.Edge];

/**
 * 获取当前平台的远程调试浏览器实例
 */
export function getRemoteDebuggingBrowser(): IRemoteDebuggingBrowser {
    const currentPlatform = platform();
    
    if (currentPlatform === 'win32') {
        return new RemoteDebuggingBrowserWin32();
    } else if (currentPlatform === 'darwin') {
        return new RemoteDebuggingBrowserDarwin();
    } else if (currentPlatform === 'linux') {
        return new RemoteDebuggingBrowserLinux();
    }
    
    throw new Error(`Unsupported platform: ${currentPlatform}`);
}

/**
 * 获取已安装的浏览器类型（按照流程图逻辑）
 * @returns 已安装的浏览器类型，如果没有找到返回 undefined
 */
export function getInstalledBrowser(): BrowserType | undefined {
    const browserImpl = getRemoteDebuggingBrowser();
    
    // 1. 获取系统默认浏览器
    const defaultBrowser = browserImpl.getDefaultBrowserType();
    
    // 2. 检查默认浏览器是否存在且在支持数组中
    if (defaultBrowser && SUPPORTED_BROWSERS.includes(defaultBrowser)) {
        // 验证是否真的已安装
        if (browserImpl.isBrowserInstalled(defaultBrowser)) {
            return defaultBrowser;
        }
    }
    
    // 3. 按数组顺序依次检查是否已安装
    for (const browserType of SUPPORTED_BROWSERS) {
        if (browserImpl.isBrowserInstalled(browserType)) {
            return browserType;
        }
    }
    
    // 4. 没有找到已安装的浏览器
    return undefined;
}

/**
 * 启动远程调试浏览器
 * @param url 要打开的 URL
 * @param port 远程调试端口，默认 9222
 * @param browserType 可选的浏览器类型，如果不提供则自动检测
 * @param userDataDir 用户数据目录
 * @param completedCallback 浏览器启动完成后的回调函数
 */
export function launchRemoteDebuggingBrowser(
    url: string,
    port: number,
    browserType: BrowserType | undefined,
    userDataDir: string,
    completedCallback?: () => void
): void {
    const browserImpl = getRemoteDebuggingBrowser();
    
    let targetBrowserType: BrowserType | undefined = browserType;

    // 如果用户没有指定 browserType，调用获取已安装浏览器
    if (!targetBrowserType) {
        targetBrowserType = getInstalledBrowser();
    }

    // 检查 browserType 是否存在
    if (!targetBrowserType) {
        // 提示用户下载并安装支持数组第一项
        const firstSupportedBrowser = SUPPORTED_BROWSERS[0];
        console.error(`❌ No supported browser found. Please download and install ${firstSupportedBrowser}.`);
        if (completedCallback) {
            completedCallback();
        }
        return;
    }

    // 验证浏览器是否真的已安装（防止用户指定了不存在的浏览器类型）
    if (!browserImpl.isBrowserInstalled(targetBrowserType)) {
        console.error(`❌ Browser ${targetBrowserType} is not installed. Please install it first.`);
        if (completedCallback) {
            completedCallback();
        }
        return;
    }

    // 启动浏览器
    browserImpl.launchBrowser(targetBrowserType, url, port, userDataDir, completedCallback);
}

// 导出类型和枚举
export { BrowserType, IRemoteDebuggingBrowser };

