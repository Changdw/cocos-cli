import { Stats } from 'fs';

/**
 * 文件类型枚举，参考 vscode.FileType
 */
export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64
}

/**
 * 文件状态信息，参考 vscode.FileStat
 */
export interface FileStat {
    type: FileType;
    ctime: number;
    mtime: number;
    size: number;
}

/**
 * 抽象的文件系统提供者接口
 * 设计灵感来源于 VS Code 的 IFileSystemProvider
 * 这使得 cocos-cli 可以在不同的环境（Node.js、浏览器、远程环境）下工作
 */
export interface IFileSystemProvider {
    /**
     * 检查文件或目录是否存在
     */
    exists(uri: string): Promise<boolean>;

    /**
     * 获取文件或目录的状态信息
     */
    stat(uri: string): Promise<FileStat>;

    /**
     * 读取文件内容
     */
    readFile(uri: string): Promise<Uint8Array>;

    /**
     * 读取文件内容为字符串
     */
    readFileString(uri: string, encoding?: BufferEncoding): Promise<string>;

    /**
     * 写入文件内容
     */
    writeFile(uri: string, content: Uint8Array | string, options?: { create?: boolean, overwrite?: boolean }): Promise<void>;

    /**
     * 读取目录下的所有文件和子目录
     * 返回一个数组，元素为 [名称, 类型]
     */
    readDirectory(uri: string): Promise<[string, FileType][]>;

    /**
     * 创建目录
     */
    createDirectory(uri: string): Promise<void>;

    /**
     * 删除文件或目录
     */
    delete(uri: string, options?: { recursive?: boolean }): Promise<void>;

    /**
     * 重命名文件或目录
     */
    rename(oldUri: string, newUri: string, options?: { overwrite?: boolean }): Promise<void>;

    /**
     * 复制文件或目录
     */
    copy(source: string, destination: string, options?: { overwrite?: boolean }): Promise<void>;
}
