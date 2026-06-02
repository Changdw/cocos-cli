import * as fse from 'fs-extra';
import * as path from 'path';
import * as assetdb from '@cocos/asset-db';
import type { IAssetDeleteOptions, IAssetFileSystemProvider } from '@cocos/asset-db/libs/filesystem';
import type { Meta } from '@cocos/asset-db/libs/meta';

describe('synced asset-db internal library deletion', () => {
    const PATH = {
        ROOT: path.join(__dirname, 'asset-db-internal-delete-sync'),
        TARGET: path.join(__dirname, 'asset-db-internal-delete-sync/target'),
        LIBRARY: path.join(__dirname, 'asset-db-internal-delete-sync/library'),
        TEMP: path.join(__dirname, 'asset-db-internal-delete-sync/temp'),
        FILE: path.join(__dirname, 'asset-db-internal-delete-sync/target/terrain.terrain'),
        RENAMED_FILE: path.join(__dirname, 'asset-db-internal-delete-sync/target/terrain-renamed.terrain'),
        SOURCE: path.join(__dirname, 'asset-db-internal-delete-sync/source.bin'),
    };

    class TerrainLikeImporter extends assetdb.Importer {
        get name() {
            return 'terrain';
        }

        async import(asset: assetdb.Asset) {
            await asset.copyToLibrary('.bin', asset.source);
            return true;
        }
    }

    function createDB() {
        return new assetdb.AssetDB({
            name: 'assets',
            target: PATH.TARGET,
            library: PATH.LIBRARY,
            temp: PATH.TEMP,
            level: 0,
            ignoreFiles: [],
            readonly: false,
        });
    }

    function createAsset(metaOverrides: Partial<Meta> = {}) {
        const db = createDB();
        const meta: Meta = {
            ver: '0.0.0',
            importer: 'terrain',
            imported: true,
            uuid: '12345678-1234-1234-1234-123456789012',
            files: [],
            subMetas: {},
            userData: {},
            displayName: '',
            id: '',
            name: 'terrain',
            ...metaOverrides,
        };

        return new assetdb.Asset(PATH.FILE, meta, db);
    }

    afterEach(() => {
        assetdb.resetFileSystemProvider();
        fse.removeSync(PATH.ROOT);
    });

    it('rename reimport should not send previous terrain library bin to provider trash branch', async () => {
        const trashCalls: string[] = [];
        const provider: IAssetFileSystemProvider = {
            async delete(filePath: string, options?: IAssetDeleteOptions) {
                if (filePath.startsWith(PATH.LIBRARY) && options?.useTrash !== false) {
                    trashCalls.push(filePath);
                }
                await fse.remove(filePath);
            },
            async copy(sourcePath: string, destinationPath: string) {
                await fse.copy(sourcePath, destinationPath);
            },
        };
        const db = createDB();

        assetdb.setFileSystemProvider(provider);
        db.importerManager.add(TerrainLikeImporter, ['.terrain']);
        fse.ensureDirSync(PATH.TARGET);
        fse.ensureDirSync(PATH.LIBRARY);
        await db.start();

        try {
            fse.outputFileSync(PATH.FILE, 'terrain source');
            await db.refresh(PATH.FILE);

            const importedAsset = db.path2asset.get(PATH.FILE);
            expect(importedAsset).toBeDefined();
            expect(fse.existsSync(`${importedAsset!.library}.bin`)).toBe(true);

            fse.moveSync(PATH.FILE, PATH.RENAMED_FILE);
            fse.moveSync(`${PATH.FILE}.meta`, `${PATH.RENAMED_FILE}.meta`);

            await db.refresh(PATH.RENAMED_FILE);

            expect(trashCalls).toEqual([]);
            expect(db.path2asset.has(PATH.FILE)).toBe(false);
            expect(db.path2asset.has(PATH.RENAMED_FILE)).toBe(true);
        } finally {
            await db.stop();
        }
    });

    it('deleteFromLibrary should permanently delete library files instead of entering provider trash branch', async () => {
        const trashCalls: string[] = [];
        const provider: IAssetFileSystemProvider = {
            async delete(filePath: string, options?: IAssetDeleteOptions) {
                if (options?.useTrash !== false) {
                    trashCalls.push(filePath);
                }
                await fse.remove(filePath);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const asset = createAsset({
            files: ['.bin'],
        });
        const targetFile = `${asset.library}.bin`;

        fse.outputFileSync(targetFile, 'existing');

        await asset.deleteFromLibrary('.bin');

        expect(trashCalls).toEqual([]);
        expect(fse.existsSync(targetFile)).toBe(false);
    });

    it('copyToLibrary overwrite cleanup should permanently delete old library files', async () => {
        const trashCalls: string[] = [];
        const provider: IAssetFileSystemProvider = {
            async delete(filePath: string, options?: IAssetDeleteOptions) {
                if (options?.useTrash !== false) {
                    trashCalls.push(filePath);
                }
                await fse.remove(filePath);
            },
            async copy(sourcePath: string, destinationPath: string) {
                await fse.copy(sourcePath, destinationPath);
            },
        };

        assetdb.setFileSystemProvider(provider);

        const asset = createAsset();
        const targetFile = `${asset.library}.bin`;

        fse.outputFileSync(PATH.SOURCE, 'source');
        fse.outputFileSync(targetFile, 'existing');

        await asset.copyToLibrary('.bin', PATH.SOURCE);

        expect(trashCalls).toEqual([]);
        expect(fse.readFileSync(targetFile, 'utf8')).toBe('source');
    });
});
