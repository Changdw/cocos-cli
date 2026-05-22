type ProjectModule = typeof import('../project');

describe('cocos-cli-types: project', () => {
    it('should be able to import api functions', () => {
        let _init: ProjectModule['init'] | undefined = undefined;
        let _open: ProjectModule['open'] | undefined = undefined;
        let _close: ProjectModule['close'] | undefined = undefined;

        expect(_init).toBeUndefined();
        expect(_open).toBeUndefined();
        expect(_close).toBeUndefined();
    });
});
