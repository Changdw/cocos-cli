import type { ICocosConfigurationNode } from '../configuration/script/metadata';
import { createNode, objectSchema } from '../configuration/script/metadata';

export function createImportMetadataNodes(): ICocosConfigurationNode[] {
    return [
        createNode('import', 'i18n:configuration.import.title', 'import', {
            'import.globList': {
                type: 'array',
                default: [],
                title: 'i18n:configuration.import.globList.title',
                description: 'i18n:configuration.import.globList.description',
                items: { type: 'string', title: 'i18n:configuration.import.globList.itemTitle' },
            },
            'import.restoreAssetDBFromCache': {
                type: 'boolean',
                default: false,
                title: 'i18n:configuration.import.restoreAssetDBFromCache.title',
            },
            'import.createTemplateRoot': {
                type: 'string',
                default: '',
                title: 'i18n:configuration.import.createTemplateRoot.title',
            },
            'import.userDataTemplate': objectSchema(undefined, {
                title: 'i18n:configuration.import.userDataTemplate.title',
                description: 'i18n:configuration.import.userDataTemplate.description',
                additionalProperties: true,
            }),
            'import.fbx': objectSchema({
                legacyFbxImporter: objectSchema({
                    visible: {
                        type: 'boolean',
                        default: true,
                        title: 'i18n:configuration.import.fbx.legacyFbxImporter.visible.title',
                    },
                }, {
                    title: 'i18n:configuration.import.fbx.legacyFbxImporter.title',
                }),
                material: objectSchema({
                    smart: {
                        type: 'boolean',
                        default: false,
                        title: 'i18n:configuration.import.fbx.material.smart.title',
                    },
                }, {
                    title: 'i18n:configuration.import.fbx.material.title',
                }),
            }, {
                title: 'i18n:configuration.import.fbx.title',
            }),
        }, 10),
    ];
}
