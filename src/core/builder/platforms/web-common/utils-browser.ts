import { exec } from "child_process";
import { platform, tmpdir } from "os";
import path from "path";
import { get as httpGet } from "http";
import WebSocket from "ws";
import { BrowserType, launchRemoteDebuggingBrowser } from "./remote-debugging-browser";

// 导出 BrowserType 供外部使用
export { BrowserType };

/**
 * openUrl 函数的选项类型
 */
export interface OpenUrlOptions {
    /** 是否启用远程调试模式，默认 false */
    remoteDebuggingMode?: boolean;
    /** 远程调试端口，仅在 remoteDebuggingMode 为 true 时有效，默认 9222 */
    port?: number;
}

/**
 * openDebuggingBrowser的流程图如下
 * %% 主流程：启动带调试模式的浏览器
flowchart TD
    A([开始]) --> B["定义支持浏览器数组<br>['chrome','edge']"]
    B --> C{"用户是否指定<br>browserType ?"}
    C -->|是| G
    C -->|否| D["调用 获取已安装浏览器<br>得到 browserType"]
    D --> E{" browserType<br>存在 ?"}
    E -->|否| F["提示用户下载并安装<br>支持数组第一项，流程结束"]
    E -->|是| G["以 --remote-debugging-port=9222<br>启动 browserType，流程结束"]

%% 子流程：获取已安装浏览器
flowchart TD
    A([开始]) --> B["定义支持浏览器数组<br>['chrome','edge']"]
    B --> C["获取系统默认浏览器<br>defaultBrowser"]
    C --> D{" defaultBrowser<br>存在且在数组中 ?"}
    D -->|是| E["返回 defaultBrowser<br>流程结束"]
    D -->|否| F["按数组顺序依次检查<br>是否已安装"]
    F --> G{" 找到第一个<br>已安装 ?"}
    G -->|是| H["返回该 browserType<br>流程结束"]
    G -->|否| I["返回空<br>流程结束"]
 */

/**
 * 启动带调试端口的浏览器（按照流程图逻辑）
 * @param url 要打开的 URL
 * @param port 远程调试端口，默认 9222
 * @param browserType 可选的浏览器类型，如果不提供则自动检测
 * @param completedCallback 浏览器启动完成后的回调函数
 */
function openDebuggingBrowser(url: string, port: number, browserType?: BrowserType, completedCallback?: () => void): void {
    console.log(`🚀 Launching browser with debugging port ${port}...`);

    // 设置 user-data-dir 以避免与正常浏览器实例冲突
    const userDataDir = platform() === 'win32'
        ? path.join(process.env.TEMP || process.env.TMP || tmpdir(), "chrome-debug")
        : path.join(tmpdir(), "chrome-debug");

    launchRemoteDebuggingBrowser(url, port, browserType, userDataDir, () => {
        console.log(`📡 Debugging URL: http://127.0.0.1:${port}`);
        if (completedCallback) {
            completedCallback();
        }
    });
}

/**
 * 使用系统默认命令打开浏览器
 * @param url 要打开的 URL
 * @param completedCallback 浏览器打开完成后的回调函数
 */
function openBrowser(url: string, completedCallback?: () => void): void {
    const currentPlatform = process.platform;

    let command: string | undefined;
    switch (currentPlatform) {
        case 'win32':
            command = `start ${url}`;
            break;
        case 'darwin':
            command = `open ${url}`;
            break;
        case 'linux':
            command = `xdg-open ${url}`;
            break;
        default:
            console.log(`请手动打开浏览器访问: ${url}`);
            if (completedCallback) {
                completedCallback();
            }
            return;
    }

    //@ts-expect-error
    //hack: when run on pink use simple browser instead of default browser
    if (process && process.addGlobalOpenUrl) {
        //@ts-expect-error
        process.addGlobalOpenUrl(url);
        if (completedCallback) {
            completedCallback();
        }
        return;
    }

    if (command) {
        exec(command, (error: any) => {
            if (error) {
                console.error('打开浏览器失败:', error.message);
                console.log(`请手动打开浏览器访问: ${url}`);
            } else {
                console.log(`正在浏览器中打开: ${url}`);
            }

            // 无论成功或失败都调用回调
            if (completedCallback) {
                completedCallback();
            }
        });
    } else if (completedCallback) {
        completedCallback();
    }
}

