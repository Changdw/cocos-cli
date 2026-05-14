'use strict';

import type { IAssetFileSystemProvider, IAssetRenameOptions } from '@cocos/asset-db/libs/filesystem';
import { ensureDir, existsSync, move, remove } from 'fs-extra';
import { dirname, join, relative } from 'path';
import type { IMoveOptions } from '../@types/private';
import type { DeleteAssetOptions } from '../@types/public';
import assetConfig from '../asset-config';
import Utils from '../../base/utils';

let provider: IAssetFileSystemProvider = {};

export function getFileSystemProvider(): IAssetFileSystemProvider {
    return provider;
}

export function setFileSystemProvider(nextProvider: IAssetFileSystemProvider): void {
    provider = nextProvider || {};
}

export function resetFileSystemProvider(): void {
    provider = {};
}

async function ensureParentDirectory(path: string): Promise<void> {
    const dir = dirname(path);
    if (existsSync(dir)) {
        return;
    }

    if (provider.createDirectory) {
        await Promise.resolve(provider.createDirectory(dir));
        return;
    }

    await ensureDir(dir);
}

async function deletePath(path: string, options: DeleteAssetOptions = {}): Promise<void> {
    if (provider.delete) {
        await Promise.resolve(provider.delete(path, options));
        return;
    }

    if (options.useTrash !== false) {
        await Utils.File.trashItem(path);
        return;
    }

    await remove(path);
}

export async function renamePath(oldPath: string, newPath: string, options?: IAssetRenameOptions): Promise<void> {
    if (provider.rename) {
        await ensureParentDirectory(newPath);
        await Promise.resolve(provider.rename(oldPath, newPath, options));
        return;
    }

    await move(oldPath, newPath, { overwrite: !!options?.overwrite });
}

export async function removeAssetSource(file: string, options: DeleteAssetOptions = {}): Promise<boolean> {
    if (!existsSync(file)) {
        return true;
    }

    const deleteOptions: DeleteAssetOptions = {
        useTrash: options.useTrash !== false,
    };

    try {
        await deletePath(file, deleteOptions);
    } catch (error) {
        console.error(error);
        throw new Error(`asset db removeFile ${file} fail!`);
    }

    try {
        const metaFile = file + '.meta';
        if (existsSync(metaFile)) {
            await deletePath(metaFile, deleteOptions);
        }
    } catch (error) {
        // do nothing
    }

    return true;
}

export async function moveAssetSource(source: string, target: string, options?: IMoveOptions): Promise<void> {
    const moveOptions = options?.overwrite ? options : { overwrite: false };
    const renameOptions = { overwrite: !!moveOptions.overwrite };

    try {
        if (!Utils.Path.contains(source, target)) {
            await renamePath(source + '.meta', target + '.meta', { overwrite: true });
            await renamePath(source, target, renameOptions);
            return;
        }

        const tempDir = join(assetConfig.data.tempRoot, 'move-temp');
        const relativePath = relative(assetConfig.data.root, target);
        const tempPath = join(tempDir, relativePath);
        const tempMetaPath = tempPath + '.meta';

        if (existsSync(tempPath)) {
            await deletePath(tempPath, { useTrash: false });
        }
        if (existsSync(tempMetaPath)) {
            await deletePath(tempMetaPath, { useTrash: false });
        }

        await ensureParentDirectory(tempMetaPath);
        await renamePath(source + '.meta', tempMetaPath, { overwrite: true });
        await renamePath(source, tempPath, { overwrite: true });

        await ensureParentDirectory(target + '.meta');
        await renamePath(tempMetaPath, target + '.meta', { overwrite: true });
        await renamePath(tempPath, target, renameOptions);
    } catch (error) {
        console.error(`asset db moveFile from ${source} -> ${target} fail!`);
        console.error(error);
    }
}
