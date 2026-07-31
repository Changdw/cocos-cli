import { PluginManager } from '../manager/plugin';
import builderConfig from '../share/builder-config';

describe('PluginManager.getOptionsByPlatform', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns a cloned merge of common and platform options', async () => {
        const commonOptions: any = {
            name: 'game',
            nested: {
                fromCommon: true,
            },
        };
        const platformOptions: any = {
            nested: {
                fromPlatform: true,
            },
            packages: {
                web: {
                    enabled: true,
                },
            },
        };
        jest.spyOn(builderConfig, 'getProject').mockImplementation(async (key?: string) => {
            if (key === 'common') {
                return commonOptions;
            }
            if (key === 'platforms.web-mobile') {
                return platformOptions;
            }
            return undefined as any;
        });

        const options = await new PluginManager().getOptionsByPlatform('web-mobile');

        (options.packages as any).web.enabled = false;
        expect(options.platform).toBe('web-mobile');
        expect(options.outputName).toBe('web-mobile');
        expect(platformOptions.packages.web.enabled).toBe(true);
        expect((commonOptions as any).platform).toBeUndefined();
        expect((commonOptions as any).outputName).toBeUndefined();
    });
});
