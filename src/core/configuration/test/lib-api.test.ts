jest.mock('../index', () => ({
    configurationManager: {
        getConfigPath: jest.fn(),
        save: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
    },
}));

describe('configuration lib api', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('should delegate getConfigPath to configurationManager', async () => {
        const { configurationManager } = require('../index') as typeof import('../index');
        configurationManager.getConfigPath = jest.fn().mockResolvedValue('/test/project/settings/cocos.config.json');

        const { getConfigPath } = require('../../../lib/configuration/configuration') as typeof import('../../../lib/configuration/configuration');

        await expect(getConfigPath()).resolves.toBe('/test/project/settings/cocos.config.json');
        expect(configurationManager.getConfigPath).toHaveBeenCalledWith('project');
    });

    it('should delegate local getConfigPath to configurationManager', async () => {
        const { configurationManager } = require('../index') as typeof import('../index');
        configurationManager.getConfigPath = jest.fn().mockResolvedValue('/test/project/profiles/cocos.config.json');

        const { getConfigPath } = require('../../../lib/configuration/configuration') as typeof import('../../../lib/configuration/configuration');

        await expect(getConfigPath('local')).resolves.toBe('/test/project/profiles/cocos.config.json');
        expect(configurationManager.getConfigPath).toHaveBeenCalledWith('local');
    });

    it('should delegate save by scope', async () => {
        const { configurationManager } = require('../index') as typeof import('../index');
        configurationManager.save = jest.fn().mockResolvedValue(undefined);

        const { save } = require('../../../lib/configuration/configuration') as typeof import('../../../lib/configuration/configuration');

        await save(true);
        expect(configurationManager.save).toHaveBeenCalledWith(true, 'project');

        await save(false, 'local');
        expect(configurationManager.save).toHaveBeenCalledWith(false, 'local');
    });

    it('should register save listener by scope and dispose it', () => {
        const { configurationManager } = require('../index') as typeof import('../index');
        const { onDidSave } = require('../../../lib/configuration/configuration') as typeof import('../../../lib/configuration/configuration');
        const callback = jest.fn();

        const dispose = onDidSave(callback, 'local');

        expect(configurationManager.on).toHaveBeenCalledWith('configuration:save', expect.any(Function));
        const handler = (configurationManager.on as jest.Mock).mock.calls[0][1];

        handler();
        expect(callback).not.toHaveBeenCalled();

        handler({}, 'project');
        expect(callback).not.toHaveBeenCalled();

        handler({}, 'local');
        expect(callback).toHaveBeenCalledTimes(1);

        dispose();
        expect(configurationManager.off).toHaveBeenCalledWith('configuration:save', handler);
    });
});
