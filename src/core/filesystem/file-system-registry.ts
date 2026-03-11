import { IFileSystemProvider } from './file-system-provider';
import { LocalFileSystemProvider } from './local-file-system-provider';

/**
 * 文件系统注册中心，用于管理不同 URI scheme 的文件系统提供者
 */
export class FileSystemRegistry {
    private _providers = new Map<string, IFileSystemProvider>();
    private _defaultProvider: IFileSystemProvider;

    constructor() {
        // 默认实现为本地文件系统
        this._defaultProvider = new LocalFileSystemProvider();
        // 默认注册 file:// 协议
        this.registerProvider('file', this._defaultProvider);
    }

    /**
     * 注册一个新的文件系统提供者
     * @param scheme 协议名，如 'file', 'memfs', 'db'
     * @param provider 文件系统实现
     */
    registerProvider(scheme: string, provider: IFileSystemProvider): void {
        this._providers.set(scheme, provider);
    }

    /**
     * 获取指定 URI 的文件系统提供者
     * 如果无法解析 scheme，或者未注册该 scheme，则返回默认的本地文件系统提供者
     */
    getProvider(uri: string): IFileSystemProvider {
        const schemeMatch = uri.match(/^([a-zA-Z0-9_-]+):\/\//);
        if (schemeMatch && schemeMatch[1]) {
            const scheme = schemeMatch[1];
            const provider = this._providers.get(scheme);
            if (provider) {
                return provider;
            }
        }
        // 回退到默认 provider
        return this._defaultProvider;
    }
}

// 导出全局单例
export const fsRegistry = new FileSystemRegistry();

/**
 * 全局入口包装器，提供与 IFileSystemProvider 一致的接口，
 * 内部自动根据 URI 路由到对应的 Provider。
 */
export const workspaceFs = {
    exists: async (uri: string) => fsRegistry.getProvider(uri).exists(uri),
    stat: async (uri: string) => fsRegistry.getProvider(uri).stat(uri),
    readFile: async (uri: string) => fsRegistry.getProvider(uri).readFile(uri),
    readFileString: async (uri: string, encoding?: BufferEncoding) => fsRegistry.getProvider(uri).readFileString(uri, encoding),
    writeFile: async (uri: string, content: Uint8Array | string, options?: { create?: boolean, overwrite?: boolean }) => fsRegistry.getProvider(uri).writeFile(uri, content, options),
    readDirectory: async (uri: string) => fsRegistry.getProvider(uri).readDirectory(uri),
    createDirectory: async (uri: string) => fsRegistry.getProvider(uri).createDirectory(uri),
    delete: async (uri: string, options?: { recursive?: boolean }) => fsRegistry.getProvider(uri).delete(uri, options),
    rename: async (oldUri: string, newUri: string, options?: { overwrite?: boolean }) => {
        // 注：这里假设跨 Provider 的重命名/移动暂时不支持，只在同一个 Provider 内进行
        const oldProvider = fsRegistry.getProvider(oldUri);
        const newProvider = fsRegistry.getProvider(newUri);
        if (oldProvider !== newProvider) {
            throw new Error('Rename across different file system providers is not supported yet.');
        }
        return oldProvider.rename(oldUri, newUri, options);
    },
    copy: async (source: string, destination: string, options?: { overwrite?: boolean }) => {
        const srcProvider = fsRegistry.getProvider(source);
        const destProvider = fsRegistry.getProvider(destination);
        if (srcProvider === destProvider) {
            return srcProvider.copy(source, destination, options);
        } else {
            // 跨 Provider 复制：先读后写
            const content = await srcProvider.readFile(source);
            await destProvider.writeFile(destination, content, options);
        }
    }
};
