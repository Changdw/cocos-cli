/**
 * 资源变更通知接口测试和推荐用法演示
 * 
 * 本文件展示了如何使用 AssetManager 的资源变更监听接口
 * 推荐使用 onAssetAdded/onAssetChanged/onAssetRemoved 方法，它们返回移除监听的函数
 */

import { assetManager } from '../index';
import { IAssetChangeInfo } from '../@types/private';

describe('Asset Change Notifications', () => {
    
    /**
     * ============================================
     * 推荐用法：使用专用方法（返回移除函数）
     * ============================================
     * 
     * 这是最推荐的用法，因为：
     * 1. 类型安全：IDE 提供完整的类型提示
     * 2. 易于清理：返回的函数可以直接调用移除监听
     * 3. 无需维护引用：不需要手动保存 handler 引用
     */
    
    describe('推荐用法：onAssetAdded/onAssetChanged/onAssetRemoved 方法', () => {
        it('应该使用 onAssetAdded 方法监听资源添加', () => {
            // 推荐用法：调用专用方法，获取移除函数
            const removeListener = assetManager.onAssetAdded((info: IAssetChangeInfo) => {
                // info 包含完整的资源变更信息
                expect(info).toHaveProperty('uuid');
                expect(info).toHaveProperty('name');
                expect(info).toHaveProperty('type');
                expect(info).toHaveProperty('url');      // 逻辑路径，例如 db://assets/image.png
                expect(info).toHaveProperty('source');   // 物理路径，例如 D:\project\assets\image.png
            });

            // 验证监听器已注册
            expect(assetManager.listenerCount('onAssetAdded')).toBeGreaterThan(0);

            // 清理：直接调用返回的函数即可移除监听
            removeListener();
            
            // 验证监听器已移除
            expect(assetManager.listenerCount('onAssetAdded')).toBe(0);
        });

        it('应该使用 onAssetChanged 方法监听资源变更', () => {
            const removeListener = assetManager.onAssetChanged((info: IAssetChangeInfo) => {
                expect(info).toHaveProperty('uuid');
                expect(info).toHaveProperty('name');
                expect(info).toHaveProperty('type');
                expect(info).toHaveProperty('url');
                expect(info).toHaveProperty('source');
            });

            expect(assetManager.listenerCount('onAssetChanged')).toBeGreaterThan(0);
            removeListener();
            expect(assetManager.listenerCount('onAssetChanged')).toBe(0);
        });

        it('应该使用 onAssetRemoved 方法监听资源删除', () => {
            const removeListener = assetManager.onAssetRemoved((info: IAssetChangeInfo) => {
                expect(info).toHaveProperty('uuid');
                expect(info).toHaveProperty('name');
                expect(info).toHaveProperty('type');
                expect(info).toHaveProperty('url');
                expect(info).toHaveProperty('source');
            });

            expect(assetManager.listenerCount('onAssetRemoved')).toBeGreaterThan(0);
            removeListener();
            expect(assetManager.listenerCount('onAssetRemoved')).toBe(0);
        });

        /**
         * 实际应用示例：在组件或类中使用
         */
        it('实际应用：在类中使用推荐用法', () => {
            class AssetMonitor {
                private removeListeners: Array<() => void> = [];

                constructor() {
                    // 添加监听，保存移除函数
                    this.removeListeners.push(
                        assetManager.onAssetAdded((info) => {
                            console.log(`[添加] ${info.name} (${info.type})`);
                            this.handleAssetChange(info, 'added');
                        })
                    );

                    this.removeListeners.push(
                        assetManager.onAssetChanged((info) => {
                            console.log(`[变更] ${info.name}`);
                            this.handleAssetChange(info, 'changed');
                        })
                    );

                    this.removeListeners.push(
                        assetManager.onAssetRemoved((info) => {
                            console.log(`[删除] ${info.name}`);
                            this.handleAssetChange(info, 'removed');
                        })
                    );
                }

                private handleAssetChange(info: IAssetChangeInfo, action: string) {
                    // 根据资源类型采取不同操作
                    switch (info.type) {
                        case 'cc.ImageAsset':
                            console.log(`  -> 图片资源${action}，需要刷新图片缓存`);
                            break;
                        case 'cc.SceneAsset':
                            console.log(`  -> 场景资源${action}，需要重新加载场景`);
                            break;
                        default:
                            console.log(`  -> 其他类型资源${action}`);
                    }
                }

                destroy() {
                    // 清理所有监听器：一次性调用所有移除函数
                    this.removeListeners.forEach(remove => remove());
                    this.removeListeners = [];
                }
            }

            const monitor = new AssetMonitor();
            expect(assetManager.listenerCount('onAssetAdded')).toBeGreaterThan(0);
            expect(assetManager.listenerCount('onAssetChanged')).toBeGreaterThan(0);
            expect(assetManager.listenerCount('onAssetRemoved')).toBeGreaterThan(0);

            // 清理
            monitor.destroy();
            expect(assetManager.listenerCount('onAssetAdded')).toBe(0);
            expect(assetManager.listenerCount('onAssetChanged')).toBe(0);
            expect(assetManager.listenerCount('onAssetRemoved')).toBe(0);
        });

        /**
         * 一次性监听示例
         */
        it('一次性监听：使用 once 方法', () => {
            let callCount = 0;
            
            // 使用 once 方法，监听器只会执行一次
            assetManager.once('onAssetAdded', (info: IAssetChangeInfo) => {
                callCount++;
                expect(callCount).toBe(1);
            });

            // 注意：once 方法不会返回移除函数，因为它会自动移除
            expect(assetManager.listenerCount('onAssetAdded')).toBeGreaterThan(0);
        });
    });

    /**
     * ============================================
     * 传统用法：使用 EventEmitter 的 on 方法
     * ============================================
     * 
     * 这种方式仍然可用，但需要手动管理 handler 引用
     */
    
    describe('传统用法：EventEmitter on 方法', () => {
        it('可以使用 on 方法添加监听', (done) => {
            const handler = (info: IAssetChangeInfo) => {
                expect(info).toHaveProperty('uuid');
                expect(info).toHaveProperty('name');
                expect(info).toHaveProperty('type');
                expect(info).toHaveProperty('url');
                expect(info).toHaveProperty('source');
                
                // 必须手动移除，需要保留 handler 引用
                assetManager.removeListener('onAssetAdded', handler);
                done();
            };

            assetManager.on('onAssetAdded', handler);
        });

        it('支持多个监听器', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            assetManager.on('onAssetAdded', handler1);
            assetManager.on('onAssetAdded', handler2);

            // 验证两个监听器都已注册
            const listeners = assetManager.listeners('onAssetAdded');
            expect(listeners.length).toBeGreaterThanOrEqual(2);

            // 清理：需要分别移除
            assetManager.removeListener('onAssetAdded', handler1);
            assetManager.removeListener('onAssetAdded', handler2);
        });

        it('可以移除特定监听器', () => {
            const handler = jest.fn();
            
            assetManager.on('onAssetChanged', handler);
            const countBefore = assetManager.listenerCount('onAssetChanged');
            
            assetManager.removeListener('onAssetChanged', handler);
            const countAfter = assetManager.listenerCount('onAssetChanged');
            
            expect(countAfter).toBeLessThan(countBefore);
        });

        it('可以移除所有监听器', () => {
            assetManager.on('onAssetChanged', jest.fn());
            assetManager.on('onAssetChanged', jest.fn());
            
            expect(assetManager.listenerCount('onAssetChanged')).toBeGreaterThan(0);
            
            // 移除该事件的所有监听器
            assetManager.removeAllListeners('onAssetChanged');
            
            expect(assetManager.listenerCount('onAssetChanged')).toBe(0);
        });
    });

    /**
     * ============================================
     * 向后兼容：旧的事件接口
     * ============================================
     * 
     * 旧的事件接口（asset-add, asset-change, asset-delete）仍然可用
     * 它们提供完整的 IAsset 对象，适合需要深度操作的场景
     */
    
    describe('向后兼容：旧的事件接口', () => {
        it('仍然支持 asset-add 事件', (done) => {
            const handler = jest.fn();
            
            assetManager.on('asset-add', handler);
            assetManager.removeListener('asset-add', handler);
            done();
        });

        it('仍然支持 asset-change 事件', (done) => {
            const handler = jest.fn();
            
            assetManager.on('asset-change', handler);
            assetManager.removeListener('asset-change', handler);
            done();
        });

        it('仍然支持 asset-delete 事件', (done) => {
            const handler = jest.fn();
            
            assetManager.on('asset-delete', handler);
            assetManager.removeListener('asset-delete', handler);
            done();
        });
    });

    /**
     * ============================================
     * IAssetChangeInfo 字段说明
     * ============================================
     * 
     * IAssetChangeInfo 接口包含以下字段：
     * - uuid: string      - 资源的唯一标识符
     * - name: string      - 资源名称（优先使用 displayName）
     * - type: string      - 资源类型（例如：cc.ImageAsset, cc.SceneAsset）
     * - url: string       - 逻辑路径（例如：db://assets/image.png）
     * - source: string    - 物理路径（例如：D:\project\assets\image.png）
     */
    
    describe('IAssetChangeInfo 字段验证', () => {
        it('应该包含所有必需字段', () => {
            const handler = (info: IAssetChangeInfo) => {
                // 验证所有字段存在
                expect(typeof info.uuid).toBe('string');
                expect(typeof info.name).toBe('string');
                expect(typeof info.type).toBe('string');
                expect(typeof info.url).toBe('string');
                expect(typeof info.source).toBe('string');
            };

            const removeListener = assetManager.onAssetAdded(handler);
            removeListener();
        });
    });
});
