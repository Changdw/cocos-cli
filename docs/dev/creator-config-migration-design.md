# Creator 配置迁移到 cocos.config.json 的设计说明

更新时间：2026-07-03

本文用于说明 Cocos Creator 3.x 项目配置在 cocos-cli / PinK 中的迁移设计。它既面向开发者阅读，也作为 AI 大模型处理相关代码时的上下文约束。

## 结论

- `cocos.config.json` 是 cocos-cli / PinK 当前项目配置系统的真相源。
- Cocos Creator 3.x 的 `settings/v2/packages/*.json`、`profiles/v2/packages/*.json` 等插件配置文件，只作为旧项目迁移来源。
- Creator 3.x 项目被 PinK 打开，或独立 cocos-cli MCP server 启动后，会触发配置迁移。
- 迁移通常只执行一次。迁移完成后项目配置文件会带有 `version`，后续不会自动反复从旧 Creator 配置覆盖新配置。
- 迁移后的项目不再保证能被 Creator 3.x 正确查看和编辑这些新配置。Creator 3.x 仍可能打开项目，但它看到的是旧配置文件中的旧值，这属于设计预期。
- 不应为了兼容 Creator 3.x，把同一份配置同时写入 `cocos.config.json` 和 `settings/v2/packages/*.json`。

一句话概括：新的编辑器和 CLI 可以通过迁移兼容旧项目；旧 Creator 3.x 不需要，也不能反向兼容迁移后的新配置。

## 背景

Creator 3.x 的项目设置来自编辑器插件系统。很多配置按插件名存放在：

- `settings/v2/packages/project.json`
- `settings/v2/packages/engine.json`
- `settings/v2/packages/builder.json`
- `profiles/v2/packages/*.json`
- 用户目录下的 `.CocosCreator/profiles/v2/packages/*.json`

这些 `packages/xxx.json` 中的 `xxx` 本质上是 Creator 插件名，读写和展示依赖 Creator 底层 profile / plugin 机制。

cocos-cli / PinK 没有 Creator 3.x 的插件 profile 系统，也不应该继续依赖它维护项目配置。因此新配置系统统一落到项目根目录的 `cocos.config.json`。

## 设计目标

1. 支持打开 Creator 3.x 老项目，并把已支持的旧配置迁移到新配置系统。
2. 新配置系统只有一个项目级修改入口：`cocos.config.json`。
3. PinK 项目设置界面通过配置系统 metadata 渲染，并通过配置系统 key 读写 `cocos.config.json`。
4. 避免同一配置存在两份可编辑副本，导致 Creator、PinK、MCP 或 CLI 互相覆盖。
5. 迁移后保护用户在新配置系统中的修改，不因下一次启动再次读取旧 Creator 配置而被覆盖。

## 迁移生命周期

```mermaid
flowchart LR
    A["Creator 3.x 项目"] --> B["PinK 打开项目或 cocos-cli MCP 启动"]
    B --> C["读取旧 Creator 插件配置"]
    C --> D["生成或更新 cocos.config.json"]
    D --> E["写入配置版本 version"]
    E --> F["后续由 cocos.config.json 作为真相源"]
    F --> G["同版本再次启动不自动迁移"]
```

触发点：

- PinK 打开项目时初始化 cocos-cli 配置系统。
- 独立 cocos-cli MCP server 启动时初始化配置系统。
- 用户明确调用重新迁移接口时，可以从旧 `settings` 目录再次生成 `cocos.config.json`。这是手动确认后的操作，不是常规同步机制。

版本规则：

- 如果现有 `cocos.config.json` 的版本低于当前 `ConfigurationManager.VERSION`，允许执行迁移或升级。
- 如果版本已经是当前版本或更高版本，不再自动从 Creator 旧配置迁移。
- 这样可以避免旧 `settings/v2/packages/*.json` 中的旧值覆盖用户已经在 PinK / CLI 中修改过的新值。

## 不是同步机制

迁移和同步不是一回事。

迁移：

