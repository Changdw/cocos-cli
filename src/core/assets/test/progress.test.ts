'use strict';

import { assetManager, assetDBManager } from '..';
import { IAsset } from '../@types/private';

const ENABLE_LOG = false;

// 日志辅助函数
const log = (...args: any[]) => {
    if (ENABLE_LOG) {
        console.log(...args);
    }
};

describe('测试资源进度事件 (progress)', () => {
    // 模拟的进度信息记录
    let emitRecords: Array<{ current: number, total: number, url: string, state: string }> = [];

    // 保存原始的方法和状态
    let originalReady: boolean;
    let originalAssetDBMap: any;
    
    // 获取无类型限制的 manager 用于访问私有方法
    const manager: any = assetManager;

    beforeAll(() => {
        log('[progress.test] 开始设置测试环境...');
        originalReady = assetDBManager.ready;
        originalAssetDBMap = assetDBManager.assetDBMap;
        log(`[progress.test] 保存原始状态: ready=${originalReady}, assetDBMap keys=${Object.keys(originalAssetDBMap || {}).length}`);

        // 监听 progress 事件
        assetManager.onProgress((current, total, url, state) => {
            const record = { current, total, url, state };
            emitRecords.push(record);
            log(`[progress.test] 收到 progress 事件: ${current}/${total} - ${url} [${state}]`);
        });
        log('[progress.test] 已注册 progress 事件监听器');
    });

    beforeEach(() => {
        emitRecords = [];
        log('[progress.test] 重置测试状态，清空进度记录');
        // 伪造未就绪状态
        assetDBManager.ready = false;
        
        // 伪造 DB 的进度数据
        assetDBManager.assetDBMap = {
            assets: {
                assetProgressInfo: { current: 10, total: 100 }
            },
            internal: {
                assetProgressInfo: { current: 5, total: 20 }
            }
        } as any;
        log('[progress.test] 设置模拟进度: assets=10/100, internal=5/20, 全局=15/120');
    });

    afterAll(() => {
        log('[progress.test] 清理测试环境...');
        // 恢复原始状态
        assetDBManager.ready = originalReady;
        assetDBManager.assetDBMap = originalAssetDBMap;
        assetManager.removeAllListeners('progress');
        log(`[progress.test] 已恢复原始状态: ready=${originalReady}`);
        log(`[progress.test] 测试完成，共记录 ${emitRecords.length} 条进度事件`);
    });

    it('当发生 add 事件时，应抛出 processing 状态并聚合所有 DB 的进度', () => {
        const mockAsset = { url: 'db://assets/test.png' } as IAsset;
        log(`[progress.test] 测试: 触发 add 事件 - ${mockAsset.url}`);
        manager['_onAssetAdd'](mockAsset);
        
        log(`[progress.test] 验证: 收到 ${emitRecords.length} 条进度记录`);
        expect(emitRecords.length).toBe(1);
        const record = emitRecords[0];
        log(`[progress.test] 进度详情:`, record);
        expect(record).toEqual({
            current: 15,    // 10 + 5
            total: 120,     // 100 + 20
            url: 'db://assets/test.png',
            state: 'processing'
        });
        log('[progress.test] ✓ 验证通过: 进度已正确聚合');
    });

    it('当发生 change 事件时，应抛出 processing 状态', () => {
        const mockAsset = { url: 'db://assets/test2.png' } as IAsset;
        log(`[progress.test] 测试: 触发 change 事件 - ${mockAsset.url}`);
        manager['_onAssetChange'](mockAsset);
        
        log(`[progress.test] 验证: 收到 ${emitRecords.length} 条进度记录`);
        expect(emitRecords.length).toBe(1);
        log(`[progress.test] 状态: ${emitRecords[0].state}`);
        expect(emitRecords[0].state).toBe('processing');
        log('[progress.test] ✓ 验证通过: 状态为 processing');
    });

    it('当发生 delete 事件时，应抛出 processing 状态', () => {
        const mockAsset = { url: 'db://assets/test3.png' } as IAsset;
        log(`[progress.test] 测试: 触发 delete 事件 - ${mockAsset.url}`);
        manager['_onAssetDelete'](mockAsset);
        
        log(`[progress.test] 验证: 收到 ${emitRecords.length} 条进度记录`);
        expect(emitRecords.length).toBe(1);
        log(`[progress.test] 状态: ${emitRecords[0].state}`);
        expect(emitRecords[0].state).toBe('processing');
        log('[progress.test] ✓ 验证通过: 状态为 processing');
    });

    it('当发生 added (完成) 事件时，应默认抛出 success 状态', () => {
        const mockAsset = { url: 'db://assets/test-done.png' } as IAsset;
        log(`[progress.test] 测试: 触发 added 事件 - ${mockAsset.url}`);
        manager['_onAssetAdded'](mockAsset);
        
        log(`[progress.test] 验证: 收到 ${emitRecords.length} 条进度记录`);
        expect(emitRecords.length).toBe(1);
        log(`[progress.test] 状态: ${emitRecords[0].state}`);
        expect(emitRecords[0].state).toBe('success');
        log('[progress.test] ✓ 验证通过: 状态为 success');
    });

    it('当发生 changed (完成) 且存在 importError 时，应抛出 failed 状态', () => {
        const mockAsset = { url: 'db://assets/test-err.png', importError: new Error('test') } as IAsset;
        log(`[progress.test] 测试: 触发 changed 事件（带 importError） - ${mockAsset.url}`);
        manager['_onAssetChanged'](mockAsset);
        
        log(`[progress.test] 验证: 收到 ${emitRecords.length} 条进度记录`);
        expect(emitRecords.length).toBe(1);
        log(`[progress.test] 状态: ${emitRecords[0].state}`);
        expect(emitRecords[0].state).toBe('failed');
        log('[progress.test] ✓ 验证通过: 状态为 failed（因 importError）');
    });

    it('当发生 deleted (完成) 且资源 invalid 为 true 时，应抛出 failed 状态', async () => {
        const mockAsset = { url: 'db://assets/test-invalid.png', invalid: true } as IAsset;
        log(`[progress.test] 测试: 触发 deleted 事件（invalid=true） - ${mockAsset.url}`);
        // _onAssetDeleted 内可能包含异步删除逻辑，但这里模拟简单对象
        await manager['_onAssetDeleted'](mockAsset);
        
        log(`[progress.test] 验证: 收到 ${emitRecords.length} 条进度记录`);
        expect(emitRecords.length).toBe(1);
        log(`[progress.test] 状态: ${emitRecords[0].state}`);
        expect(emitRecords[0].state).toBe('failed');
        log('[progress.test] ✓ 验证通过: 状态为 failed（因 invalid）');
    });

    it('当 assetDBManager 已经 ready 时，不应抛出 progress 事件，而是普通变动事件', () => {
        log('[progress.test] 测试: 设置 ready=true，验证不再触发 progress 事件');
        assetDBManager.ready = true;
        let eventCalled = false;
        const addListener = () => { 
            eventCalled = true;
            log('[progress.test] 收到 asset-add 事件');
        };
        assetManager.on('asset-add', addListener);
        
        const mockAsset = { url: 'db://assets/test-ready.png' } as IAsset;
        log(`[progress.test] 触发 added 事件 - ${mockAsset.url}`);
        manager['_onAssetAdded'](mockAsset);
        
        log(`[progress.test] 验证: progress 记录数=${emitRecords.length}, asset-add 事件=${eventCalled}`);
        expect(emitRecords.length).toBe(0); // 没有 progress
        expect(eventCalled).toBe(true);     // 有 asset-add
        log('[progress.test] ✓ 验证通过: ready 状态下不触发 progress，但触发 asset-add');
        
        assetManager.removeListener('asset-add', addListener);
    });
});