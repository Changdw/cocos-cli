function getDeferredModule(system, id) {
    if (!system || !system.get) {
        return undefined;
    }

    let resolvedId = id;
    if (system.resolve) {
        try {
            resolvedId = system.resolve(id);
        } catch {
            // Some named modules are registered without an import-map entry.
            // Fall back to the original ID for those modules.
        }
    }

    return system.get(resolvedId) || (resolvedId !== id ? system.get(id) : undefined);
}

function createDeferredModule(id, getSystem, getModule) {
    return new Proxy({}, {
        get(target, prop) {
            const real = getModule(getSystem(), id);
            return real ? real[prop] : undefined;
        },
        has(target, prop) {
            const real = getModule(getSystem(), id);
            return real ? prop in real : false;
        },
    });
}

function createDeferredModuleSource() {
    return `
        const _getDeferredModule = ${getDeferredModule.toString()};
        const _createDeferredModule = ${createDeferredModule.toString()};
        function _getSystem() {
            return typeof System === 'undefined' ? undefined : System;
        }
        export function syncImport(id) {
            return _createDeferredModule(id, _getSystem, _getDeferredModule);
        }
        export default { syncImport: syncImport };
    `;
}

module.exports = {
    createDeferredModule,
    createDeferredModuleSource,
    getDeferredModule,
};
