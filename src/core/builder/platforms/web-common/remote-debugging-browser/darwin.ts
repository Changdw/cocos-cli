import { exec, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { BrowserType, IRemoteDebuggingBrowser } from "./interface";

/**
 * macOS 平台的远程调试浏览器实现
 */
export class RemoteDebuggingBrowserDarwin implements IRemoteDebuggingBrowser {
    /**
     * 获取默认浏览器路径
     */
    private getDefaultBrowserPath(): string | undefined {
        try {
            const bundleId = execSync(
                'defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers | grep -A 1 "http" | grep LSHandlerRoleAll | awk \'{print $3}\'',
                { encoding: "utf8" }
            ).trim();

            if (bundleId) {
                const appPath = execSync(`mdfind "kMDItemCFBundleIdentifier == '${bundleId}'"`, {
                    encoding: "utf8",
                }).split("\n")[0];
                if (appPath && fs.existsSync(appPath)) {
                    return path.join(appPath, "Contents", "MacOS", path.basename(appPath, ".app"));
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
            return fs.existsSync('/Applications/Google Chrome.app');
        } else if (browserType === BrowserType.Edge) {
            return fs.existsSync('/Applications/Microsoft Edge.app');
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
                exec(`open -a "Google Chrome" --args ${args}`, (error: any) => {
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
                exec(`open -a "Microsoft Edge" --args ${args}`, (error: any) => {
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

