import { exec, execSync, spawn } from "child_process";
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
        try {
            let executablePath: string;
            let appName: string;

            if (browserType === BrowserType.Chrome) {
                executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
                appName = 'Google Chrome';
            } else if (browserType === BrowserType.Edge) {
                executablePath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
                appName = 'Microsoft Edge';
            } else {
                console.error(`❌ Unsupported browser type: ${browserType}`);
                if (completedCallback) {
                    completedCallback();
                }
                return;
            }

            // 检查可执行文件是否存在
            if (!fs.existsSync(executablePath)) {
                // 回退到使用 open -a 方式
                this.launchBrowserWithOpen(browserType, url, port, userDataDir, completedCallback);
                return;
            }

            // 构建参数数组（使用数组格式避免 shell 引号问题）
            const args = [
                `--remote-debugging-port=${port}`,
                '--no-first-run',
                '--no-default-browser-check',
                `--user-data-dir=${userDataDir}`,
                url
            ];

            console.log(`📋 Executing: ${executablePath} ${args.join(' ')}`);

            // 使用 spawn 而不是 exec，这样可以更好地控制参数传递
            const childProcess = spawn(executablePath, args, {
                detached: true,
                stdio: 'ignore'
            });

            // 监听 spawn 错误（如果可执行文件不存在或无法启动）
            childProcess.on('error', (error: Error) => {
                console.error(`❌ Failed to spawn ${appName}: ${error.message}`);
                // 回退到使用 open -a 方式
                this.launchBrowserWithOpen(browserType, url, port, userDataDir, completedCallback);
            });

            // 监听进程退出（如果立即退出，说明启动失败）
            childProcess.on('exit', (code: number | null, signal: string | null) => {
                if (code !== null && code !== 0) {
                    console.error(`❌ ${appName} process exited with code ${code}, signal: ${signal}`);
                    // 如果进程立即退出，回退到 open -a 方式
                    if (!completedCallback || code !== 0) {
                        this.launchBrowserWithOpen(browserType, url, port, userDataDir, completedCallback);
                    }
                }
            });

            // 立即解除父子关系，让浏览器独立运行
            childProcess.unref();

            // 给一点时间让进程启动，然后检查进程是否还在运行
            setTimeout(() => {
                // 检查进程是否还在运行（通过发送信号 0，不会实际发送信号，只是检查）
                try {
                    process.kill(childProcess.pid || 0, 0);
                    console.log(`✅ ${appName} launched with debugging port ${port}`);
                    if (completedCallback) {
                        completedCallback();
                    }
                } catch (error: any) {
                    // 进程不存在，说明启动失败
                    console.error(`❌ ${appName} process is not running`);
                    this.launchBrowserWithOpen(browserType, url, port, userDataDir, completedCallback);
                }
            }, 500);

        } catch (error: any) {
            console.error(`❌ Exception caught: ${error.message}`);
            // 回退到使用 open -a 方式
            this.launchBrowserWithOpen(browserType, url, port, userDataDir, completedCallback);
        }
    }

    /**
     * 使用 open -a 方式启动浏览器（备用方法）
     */
    private launchBrowserWithOpen(
        browserType: BrowserType,
        url: string,
        port: number,
        userDataDir: string,
        completedCallback?: () => void
    ): void {
        // 构建参数字符串，注意：URL 需要单独处理
        const args = [
            `--remote-debugging-port=${port}`,
            '--no-first-run',
            '--no-default-browser-check',
            `--user-data-dir=${userDataDir}`,
            url
        ];

        let command: string;
        let appName: string;

        if (browserType === BrowserType.Chrome) {
            appName = 'Google Chrome';
            // 使用 open -n 强制打开新实例，--args 后面的所有参数都会传递给应用
            command = `open -n -a "Google Chrome" --args ${args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ')}`;
        } else if (browserType === BrowserType.Edge) {
            appName = 'Microsoft Edge';
            command = `open -n -a "Microsoft Edge" --args ${args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ')}`;
        } else {
            console.error(`❌ Unsupported browser type: ${browserType}`);
            if (completedCallback) {
                completedCallback();
            }
            return;
        }

        console.log(`📋 Executing: ${command}`);

        exec(command, (error: any) => {
            if (error) {
                console.error(`❌ Failed to launch ${appName}: ${error.message}`);
            } else {
                console.log(`✅ ${appName} launched with debugging port ${port}`);
            }
            if (completedCallback) {
                completedCallback();
            }
        });
    }
}

