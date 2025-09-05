/**
 * 整合项目的一些配置信息以及创建功能等
 */
import { join } from "path";
import { readJSON } from "fs-extra";

export interface ProjectInfo {
    name: string;
    path: string;
    version: string;
    uuid: string;
    tmpDir: string;
}

export interface ProjectConfig {
    features: string[];
}

async function readProjectInfo(root: string) {
    const packageJSONPath = join(root, 'package.json');
    const packageJSON = await readJSON(packageJSONPath);
    return {
        name: packageJSON.name,
        path: root,
        version: packageJSON.version,
        uuid: packageJSON.uuid,
        tmpDir: join(root, 'temp'),
    };
}


async function readProjectConfig(root: string): Promise<ProjectConfig> {
    // TODO read project config from cocos project

    return {
        features: [],
    }
}

export class Project {
    config: ProjectConfig;
    info: ProjectInfo;

    readonly lastVersion?: string;

    private constructor(info: ProjectInfo, config: ProjectConfig) {
        this.info = info;
        this.config = config;
        this.lastVersion = info.version;
    }

    static async create(projectRoot: string) {
        const info = await readProjectInfo(projectRoot);
        const config = await readProjectConfig(projectRoot);
        return new Project(info, config);
    }
}
