import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.resolve(__dirname, '..');

function readJson(relativePath: string) {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function readText(relativePath: string) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('CI regression guards', () => {
    it('pins @cocos/asset-db to the published alpha.9 package in package.json and package-lock.json', () => {
        const packageJson = readJson('package.json');
        const packageLock = readJson('package-lock.json');

        expect(packageJson.dependencies['@cocos/asset-db']).toBe('3.0.0-alpha.9');
        expect(packageLock.packages[''].dependencies['@cocos/asset-db']).toBe('3.0.0-alpha.9');
        expect(packageLock.packages['node_modules/@cocos/asset-db'].version).toBe('3.0.0-alpha.9');
    });

    it('does not allow Jest to resolve .d.ts files as runtime modules', () => {
        const jestConfig = readText('jest.config.ts');

        expect(jestConfig).not.toContain("'d.ts'");
    });

    it('uses npm ci in setup-env so CI installs the lockfile exactly', () => {
        const setupEnvAction = readText('.github/actions/setup-env/action.yml');

        expect(setupEnvAction).toMatch(/^\s*run:\s*npm ci\s*$/m);
        expect(setupEnvAction).not.toMatch(/^\s*run:\s*npm i\s*$/m);
    });
});
