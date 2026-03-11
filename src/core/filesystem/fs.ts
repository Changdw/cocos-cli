import * as fsExtra from 'fs-extra';
import * as fsNative from 'fs';
import * as assetdb from '@cocos/asset-db';
import { fsRegistry, workspaceFs, IFileSystemProvider, FileStat, FileType } from './index';

let customFS: any = null;

const createProxy = <T extends object>(target: T): T => {
    return new Proxy(target, {
        get(t: any, prop: string) {
            if (customFS && prop in customFS) {
                const val = customFS[prop];
                if (typeof val === 'function') {
                    return val.bind(customFS);
                }
                return val;
            }
            const val = t[prop];
            if (typeof val === 'function') {
                return val.bind(t);
            }
            return val;
        }
    });
};

export const fs = createProxy(fsNative);
export const fse = createProxy(fsExtra);

/**
 * 将传统的 fs 对象适配为 IFileSystemProvider 接口
 */
class LegacyFsAdapter implements IFileSystemProvider {
    constructor(private legacyFs: any) {}

    private _getPath(uri: string): string {
        return uri.replace(/^[^:]+:\/\//, ''); // 简单去掉协议头
    }

    async exists(uri: string): Promise<boolean> {
        const p = this._getPath(uri);
        if (typeof this.legacyFs.pathExists === 'function') {
            return this.legacyFs.pathExists(p);
        } else if (typeof this.legacyFs.existsSync === 'function') {
            return this.legacyFs.existsSync(p);
        }
        throw new Error('legacy fs missing exists method');
    }

    async stat(uri: string): Promise<FileStat> {
        const p = this._getPath(uri);
        const stat = typeof this.legacyFs.stat === 'function' ? await this.legacyFs.stat(p) : this.legacyFs.statSync(p);
        return {
            type: stat.isDirectory() ? FileType.Directory : FileType.File,
            ctime: stat.ctimeMs || stat.ctime?.getTime() || 0,
            mtime: stat.mtimeMs || stat.mtime?.getTime() || 0,
            size: stat.size
        };
    }

    async readFile(uri: string): Promise<Uint8Array> {
        const p = this._getPath(uri);
        const buffer = typeof this.legacyFs.readFile === 'function' ? await this.legacyFs.readFile(p) : this.legacyFs.readFileSync(p);
        return new Uint8Array(buffer);
    }

    async readFileString(uri: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        const p = this._getPath(uri);
        return typeof this.legacyFs.readFile === 'function' ? await this.legacyFs.readFile(p, { encoding }) : this.legacyFs.readFileSync(p, { encoding });
    }

    async writeFile(uri: string, content: Uint8Array | string, options?: { create?: boolean; overwrite?: boolean; }): Promise<void> {
        const p = this._getPath(uri);
        if (typeof this.legacyFs.outputFile === 'function') {
            await this.legacyFs.outputFile(p, content);
        } else if (typeof this.legacyFs.writeFile === 'function') {
            await this.legacyFs.writeFile(p, content);
        } else {
            this.legacyFs.writeFileSync(p, content);
        }
    }

    async readDirectory(uri: string): Promise<[string, FileType][]> {
        const p = this._getPath(uri);
        const entries = typeof this.legacyFs.readdir === 'function' ? await this.legacyFs.readdir(p, { withFileTypes: true }) : this.legacyFs.readdirSync(p, { withFileTypes: true });
        return entries.map((entry: any) => [
            typeof entry === 'string' ? entry : entry.name,
            entry.isDirectory && entry.isDirectory() ? FileType.Directory : FileType.File
        ]);
    }

    async createDirectory(uri: string): Promise<void> {
        const p = this._getPath(uri);
        if (typeof this.legacyFs.ensureDir === 'function') {
            await this.legacyFs.ensureDir(p);
        } else if (typeof this.legacyFs.mkdir === 'function') {
            await this.legacyFs.mkdir(p, { recursive: true });
        } else {
            this.legacyFs.mkdirSync(p, { recursive: true });
        }
    }

    async delete(uri: string, options?: { recursive?: boolean; }): Promise<void> {
        const p = this._getPath(uri);
        if (typeof this.legacyFs.remove === 'function') {
            await this.legacyFs.remove(p);
        } else if (typeof this.legacyFs.rm === 'function') {
            await this.legacyFs.rm(p, { recursive: options?.recursive, force: true });
        } else {
            this.legacyFs.rmSync(p, { recursive: options?.recursive, force: true });
        }
    }

    async rename(oldUri: string, newUri: string, options?: { overwrite?: boolean; }): Promise<void> {
        const oldPath = this._getPath(oldUri);
        const newPath = this._getPath(newUri);
        if (typeof this.legacyFs.move === 'function') {
            await this.legacyFs.move(oldPath, newPath, { overwrite: options?.overwrite });
        } else if (typeof this.legacyFs.rename === 'function') {
            await this.legacyFs.rename(oldPath, newPath);
        } else {
            this.legacyFs.renameSync(oldPath, newPath);
        }
    }

    async copy(source: string, destination: string, options?: { overwrite?: boolean; }): Promise<void> {
        const srcPath = this._getPath(source);
        const destPath = this._getPath(destination);
        if (typeof this.legacyFs.copy === 'function') {
            await this.legacyFs.copy(srcPath, destPath, { overwrite: options?.overwrite });
        } else if (typeof this.legacyFs.copyFile === 'function') {
            await this.legacyFs.copyFile(srcPath, destPath);
        } else {
            this.legacyFs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 允许外部注册新的文件操作对象，以替换默认的 fs 操作
 * 这个方法需要被尽早调用
 * @param newFS 外部注入的自定义文件系统对象
 */
export function injectFS(newFS: any) {
    customFS = newFS;
    
    if (newFS) {
        let provider: IFileSystemProvider;
        if (typeof newFS.readFile === 'function' && typeof newFS.stat === 'function' && newFS.readDirectory) {
            // 如果新 FS 本身就是实现了类似 IFileSystemProvider 的对象
            provider = newFS as IFileSystemProvider;
        } else {
            // 否则作为 Node.js 风格的 fs 对象进行适配
            provider = new LegacyFsAdapter(newFS);
        }
        // 注册到 fsRegistry 中，使用 pink 协议作为示例
        fsRegistry.registerProvider('pink', provider);
    }

    // 同时注入到底层的 asset-db 中
    if (assetdb && typeof (assetdb as any).injectFS === 'function') {
        (assetdb as any).injectFS(newFS);
    }
}

