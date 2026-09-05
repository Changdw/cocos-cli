/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SUD. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DirectionalLight, Node, Prefab, Scene, instantiate } from 'cc';
import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { loadPreviewAsset, removePreviewAssetCache } from './asset-reload';
import { Rpc } from '../../rpc';
import { Service } from '../core/decorator';
import type {
    AnimationGraphMotionPreviewData,
    AnimationGraphMotionView,
    AnimationGraphTarget,
} from '../../../../assets/@types/public';

/**
 * engine editor 模块：与动画图资源服务一致的加载方式（scene-process 的
 * engine-bootstrap 已把 cc/editor/new-gen-anim 作为必须模块加载）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNewGenAnim(): any {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('cc/editor/new-gen-anim');
}

/**
 * Animation Graph Motion 预览器。
 *
 * 负责加载预览 Prefab、根据「目标 Motion 的结构化视图 + 图内变量」重建引擎 Motion、
 * 并驱动 `MotionPreviewer` 采样姿态到模型节点上；`queryPreviewData` 由外层按帧轮询取图。
 *
 * ```mermaid
 * sequenceDiagram
 *     participant PinK as PinK 主进程(Preview 代理)
 *     participant Preview as AnimationGraphMotionPreview(scene-process)
 *     participant Asset as assetManager RPC(main-process)
 *     participant Engine as MotionPreviewer(cc/editor/new-gen-anim)
 *     PinK->>Preview: showMotionPreview(uuid, target)
 *     Preview->>Asset: request('assetManager','queryAnimationGraphMotionPreviewData',...)
 *     Asset-->>Preview: { motion: AnimationGraphMotionView, variables }
 *     Preview->>Engine: new MotionPreviewer(modelNode) + setMotion(rebuilt motion)
 *     PinK->>Preview: setTime / play / pause / stop / setVariable
 *     Preview->>Engine: setTime(time) + evaluate()
 *     PinK->>Preview: queryPreviewData({width,height})
 *     Preview-->>PinK: RGBA buffer(模型当前姿态帧)
 * ```
 */
