import { exec, execSync } from "child_process";
import fs from "fs";
import { BrowserType, IRemoteDebuggingBrowser } from "./interface";

/**
 * Windows 平台的远程调试浏览器实现
 */
export class RemoteDebuggingBrowserWin32 implements IRemoteDebuggingBrowser {
    /**
     * 通过注册表获取 Chrome 浏览器路径
     */
    private getChromePathFromRegistry(): string | undefined {
        try {
            const regPaths = [
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
                'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'
            ];

            for (const regPath of regPaths) {
                try {
                    const regQuery = execSync(
                        `reg query "${regPath}" /ve`,
                        { encoding: "utf8", stdio: 'pipe' }
                    );
                    let match = regQuery.match(/"([^"]+)"/);
                    if (match) {
                        const browserPath = match[1].trim();
                        if (fs.existsSync(browserPath)) {
                            return browserPath;
                        }
                    } else {
                        const lines = regQuery.split(/\r?\n/);
                        for (const line of lines) {
                            if (line.includes('REG_SZ')) {
                                match = line.match(/REG_SZ\s+(.+)$/);
                                if (match) {
                                    let browserPath = match[1].trim();
                                    if (fs.existsSync(browserPath)) {
                                        return browserPath;
                                    }
                                    const parts = browserPath.split(/\s+/);
                                    for (let i = parts.length; i > 0; i--) {
                                        const testPath = parts.slice(0, i).join(' ');
                                        if (fs.existsSync(testPath)) {
                                            return testPath;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    continue;
                }
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    /**
     * 通过注册表获取 Edge 浏览器路径
     */
    private getEdgePathFromRegistry(): string | undefined {
        try {
            const regPaths = [
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
                'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe'
            ];

            for (const regPath of regPaths) {
                try {
                    const regQuery = execSync(
                        `reg query "${regPath}" /ve`,
                        { encoding: "utf8", stdio: 'pipe' }
                    );
                    let match = regQuery.match(/"([^"]+)"/);
                    if (match) {
                        const browserPath = match[1].trim();
                        if (fs.existsSync(browserPath)) {
                            return browserPath;
                        }
                    } else {
                        const lines = regQuery.split(/\r?\n/);
                        for (const line of lines) {
                            if (line.includes('REG_SZ')) {
                                match = line.match(/REG_SZ\s+(.+)$/);
                                if (match) {
                                    let browserPath = match[1].trim();
                                    if (fs.existsSync(browserPath)) {
                                        return browserPath;
                                    }
                                    const parts = browserPath.split(/\s+/);
                                    for (let i = parts.length; i > 0; i--) {
                                        const testPath = parts.slice(0, i).join(' ');
                                        if (fs.existsSync(testPath)) {
                                            return testPath;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    continue;
                }
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    getDefaultBrowserType(): BrowserType | undefined {
        try {
            const regQuery = execSync(
                'reg query "HKEY_CLASSES_ROOT\\HTTP\\shell\\open\\command" /ve',
                { encoding: "utf8", stdio: 'pipe' }
            );
            
            // 将注册表查询结果转为小写，便于搜索
            const lowerQuery = regQuery.toLowerCase();
            
            // 直接搜索浏览器类型字符串
            // 注意：先检查 Edge，因为 Chrome 路径可能包含 'chrome' 但 Edge 路径也可能包含 'chrome'（如 Chrome Edge）
            if (lowerQuery.includes('msedge') || lowerQuery.includes('edge')) {
                return BrowserType.Edge;
            } else if (lowerQuery.includes('chrome')) {
                return BrowserType.Chrome;
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    isBrowserInstalled(browserType: BrowserType): boolean {
        if (browserType === BrowserType.Chrome) {
            const chromePath = this.getChromePathFromRegistry();
            return chromePath !== undefined && fs.existsSync(chromePath);
        } else if (browserType === BrowserType.Edge) {
            const edgePath = this.getEdgePathFromRegistry();
            return edgePath !== undefined && fs.existsSync(edgePath);
        }
        return false;
    }

    launchBrowser(
        browserType: BrowserType,
        url: string,
        port: number,
        userDataDir: string,
        completedCallback?: () => void
    ): void {
        const args = `--remote-debugging-port=${port} --no-first-run --no-default-browser-check --user-data-dir="${userDataDir}" "${url}"`;
        
        try {
            if (browserType === BrowserType.Chrome) {
                const chromePath = this.getChromePathFromRegistry();
                if (chromePath) {
                    exec(`start "" "${chromePath}" ${args}`, (error: any) => {
                        if (error) {
                            console.error(`❌ Failed to launch Chrome: ${error.message}`);
                        } else {
                            console.log(`✅ Chrome launched with debugging port ${port}`);
                        }
                        if (completedCallback) {
                            completedCallback();
                        }
                    });
                    return;
                }
                exec(`start chrome.exe ${args}`, (error: any) => {
                    if (error) {
                        console.error(`❌ Failed to launch Chrome: ${error.message}`);
                    } else {
                        console.log(`✅ Chrome launched with debugging port ${port}`);
                    }
                    if (completedCallback) {
                        completedCallback();
                    }
                });
            } else if (browserType === BrowserType.Edge) {
                const edgePath = this.getEdgePathFromRegistry();
                if (edgePath) {
                    exec(`start "" "${edgePath}" ${args}`, (error: any) => {
                        if (error) {
                            console.error(`❌ Failed to launch Edge: ${error.message}`);
                        } else {
                            console.log(`✅ Edge launched with debugging port ${port}`);
                        }
                        if (completedCallback) {
                            completedCallback();
                        }
                    });
                    return;
                }
                exec(`start msedge ${args}`, (error: any) => {
                    if (error) {
                        console.error(`❌ Failed to launch Edge: ${error.message}`);
                    } else {
                        console.log(`✅ Edge launched with debugging port ${port}`);
                    }
                    if (completedCallback) {
                        completedCallback();
                    }
                });
            }
        } catch (error: any) {
            console.error(`❌ Failed to launch browser: ${error.message}`);
            if (completedCallback) {
                completedCallback();
            }
        }
    }
}

