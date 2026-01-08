import { exec, execSync } from "child_process";
import fs from "fs";
import { BrowserType, IRemoteDebuggingBrowser } from "./interface";

/**
 * Linux 平台的远程调试浏览器实现
 */
export class RemoteDebuggingBrowserLinux implements IRemoteDebuggingBrowser {
    /**
     * 获取默认浏览器路径
     */
    private getDefaultBrowserPath(): string | undefined {
        try {
            let browserDesktop = "";
            try {
                browserDesktop = execSync("xdg-settings get default-web-browser", {
                    encoding: "utf8",
                }).trim();
            } catch {
                browserDesktop = execSync(
                    "xdg-mime query default x-scheme-handler/http",
                    { encoding: "utf8" }
                ).trim();
            }

            if (browserDesktop) {
                const desktopFilePath = `/usr/share/applications/${browserDesktop}`;
                if (fs.existsSync(desktopFilePath)) {
                    const desktopFileContent = fs.readFileSync(desktopFilePath, "utf8");
                    const execLine = desktopFileContent
                        .split("\n")
                        .find((line) => line.startsWith("Exec="));
                    if (execLine) {
                        const execPath = execLine.replace("Exec=", "").split(" ")[0];
                        if (fs.existsSync(execPath)) {
                            return execPath;
                        }
                    }
                }
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    /**
     * 从浏览器路径判断浏览器类型
     */
    private getBrowserTypeFromPath(browserPath: string): BrowserType | undefined {
        const lowerPath = browserPath.toLowerCase();
        if (lowerPath.includes('chrome') && !lowerPath.includes('edge')) {
            return BrowserType.Chrome;
        } else if (lowerPath.includes('edge')) {
            return BrowserType.Edge;
        }
        return undefined;
    }

    getDefaultBrowserType(): BrowserType | undefined {
        const browserPath = this.getDefaultBrowserPath();
        if (!browserPath) {
            return undefined;
        }
        return this.getBrowserTypeFromPath(browserPath);
    }

    isBrowserInstalled(browserType: BrowserType): boolean {
        if (browserType === BrowserType.Chrome) {
            try {
                execSync('which google-chrome', { stdio: 'ignore' });
                return true;
            } catch {
                try {
                    execSync('which chromium', { stdio: 'ignore' });
                    return true;
                } catch {
                    return false;
                }
            }
        } else if (browserType === BrowserType.Edge) {
            try {
                execSync('which microsoft-edge', { stdio: 'ignore' });
                return true;
            } catch {
                return false;
            }
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
                exec(`google-chrome ${args} &`, (error: any) => {
                    if (error) {
                        // 尝试 chromium
                        exec(`chromium ${args} &`, (error2: any) => {
                            if (error2) {
                                console.error(`❌ Failed to launch Chrome/Chromium: ${error2.message}`);
                            } else {
                                console.log(`✅ Chromium launched with debugging port ${port}`);
                            }
                            if (completedCallback) {
                                completedCallback();
                            }
                        });
                    } else {
                        console.log(`✅ Chrome launched with debugging port ${port}`);
                        if (completedCallback) {
                            completedCallback();
                        }
                    }
                });
            } else if (browserType === BrowserType.Edge) {
                exec(`microsoft-edge ${args} &`, (error: any) => {
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

