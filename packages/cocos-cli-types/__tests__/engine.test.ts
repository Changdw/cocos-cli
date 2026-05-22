type EngineModule = typeof import('../engine');

describe('cocos-cli-types: engine', () => {
    it('should be able to import init', () => {
        let _init: EngineModule['init'] | undefined = undefined;
        expect(_init).toBeUndefined();
    });
});
