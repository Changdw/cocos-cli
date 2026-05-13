jest.mock('../src/core/engine', () => ({
    Engine: {
        queryLocalizedRenderConfig: jest.fn(() => ({
            version: 'test-version',
            features: {
                base: {
                    label: 'Core',
                },
            },
            categories: {},
        })),
    },
}));

import { COMMON_STATUS } from '../src/api/base/schema-base';
import { EngineApi } from '../src/api/engine/engine';

describe('EngineApi', () => {
    it('should expose translated render-config data from the engine module', async () => {
        const { Engine } = require('../src/core/engine');
        const api = new EngineApi();

        const result = await api.getRenderConfig();

        expect(result.code).toBe(COMMON_STATUS.SUCCESS);
        expect(result.data).toEqual({
            version: 'test-version',
            features: {
                base: {
                    label: 'Core',
                },
            },
            categories: {},
        });
        expect(Engine.queryLocalizedRenderConfig).toHaveBeenCalledTimes(1);
    });

    it('should return a failure result when engine render-config querying throws', async () => {
        const { Engine } = require('../src/core/engine');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const api = new EngineApi();

        Engine.queryLocalizedRenderConfig.mockImplementationOnce(() => {
            throw new Error('Engine not init');
        });

        const result = await api.getRenderConfig();

        expect(result.code).toBe(COMMON_STATUS.FAIL);
        expect(result.reason).toBe('Engine not init');

        consoleErrorSpy.mockRestore();
    });
});