/**
 * 连接到 Chrome DevTools Protocol 并监听浏览器日志
 * @param port 远程调试端口，默认 9222
 * @param targetUrl 目标 URL，用于匹配正确的调试目标
 * @param retries 重试次数，默认 5 次
 * @param retryDelay 重试延迟（毫秒），默认 1000ms
 */
export async function connectToChromeDevTools(
    port: number = 9222,
    targetUrl?: string,
    retries: number = 5,
    retryDelay: number = 1000
): Promise<void> {
    return new Promise((resolve) => {
        // 获取调试目标列表
        const requestUrl = `http://127.0.0.1:${port}/json`;

        httpGet(requestUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const targets = JSON.parse(data);

                    // 查找匹配的目标（优先匹配 URL）
                    let target = targets.find((t: any) =>
                        targetUrl && t.url && t.url.includes(targetUrl)
                    );

                    // 如果没有找到匹配的，使用第一个 page 类型的目标
                    if (!target) {
                        target = targets.find((t: any) => t.type === 'page');
                    }

                    if (!target) {
                        console.warn(`未找到可用的调试目标，端口: ${port}`);
                        resolve();
                        return;
                    }

                    const wsUrl = target.webSocketDebuggerUrl;
                    if (!wsUrl) {
                        console.warn(`调试目标没有 WebSocket URL`);
                        resolve();
                        return;
                    }

                    // 连接到 WebSocket
                    const ws = new WebSocket(wsUrl);
                    let messageId = 1;

                    ws.on('open', () => {
                        console.log(`🔗 已连接到浏览器调试端口 ${port}`);

                        // 发送 Runtime.enable 命令
                        ws.send(JSON.stringify({
                            id: messageId++,
                            method: 'Runtime.enable',
                            params: {}
                        }));

                        // 发送 Log.enable 命令
                        ws.send(JSON.stringify({
                            id: messageId++,
                            method: 'Log.enable',
                            params: {}
                        }));

                        // 发送 Runtime.runIfWaitingForDebugger 命令（如果需要）
                        ws.send(JSON.stringify({
                            id: messageId++,
                            method: 'Runtime.runIfWaitingForDebugger',
                            params: {}
                        }));
                    });

                    ws.on('message', (data: WebSocket.Data) => {
                        try {
                            const message = JSON.parse(data.toString());

                            // 处理 Log.entryAdded 事件
                            if (message.method === 'Log.entryAdded') {
                                const entry = message.params.entry;
                                const level = entry.level || 'info';
                                const text = entry.text || '';
                                
                                // 处理聚合消息 (Chrome 可能会聚合相同的日志)
                                // 注意：CDP 的 Log.entryAdded 可能不包含 count 属性，这里预留扩展
                                // 如果使用了 Console.messageAdded (已废弃) 或其它事件可能会有
                                
                                // 格式化日志消息
                                const logMessage = `[Browser ${level.toUpperCase()}] ${text}`;

                                // 根据日志级别输出到 console
                                switch (level) {
                                    case 'error':
                                        console.error(logMessage);
                                        break;
                                    case 'warning':
                                        console.warn(logMessage);
                                        break;
                                    case 'info':
                                    case 'verbose':
                                    default:
                                        console.log(logMessage);
                                        break;
                                }
                            }

                            // 处理 Runtime.consoleAPICalled 事件（console.log 等）
                            if (message.method === 'Runtime.consoleAPICalled') {
                                const params = message.params;
                                const type = params.type || 'log';
                                const args = params.args || [];

                                // 辅助函数：格式化 RemoteObject
                                const formatRemoteObject = (arg: any) => {
                                    if (arg.type === 'string') {
                                        return arg.value;
                                    }
                                    // 优先显示具体值
                                    if (arg.value !== undefined) {
                                        // 处理 undefined, null, boolean, number
                                        return String(arg.value);
                                    }
                                    
                                    // 处理对象预览
                                    let str = arg.description || '';
                                    if (arg.preview && arg.preview.properties) {
                                        const props = arg.preview.properties
                                            .map((p: any) => `${p.name}: ${p.value || (p.type === 'string' ? `"${p.value}"` : p.type)}`)
                                            .join(', ');
                                        // 如果是 Array，格式稍有不同
                                        if (arg.subtype === 'array') {
                                            str = `${arg.description || 'Array'} [${props}]`;
                                        } else if (arg.subtype === 'error') {
                                            // Error 类型通常 description 已经包含了名字和消息，不需要 preview 属性
                                            str = arg.description;
                                        } else {
                                            str = `${arg.description || 'Object'} { ${props} }`;
                                        }
                                    }
                                    return str;
                                };

                                // 将参数转换为字符串
                                const messages = args.map(formatRemoteObject);

                                const consoleMessage = `[Browser Console.${type}] ${messages.join(' ')}`;

                                // 根据 console 类型输出
                                switch (type) {
                                    case 'error':
                                    case 'assert':
                                        console.error(consoleMessage);
                                        break;
                                    case 'warning':
                                        console.warn(consoleMessage);
                                        break;
                                    case 'info':
                                        console.info(consoleMessage);
                                        break;
                                    case 'debug':
                                    case 'trace':
                                        console.debug(consoleMessage);
                                        break;
                                    case 'clear':
                                        // 忽略 clear 或输出提示
                                        break;
                                    default:
                                        console.log(consoleMessage);
                                        break;
                                }
                            }

                            // 处理 Runtime.exceptionThrown 事件（未捕获的异常）
                            if (message.method === 'Runtime.exceptionThrown') {
                                const params = message.params;
                                const exceptionDetails = params.exceptionDetails;
                                const text = exceptionDetails.text; // 通常是 "Uncaught"
                                const exception = exceptionDetails.exception;
                                const description = exception ? (exception.description || exception.value) : '';

                                const url = exceptionDetails.url || '';
                                const line = exceptionDetails.lineNumber;
                                const col = exceptionDetails.columnNumber;

                                let errorMsg = `[Browser Error] ${text}`;
                                if (description) {
                                    errorMsg += `: ${description}`;
                                }
                                if (url) {
                                    errorMsg += `\n    at ${url}:${line}:${col}`;
                                }

                                console.error(errorMsg);
                            }
                        } catch (error: any) {
                            // 打印解析失败的原因，防止静默吞掉消息
                            if (process.env.NODE_ENV === 'development') {
                                console.debug(`[WS Processing Error] Failed to process message: ${error.message}`);
                            }
                        }
                    });

                    ws.on('error', (error) => {
                        console.warn(`WebSocket 连接错误: ${error.message}`);
                        resolve(); // 不 reject，允许继续执行
                    });

                    ws.on('close', () => {
                        console.log(`🔌 浏览器调试连接已关闭`);
                    });

                    // 连接成功
                    resolve();
                } catch (error: any) {
                    console.warn(`解析调试目标列表失败: ${error.message}`);
                    resolve(); // 不 reject，允许继续执行
                }
            });
        }).on('error', async (error) => {
            // 如果无法连接到调试端口，可能是浏览器还没启动，尝试重试
            if (retries > 0) {
                console.debug(`无法连接到调试端口 ${port}，${retries} 次重试后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                await connectToChromeDevTools(port, targetUrl, retries - 1, retryDelay);
            } else {
                console.debug(`无法连接到调试端口 ${port}: ${error.message}`);
            }
            resolve(); // 允许继续执行
        });
    });
}

/**
 * 打开 URL
 * @param url 要打开的 URL
 * @param options 选项
 * @param completedCallback 浏览器打开完成后的回调函数
 */
export function openUrl(url: string, options: OpenUrlOptions = {}, completedCallback?: () => void): void {
    const {
        remoteDebuggingMode = false,
        port = 9222
    } = options;

    if (remoteDebuggingMode) {
        // 自动检测并使用已安装的浏览器
        openDebuggingBrowser(url, port, undefined, completedCallback);
        return;
    }

    // 回退到默认浏览器打开方式
    openBrowser(url, completedCallback);
}

/**
 * 异步打开 URL，在浏览器打开完成时 resolve
 * @param url 要打开的 URL
 * @param options 选项
 * @returns Promise，在浏览器打开完成时 resolve
 */
export function openUrlAsync(url: string, options: OpenUrlOptions = {}): Promise<void> {
    return new Promise<void>((resolve) => {
        openUrl(url, options, () => {
            resolve();
        });
    });
}
