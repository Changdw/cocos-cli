type ConfigurationModule = typeof import('../configuration');
import type { IConfiguration } from '../configuration';

describe('cocos-cli-types: configuration', () => {
    it('should be able to import api functions', () => {
        let _init: ConfigurationModule['init'] | undefined = undefined;
        let _migrateFromProject: ConfigurationModule['migrateFromProject'] | undefined = undefined;
        let _reload: ConfigurationModule['reload'] | undefined = undefined;

        expect(_init).toBeUndefined();
        expect(_migrateFromProject).toBeUndefined();
        expect(_reload).toBeUndefined();
    });

    it('should be able to import IConfiguration', () => {
        let options: Partial<IConfiguration> = {
            name: 'test-config'
        };
        expect(options.name).toBe('test-config');
    });
});