export class AnimationGraphMotionPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private motionPreviewer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly loadedClips = new Map<string, any>();
    private active = false;
    private playing = false;
    private time = 0;
    private lastPlayTick = 0;
    // 未等到模型时的待处理 Motion（webview 可能先选 Motion 再拖入模型）。
    private pendingMotion: { uuid: string; target: AnimationGraphTarget } | null = null;

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Animation Graph Motion Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;
    }

    public get isActive(): boolean {
        return this.active;
    }

    public getIsPlaying(): boolean {
        return this.playing;
    }

    public async setModel(uuid: string): Promise<void> {
        if (!uuid) {
            console.warn(`Failed to set model in Animation Graph Motion preview, by uuid: ${uuid}`);
            return;
        }

        const prefabUuid = await this._resolvePrefabUuid(uuid);
        if (!prefabUuid) {
            throw new Error(`Unable to preview model ${uuid}: the imported cc.Prefab sub-asset is unavailable.`);
        }

        removePreviewAssetCache(uuid);
        const prefabAsset = await loadPreviewAsset<Prefab>(prefabUuid, 'model', { reloadAsset: true });

        if (this._modelNode) {
            this.scene.removeChild(this._modelNode);
            if (this._modelNode.isValid) {
                this._modelNode.destroy();
            }
        }

        this._modelNode = instantiate(prefabAsset) as Node;
        this._modelNode.parent = this.scene;

        // 重建 MotionPreviewer（绑定到新模型根节点的骨骼层级）。
        this._resetMotionPreviewer();

        // 若此前已下发 Motion，模型就绪后继续接入。
        if (this.pendingMotion) {
            const pending = this.pendingMotion;
            this.pendingMotion = null;
            try {
                await this._attachMotion(pending.uuid, pending.target);
            } catch (error) {
                console.warn(`[AnimationGraphMotionPreview] Failed to attach pending motion:`, error);
            }
        }

        this.cameraComp.enabled = true;
        this.resetCameraView();
    }

    public async showMotionPreview(uuidOrUrlOrPath: string, target: AnimationGraphTarget): Promise<boolean> {
        if (!this._modelNode) {
            // 暂无模型：记住 Motion，等 setModel 后接入；返回 false 表示"等待模型"。
            this.pendingMotion = { uuid: uuidOrUrlOrPath, target };
            return false;
        }
        this.pendingMotion = null;
        await this._attachMotion(uuidOrUrlOrPath, target);
        this.active = true;
        this.time = 0;
        this.lastPlayTick = Date.now();
        this._evaluate();
        return true;
    }

    public hideMotionPreview(): void {
        this.pendingMotion = null;
        this.active = false;
        this.pauseMotionPreview();
        if (this.motionPreviewer) {
            this.motionPreviewer.destroy?.();
            this.motionPreviewer = null;
        }
        this.hide();
    }

    public resetMotionPreview(): void {
        this.time = 0;
        this.pendingMotion = null;
        this._resetMotionPreviewer();
    }

    public playMotionPreview(): void {
        if (!this.active) {
            return;
        }
        this.playing = true;
        this.lastPlayTick = Date.now();
        this._evaluate();
    }

    public pauseMotionPreview(): void {
        this.playing = false;
    }

    public stopMotionPreview(): void {
        this.playing = false;
        this.time = 0;
        this._evaluate();
    }

    public setTimeMotionPreview(time: number): void {
        this.time = Math.max(0, time);
        this._evaluate();
    }

    /**
     * 更新预览变量。变量实例当前未随数据契约注入 MotionPreviewer（见方案文档的
     * 风险点），因此仅记录调用，等变量实例搭建完成后生效。
     */
    public setMotionPreviewVariable(name: string, value: number): void {
        if (!this.motionPreviewer) {
            return;
        }
        try {
            this.motionPreviewer.updateVariable(name, value);
        } catch (error) {
            console.warn(`[AnimationGraphMotionPreview] setVariable failed:`, error);
        }
    }

    public getMotionPreviewTimelineStats(): { timeLineLength: number } | null {
        return this.motionPreviewer?.timelineStats ?? null;
    }

    public resetCameraView(): void {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode]));
        }
    }

    public async queryPreviewData(info: { width: number; height: number }) {
        if (this.playing && this.active) {
            const now = Date.now();
            const delta = Math.max(0, (now - this.lastPlayTick) / 1000);
            this.lastPlayTick = now;
            if (delta > 0) {
                this.time += delta;
                this._evaluate();
            }
        }
        return super.queryPreviewData(info);
    }

    /**
     * 重建引擎 Motion 并喂给 MotionPreviewer。
     */
    private async _attachMotion(uuidOrUrlOrPath: string, target: AnimationGraphTarget): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await Rpc.getInstance().request(
            'assetManager',
            'queryAnimationGraphMotionPreviewData',
            [uuidOrUrlOrPath, target as Extract<AnimationGraphTarget, { kind: 'motion' }>],
        )) as unknown as AnimationGraphMotionPreviewData | null;
        if (!data?.motion) {
            throw new Error(`Animation Graph Motion preview data is unavailable for target ${JSON.stringify(target)}`);
        }

        this._resetMotionPreviewer();
        if (!this.motionPreviewer) {
            throw new Error('Animation Graph Motion preview model has not been set.');
        }

        // 先并行加载 Motion 用到的全部动画剪辑，再重建引擎 Motion。
        this.loadedClips.clear();
        await Promise.all(
            Array.from(new Set(collectClipUuids(data.motion)))
                .filter(Boolean)
                .map(async (clipUuid) => {
                    try {
                        this.loadedClips.set(clipUuid, await loadPreviewAsset(clipUuid, 'animation-clip'));
                    } catch (error) {
                        console.warn(`[AnimationGraphMotionPreview] Failed to load clip ${clipUuid}:`, error);
                    }
                }),
        );

        const motion = this._rebuildMotion(data.motion);
        this.motionPreviewer.setMotion(motion);
        this.time = 0;
        this._evaluate();
    }

    private _resetMotionPreviewer(): void {
        if (this.motionPreviewer) {
            this.motionPreviewer.destroy?.();
            this.motionPreviewer = null;
        }
        if (!this._modelNode) {
            return;
        }
        try {
            const { MotionPreviewer } = getNewGenAnim();
            if (!MotionPreviewer) {
                console.warn('[AnimationGraphMotionPreview] MotionPreviewer is not available in the engine module.');
                return;
            }
            this.motionPreviewer = new MotionPreviewer(this._modelNode);
        } catch (error) {
            console.warn('[AnimationGraphMotionPreview] Failed to create MotionPreviewer:', error);
        }
    }

    /**
     * 根据结构化视图重建引擎 Motion。blend-1d/2d/direct 会把变量绑定清空为静态值，
     * 以便「未注册变量实例」时仍可按 param 默认值采样（详见 bindOr 的回归行为）。
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _rebuildMotion(view: AnimationGraphMotionView | null | undefined): any {
        const api = getNewGenAnim();
        if (!view) {
            return null;
        }
        switch (view.type) {
        case 'clip': {
            const clipMotion = new api.ClipMotion();
            if (view.clipUuid) {
                clipMotion.clip = this.loadedClips.get(view.clipUuid) ?? null;
            }
            return clipMotion;
        }
        case 'blend-1d': {
            const blend = new api.AnimationBlend1D();
            blend.param.value = view.value ?? 0;
            blend.param.variable = '';
            blend.items = (view.children ?? []).map((child) => {
                const item = new api.AnimationBlend1D.Item();
                item.motion = this._rebuildMotion(child);
                item.threshold = typeof child.threshold === 'number'
                    ? child.threshold
                    : child.threshold?.x ?? 0;
                return item;
            });
            return blend;
        }
        case 'blend-2d': {
            const blend = new api.AnimationBlend2D();
            blend.paramX.value = view.valueX ?? 0;
            blend.paramX.variable = '';
            blend.paramY.value = view.valueY ?? 0;
            blend.paramY.variable = '';
            if (typeof view.algorithm === 'number') {
                blend.algorithm = view.algorithm;
            }
            blend.items = (view.children ?? []).map((child) => {
                const item = new api.AnimationBlend2D.Item();
                item.motion = this._rebuildMotion(child);
                item.threshold.set(
                    child.threshold && typeof child.threshold === 'object' ? child.threshold.x : 0,
                    child.threshold && typeof child.threshold === 'object' ? child.threshold.y : 0,
                );
                return item;
            });
            return blend;
        }
        case 'blend-direct': {
            const blend = new api.AnimationBlendDirect();
            blend.items = (view.children ?? []).map((child) => {
                const item = new api.AnimationBlendDirect.Item();
                item.motion = this._rebuildMotion(child);
                item.weight.value = child.weight?.value ?? 0;
                item.weight.variable = '';
                return item;
            });
            return blend;
        }
        default:
            return null;
        }
    }

    private _evaluate(): void {
        if (!this.motionPreviewer) {
            return;
        }
        try {
            this.motionPreviewer.setTime(this.time);
            this.motionPreviewer.evaluate();
        } catch (error) {
            console.warn('[AnimationGraphMotionPreview] evaluate failed:', error);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async _resolvePrefabUuid(uuid: string): Promise<string | null> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid, ['subAssets']]);
        if (assetInfo?.type === 'cc.Prefab') {
            return assetInfo.uuid || uuid;
        }
        for (const sub of Object.values(assetInfo?.subAssets || {})) {
            if (sub?.type === 'cc.Prefab' || sub?.importer === 'gltf-scene') {
                return sub.uuid;
            }
        }
        return null;
    }
}

/**
 * 收集 Motion 视图递归引用到的全部动画剪辑 uuid，供预览前并行加载。
 */
function collectClipUuids(view: AnimationGraphMotionView | null | undefined, out: string[] = []): string[] {
    if (!view) {
        return out;
    }
    if (view.type === 'clip' && view.clipUuid) {
        out.push(view.clipUuid);
    }
    for (const child of view.children ?? []) {
        collectClipUuids(child, out);
    }
    return out;
}