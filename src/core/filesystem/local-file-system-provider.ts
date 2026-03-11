import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as path from 'path';
import { IFileSystemProvider, FileStat, FileType } from './file-system-provider';

/**
 * 默认的本地文件系统提供者
 * 封装了 Node.js 的 fs 和 fs-extra 模块
 */
export class LocalFileSystemProvider implements IFileSystemProvider {
    /**
     * 将 Node.js 的 Stats 转换为抽象的 FileStat
     */
    private _convertStat(stat: fs.Stats): FileStat {
        let type = FileType.Unknown;
        if (stat.isFile()) {
            type = FileType.File;
        } else if (stat.isDirectory()) {
            type = FileType.Directory;
        } else if (stat.isSymbolicLink()) {
            type = FileType.SymbolicLink;
        }

        return {
            type,
            ctime: stat.ctimeMs,
            mtime: stat.mtimeMs,
            size: stat.size
        };
    }

    /**
     * 从 URI 中提取实际的本地路径
     * 这里简化处理，假设传入的就是本地路径，或者以 file:// 开头
     */
    private _getPath(uri: string): string {
        if (uri.startsWith('file://')) {
            // 简单的 file:// 解析，实际可能需要更严谨的处理 (如 url.fileURLToPath)
            return uri.replace(/^file:\/\//, '');
        }
        return uri;
    }

    async exists(uri: string): Promise<boolean> {
        return fse.pathExists(this._getPath(uri));
    }

    async stat(uri: string): Promise<FileStat> {
        const stat = await fse.stat(this._getPath(uri));
        return this._convertStat(stat);
    }

    async readFile(uri: string): Promise<Uint8Array> {
        const buffer = await fse.readFile(this._getPath(uri));
        return new Uint8Array(buffer);
    }

    async readFileString(uri: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        return fse.readFile(this._getPath(uri), { encoding });
    }

    async writeFile(uri: string, content: Uint8Array | string, options?: { create?: boolean; overwrite?: boolean }): Promise<void> {
        const p = this._getPath(uri);
        const exists = await fse.pathExists(p);

        if (!exists && options?.create === false) {
            throw new Error(`File not found: ${uri}`);
        }

        if (exists && options?.overwrite === false) {
            throw new Error(`File already exists: ${uri}`);
        }

        // fse.outputFile 会自动创建父目录
        await fse.outputFile(p, content);
    }

    async readDirectory(uri: string): Promise<[string, FileType][]> {
        const p = this._getPath(uri);
        const entries = await fse.readdir(p, { withFileTypes: true });
        
        return entries.map(entry => {
            let type = FileType.Unknown;
            if (entry.isFile()) {
                type = FileType.File;
            } else if (entry.isDirectory()) {
                type = FileType.Directory;
            } else if (entry.isSymbolicLink()) {
                type = FileType.SymbolicLink;
            }
            return [entry.name, type];
        });
    }

    async createDirectory(uri: string): Promise<void> {
        await fse.ensureDir(this._getPath(uri));
    }

    async delete(uri: string, options?: { recursive?: boolean }): Promise<void> {
        const p = this._getPath(uri);
        if (options?.recursive) {
            await fse.remove(p);
        } else {
            // unlink 不会递归删除目录
            const stat = await fse.stat(p);
            if (stat.isDirectory()) {
                await fse.rmdir(p);
            } else {
                await fse.unlink(p);
            }
        }
    }

    async rename(oldUri: string, newUri: string, options?: { overwrite?: boolean }): Promise<void> {
        const oldPath = this._getPath(oldUri);
        const newPath = this._getPath(newUri);

        const exists = await fse.pathExists(newPath);
        if (exists && options?.overwrite === false) {
            throw new Error(`Destination already exists: ${newUri}`);
        }

        await fse.move(oldPath, newPath, { overwrite: options?.overwrite ?? true });
    }

    async copy(source: string, destination: string, options?: { overwrite?: boolean }): Promise<void> {
        const srcPath = this._getPath(source);
        const destPath = this._getPath(destination);

        const exists = await fse.pathExists(destPath);
        if (exists && options?.overwrite === false) {
            throw new Error(`Destination already exists: ${destination}`);
        }

        await fse.copy(srcPath, destPath, { overwrite: options?.overwrite ?? true });
    }
}
