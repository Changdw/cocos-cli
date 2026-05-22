type ScriptingModule = typeof import('../scripting');

describe('cocos-cli-types: scripting', () => {
    it('should be able to import init', () => {
        let _init: ScriptingModule['init'] | undefined = undefined;
        expect(_init).toBeUndefined();
    });
});