- 面向旧项目进入新配置系统。
- 通常只执行一次。
- 方向是 Creator 旧配置到 `cocos.config.json`。
- 迁移后以 `cocos.config.json` 为准。

同步：

- 意味着两边都能修改，并且要保持一致。
- 对 Creator 3.x 和 PinK 来说，这会产生两个修改入口。
- 两边同时编辑时无法可靠判断哪个值是用户真正想保留的值。
- 同步只曾作为 PinK 不支持项目设置编辑时的临时方案，不是长期设计。

因此，发现 PinK 修改了 `cocos.config.json`，但 Creator 3.x 的项目设置界面仍显示旧值时，不应默认认为是 cocos-cli / PinK 的 bug。Creator 3.x 不读取新的配置系统，这是设计边界。

## 兼容性边界

| 场景 | 是否支持 | 说明 |
| --- | --- | --- |
| Creator 3.x 老项目用 PinK 打开 | 支持 | 通过迁移把旧配置导入 `cocos.config.json` |
| PinK / cocos-cli 读取和修改项目配置 | 支持 | 以 `cocos.config.json` 为准 |
| 迁移后继续用 Creator 3.x 查看新配置值 | 不支持 | Creator 3.x 不读取 `cocos.config.json` 中的新配置 |
| 迁移后继续用 Creator 3.x 编辑并自动同步回 PinK | 不支持 | 会形成两个修改入口 |
| 用户手动重新迁移旧 settings 配置 | 有条件支持 | 需要用户明确确认，避免覆盖新配置 |
| 发新版 Creator 读取 `cocos.config.json` | 另行设计 | 这不是 Creator 3.x 兼容问题 |

## 常见配置迁移示例

迁移范围以 `src/core/configuration/migration/register-migration.ts` 为准。典型映射包括：

| Creator 3.x 来源 | cocos.config.json 目标 |
| --- | --- |
| `settings/v2/packages/project.json` 的 `general.designResolution` | `engine.designResolution` |
| `settings/v2/packages/project.json` 的 `general.downloadMaxConcurrency` | `engine.downloadMaxConcurrency` |
| `settings/v2/packages/project.json` 的 `physics` | `engine.physicsConfig` |
| `settings/v2/packages/project.json` 的 `script` | `script` |
| `settings/v2/packages/project.json` 的 `import.fbx` | `import.fbx` |
| `settings/v2/packages/engine.json` 的 `macroConfig` | `engine.macroConfig` |
| `settings/v2/packages/engine.json` 的 `modules.configs` | `engine.configs` |
| `settings/v2/packages/builder.json` 的构建配置 | `builder` 下对应配置 |

示例：如果用户在 PinK 中把设计分辨率改为 `1280 x 720`，该值应写入：

```json
{
    "engine": {
        "designResolution": {
            "width": 1280,
            "height": 720
        }
    }
}
```

不应再要求同步写回：

```text
settings/v2/packages/project.json
```

如果 Creator 3.x 仍显示 `960 x 640`，说明它读取的是旧 `project.json`，不是新配置系统。

## 对 PinK 界面的要求

PinK 项目设置界面应遵循以下链路：

1. 通过 `getMetadata()` 获取当前已注册模块提供的配置元数据。
2. metadata 中的每个 property key 必须能通过配置系统直接读写。
3. 配置值读取和修改应走配置系统接口。
4. 最终项目级配置应落到 `cocos.config.json`。

metadata 不是另一份配置真相源。metadata 只是展示和编辑协议，真实值仍来自配置系统。

## 对 AI 和开发者的编码准则

处理项目配置相关问题时，必须优先遵守以下规则：

1. 不要把 `settings/v2/packages/project.json` 当作 cocos-cli / PinK 的当前配置真相源。
2. 不要新增自动双写逻辑，把 PinK 修改同时写回 Creator 3.x 的 `settings/v2/packages/*.json`。
3. 不要用“Creator 3.x 看不到 PinK 修改后的值”作为判断 PinK 写配置失败的直接依据。
4. 如果要修复 PinK 项目设置无效问题，应检查：
   - metadata key 是否和配置系统 key 一致；
   - 配置 UI 是否通过配置系统读写；
   - `cocos.config.json` 是否被正确保存；
   - 运行时消费点是否读取 `cocos.config.json` 中的新 key；
   - 迁移映射是否覆盖了旧配置来源。
