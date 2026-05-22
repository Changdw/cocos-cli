type BuilderModule = typeof import('../builder');
import type { IBuildTaskOption, IBuildResultData } from '../builder';

describe('cocos-cli-types: builder', () => {
    it('should be able to import build task api functions', () => {
        let _build: BuilderModule['build'] | undefined = undefined;
        let _buildBundleOnly: BuilderModule['buildBundleOnly'] | undefined = undefined;
        let _make: BuilderModule['make'] | undefined = undefined;
        let _run: BuilderModule['run'] | undefined = undefined;
        let _queryBuildConfig: BuilderModule['queryBuildConfig'] | undefined = undefined;

        expect(_build).toBeUndefined();
        expect(_buildBundleOnly).toBeUndefined();
        expect(_make).toBeUndefined();
        expect(_run).toBeUndefined();
        expect(_queryBuildConfig).toBeUndefined();
    });

    it('should be able to import IBuildTaskOption', () => {
        let options: Partial<IBuildTaskOption> = {
            buildPath: 'build',
        };
        expect(options.buildPath).toBe('build');
    });
    
    it('should be able to import IBuildResultData', () => {
        // IBuildResultData is a branded string or a complex type depending on compilation output.
        // We will just verify it can be declared as a type.
        let result: IBuildResultData | undefined = undefined;
        expect(result).toBeUndefined();
    });
});
