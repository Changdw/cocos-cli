export interface IPreviewInstance {
    onMouseDown(event: any): void;
    onMouseMove(event: any): void;
    onMouseUp(event: any): void;
    onMouseWheel(event: any): void;
    viewToggle(): void;
    is2DView(): boolean;
    resetCameraView(): void;
    hide(): void;
}

export interface IMaterialPreviewInstance extends IPreviewInstance {
    switchPrimitive(type: string): void;
    setLightEnable(enabled: boolean): void;
}

export interface ISpinePreviewInstance extends IPreviewInstance {
    play(): void;
    pause(): void;
    stop(): void;
    setSkinIndex(index: number): void;
    setAnimationIndex(index: number): void;
    close(): void;
}

export interface IPreviewService extends IAnimationGraphMotionPreviewService {
    open(uuid: string): Promise<IPreviewInstance | null>;
    generateThumbnail(uuid: string, assetType: string, width?: number, height?: number): Promise<any>;
}

/**
 * Animation Graph Motion 预览子能力（scene-process Preview 服务按同名方法透传）。
 * `target` 与 Inspector 使用的 `AnimationGraphTarget` 一致。
 */
export interface IAnimationGraphMotionPreviewService {
    showAnimationGraphMotion(uuidOrUrlOrPath: string, target: import('../../assets/@types/public').AnimationGraphTarget): Promise<boolean>;
    hideAnimationGraphMotion(): void;
    setAnimationGraphMotionModel(uuid: string): Promise<void>;
    setAnimationGraphMotionTime(time: number): void;
    playAnimationGraphMotion(): void;
    pauseAnimationGraphMotion(): void;
    stopAnimationGraphMotion(): void;
    setAnimationGraphMotionVariable(name: string, value: number): void;
    isAnimationGraphMotionActive(): Promise<boolean>;
    queryAnimationGraphMotionImage(info: { width: number; height: number }): Promise<unknown>;
}

export type IPublicPreviewService = Pick<IPreviewService,
    'open' | 'generateThumbnail'
    | 'showAnimationGraphMotion' | 'hideAnimationGraphMotion'
    | 'setAnimationGraphMotionModel' | 'setAnimationGraphMotionTime'
    | 'playAnimationGraphMotion' | 'pauseAnimationGraphMotion' | 'stopAnimationGraphMotion'
    | 'setAnimationGraphMotionVariable' | 'isAnimationGraphMotionActive'
    | 'queryAnimationGraphMotionImage'
>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IPreviewEvents {
}
