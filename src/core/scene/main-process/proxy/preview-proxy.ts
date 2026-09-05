/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SUD. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AnimationGraphTarget } from '../../../assets/@types/public';
import type { IAnimationGraphMotionPreviewService } from '../../common';
import { Rpc } from '../rpc';

/**
 * 场景进程 PreviewService 的主进程 RPC 代理。
 */
export const PreviewProxy: IAnimationGraphMotionPreviewService = {
    async showAnimationGraphMotion(uuidOrUrlOrPath: string, target: AnimationGraphTarget): Promise<boolean> {
        const result = await Rpc.getInstance().request('Preview', 'showAnimationGraphMotion', [uuidOrUrlOrPath, target]);
        return result === true;
    },

    hideAnimationGraphMotion(): void {
        void Rpc.getInstance().request('Preview', 'hideAnimationGraphMotion', []);
    },

    setAnimationGraphMotionModel(uuid: string): Promise<void> {
        return Rpc.getInstance().request('Preview', 'setAnimationGraphMotionModel', [uuid]);
    },

    setAnimationGraphMotionTime(time: number): void {
        void Rpc.getInstance().request('Preview', 'setAnimationGraphMotionTime', [time]);
    },

    playAnimationGraphMotion(): void {
        void Rpc.getInstance().request('Preview', 'playAnimationGraphMotion', []);
    },

    pauseAnimationGraphMotion(): void {
        void Rpc.getInstance().request('Preview', 'pauseAnimationGraphMotion', []);
    },

    stopAnimationGraphMotion(): void {
        void Rpc.getInstance().request('Preview', 'stopAnimationGraphMotion', []);
    },

    setAnimationGraphMotionVariable(name: string, value: number): void {
        void Rpc.getInstance().request('Preview', 'setAnimationGraphMotionVariable', [name, value]);
    },

    async isAnimationGraphMotionActive(): Promise<boolean> {
        const result = await Rpc.getInstance().request('Preview', 'isAnimationGraphMotionActive', []);
        return result === true;
    },

    queryAnimationGraphMotionImage(info: { width: number; height: number }): Promise<unknown> {
        return Rpc.getInstance().request('Preview', 'queryAnimationGraphMotionImage', [info]);
    },
};