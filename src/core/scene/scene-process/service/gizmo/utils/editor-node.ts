import cc, { type Node } from 'cc';

function getEditorNodeApi(): any {
    const ccGlobal = (globalThis as any).cc;
    return (cc as any)?.EditorExtends?.Node
        || ccGlobal?.EditorExtends?.Node
        || (globalThis as any).EditorExtends?.Node;
}

export function getEditorNodeByPath(path: string): Node | null {
    if (!path) {
        return null;
    }
    return getEditorNodeApi()?.getNodeByPath?.(path) ?? getPrefabNodeByRelativePath(path);
}

export function getEditorNodeByUuid(uuid: string): Node | null {
    if (!uuid) {
        return null;
    }
    return getEditorNodeApi()?.getNode?.(uuid) ?? null;
}

export function getEditorNodeUuidByPath(path: string): string {
    if (!path) {
        return '';
    }
    const nodeApi = getEditorNodeApi();
    return nodeApi?.getNodeUuidByPath?.(path) || getPrefabNodeByRelativePath(path)?.uuid || '';
}

export function getEditorNodePath(node: Node): string {
    return getEditorNodeApi()?.getNodePath?.(node) ?? '';
}

function getPrefabNodeByRelativePath(path: string): Node | null {
    try {
        const { Service } = require('../../core/decorator');
        if (Service.Editor?.getCurrentEditorType?.() !== 'prefab') {
            return null;
        }
        const root = Service.Editor?.getRootNode?.() as Node | null;
        if (!root) {
            return null;
        }
        return findNodeFromPrefabRoot(root, path);
    } catch {
        return null;
    }
}

function findNodeFromPrefabRoot(root: Node, path: string): Node | null {
    const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = normalizePrefabPathSegments(normalized.split('/').filter(Boolean), root.name, getCurrentSceneName());
    if (!segments) {
        return null;
    }
    let node: Node | null = root;
    for (const segment of segments) {
        node = node.children?.find((child) => child.name === segment) ?? null;
        if (!node) {
            return null;
        }
    }
    return node;
}

function getCurrentSceneName(): string {
    return (cc as any).director?.getScene?.()?.name ?? '';
}

function normalizePrefabPathSegments(segments: string[], rootName: string, currentSceneName: string): string[] | null {
    if (segments[0] === rootName) {
        return segments.slice(1);
    }
    if (segments[0] === 'should_hide_in_hierarchy' && segments[1] === rootName) {
        return segments.slice(2);
    }
    if (segments[0] === currentSceneName && segments[1] === 'should_hide_in_hierarchy' && segments[2] === rootName) {
        return segments.slice(3);
    }
    return null;
}
