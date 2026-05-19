import { isAbsolute, join } from 'path';

export const DEFAULT_CREATE_TEMPLATE_ROOT = '.creator/templates';

export function resolveImportTemplateRoot(projectRoot: string, configuredPath = DEFAULT_CREATE_TEMPLATE_ROOT): string {
    if (isAbsolute(configuredPath)) {
        return configuredPath;
    }
    return join(projectRoot, configuredPath);
}
