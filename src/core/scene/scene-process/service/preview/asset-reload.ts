import { assetManager } from 'cc';

function getUuidVariants(uuid: string): string[] {
    const variants = new Set<string>([uuid]);
    try {
        const editorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        const decompressed = editorExtends?.UuidUtils?.decompressUuid?.(uuid);
        if (decompressed) variants.add(decompressed);
    } catch {
        // UuidUtils is not always available during preview bootstrap.
    }
    return [...variants];
}

export function removePreviewAssetCache(uuid: string): void {
    for (const id of getUuidVariants(uuid)) {
        if (assetManager.assets.has(id)) {
            assetManager.assets.remove(id);
        }
    }
}

export async function loadPreviewAsset<T>(uuid: string, label: string, timeoutMs = 10000): Promise<T> {
    removePreviewAssetCache(uuid);
    return await new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Load ${label} timeout: ${uuid}`)), timeoutMs);
        assetManager.loadAny(uuid, { reloadAsset: true }, (err: any, asset: T) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve(asset);
        });
    });
}