5. 如果确实需要再次从 Creator 旧配置导入，必须走显式的重新迁移入口，并提示这可能覆盖新配置。
6. 新增配置时，应在对应业务模块注册默认值和 metadata，不要维护中心化静态快照。
7. 新增配置消费点时，应直接消费配置系统中的 key，而不是回读 Creator 3.x 插件配置文件。

## 排查指引

### 设计分辨率

正确方向：

- PinK 设置 `engine.designResolution`。
- `cocos.config.json` 中出现 `engine.designResolution.width / height`。
- cocos-cli / PinK 的场景创建、预览、构建等运行时逻辑消费这个新值。

错误方向：

- 因为 Creator 3.x 仍显示旧值，就把 `engine.designResolution` 反写回 `settings/v2/packages/project.json`。

### 脚本配置

正确方向：

- 旧 `project.script` 迁移为新 `script`。
- 后续读写 `script.*` 走配置系统。

错误方向：

- 同时维护 `cocos.config.json.script` 和 `settings/v2/packages/project.json.script` 两份可编辑数据。

### Engine feature list

正确方向：

- 当前 cocos-cli / PinK 侧优先使用 `cocos.config.json` 中的 engine 配置。
- 如果保留 Creator 旧配置读取，也只能作为旧项目迁移或兼容兜底。

错误方向：

- 把 feature list 设计成 Creator 旧配置和 `cocos.config.json` 长期并行的两个真相源。

## 相关代码位置

- `src/core/configuration/script/manager.ts`
  - `ConfigurationManager.name = 'cocos.config.json'`
  - 初始化时加载、迁移并保存项目配置。
  - 根据配置版本决定是否迁移。
- `src/core/configuration/migration/cocos-config-loader.ts`
  - 读取 Creator 旧配置路径：`settings/v2/packages/*.json`、`profiles/v2/packages/*.json`。
- `src/core/configuration/migration/register-migration.ts`
  - 定义 Creator 旧配置到新 `cocos.config.json` 结构的映射。
- `src/api/configuration/configuration.ts`
  - 暴露 `configuration-remigrate`，用于显式重新迁移。
- `src/lib/configuration/configuration.ts`
  - 对外暴露配置系统读写、保存事件、`getMetadata()`、`getConfigPath()` 等能力。
- `docs/dev/config-metadata-plan.md`
  - 说明 metadata 与 `cocos.config.json` 配置域保持一致。
- `src/core/configuration/README.md`
  - 说明配置系统支持持久化到 `cocos.config.json`。
- `src/core/configuration/migration/README.md`
  - 说明迁移系统从旧 CocosCreator 配置迁移到新版本，且迁移是单向的。

## 非目标

- 不保证 Creator 3.x 项目设置界面能显示 PinK / cocos-cli 修改后的新配置。
- 不实现 Creator 3.x 旧插件配置和 `cocos.config.json` 的长期双向同步。
- 不把 `settings/v2/packages/*.json` 作为 PinK 项目设置 UI 的写入目标。
- 不通过反写旧配置来修复 PinK 配置消费链路中的 bug。

## 设计确认记录

2026-07-03 沟通确认：

- 迁移通常只能做一次。
- 同步只是临时方案，不是长期设计。
- 在 PinK 支持配置系统修改后，只需要迁移，不应该出现两个修改入口。
- 当前 CLI 所有配置系统都以 `cocos.config.json` 为准。
- `settings/v2/packages/project.json` 是 Creator 3.x 插件配置，应作为旧配置来源理解。
- 新系统兼容老项目靠迁移；老 Creator 3.x 不兼容新配置是正常边界。
- PinK 打开或独立 cli MCP 启动会触发迁移。
- 迁移过一次后有版本，下一次不会自动重新迁移，避免新修改被旧配置错误覆盖。
