# cocos-cli Animation Graph 数据结构

> 本文档梳理 cocos-cli 中与 **Animation Graph（动画图）** 相关的全部数据结构，使用 Mermaid UML 图描述类型关系，并在各节配以字段速查表。
>
> - 类型层（TypeScript `.d.ts`）：`src/core/assets/@types/public.d.ts`
> - 服务层：`src/core/assets/animation-graph-service.ts`、`src/core/assets/animation-graph-variant.ts`
> - 处理器层：`src/core/assets/asset-handler/assets/animation-graph.ts`、`animation-graph-variant.ts`
> - API Schema：`src/api/assets/schema.ts`

---

## 1. 概览

### 1.1 相关代码文件

| 文件 | 角色 |
|------|------|
| `src/core/assets/@types/public.d.ts` | 公共类型定义（版本、寻址、视图快照、命令、Inspector） |
| `src/core/assets/animation-graph-service.ts` | 动画图编辑服务（文档缓存、查询、命令执行、Inspector） |
| `src/core/assets/animation-graph-variant.ts` | 动画图变体服务（解读 / 修改 / 保存变体资产） |
| `src/core/assets/asset-handler/assets/animation-graph.ts` | `.animgraph` 资源处理器（importer `animation-graph`） |
| `src/core/assets/asset-handler/assets/animation-graph-variant.ts` | `.animgraphvari` 资源处理器（importer `animation-graph-variant`） |
| `src/api/assets/schema.ts` | Zod 校验 Schema（变体 dump 的 API 参数/结果契约） |

### 1.2 组件总览图

```mermaid
flowchart TB
    subgraph PUBLIC["公共类型层 public.d.ts"]
        P1["版本与文档管理<br/>ExpectedVersion / Version / Snapshot / Event"]
        P2["寻址体系<br/>Context / Address / Target"]
        P3["视图快照<br/>ViewDump / Layer / StateMachine / State / Transition / Motion"]
        P4["Pose 图视图<br/>PoseView / PoseNode / PoseInput"]
        P5["Inspector<br/>InspectorSnapshot / Command"]
    end

    subgraph VAR["变体结构 (animation-graph-variant.ts)"]
        V1["AnimGraphVariantDump"]
        V2["PendingAnimationGraphVariantEdit"]
    end

    subgraph INTERNAL["服务内部结构 (animation-graph-service.ts)"]
        I1["AnimationGraphDocument"]
        I2["SourceFingerprint / InspectorBinding / AdapterProperty"]
    end

    subgraph SCHEMA["API Schema (src/api/assets/schema.ts)"]
        S1["SchemaAnimationGraphVariantDump"]
    end

    subgraph HANDLER["资源处理器"]
        H1["AnimationGraphHandler (.animgraph)"]
        H2["AnimationGraphVariantHandler (.animgraphvari)"]
    end

    SERVICE["AnimationGraphAssetService<br/>动画图编辑服务"] --> PUBLIC
    SERVICE --> INTERNAL
    H1 --> SERVICE
    H2 --> VARSERVICE["AnimationGraphVariantAssetService"]
    VARSERVICE --> VAR
    VAR --> SCHEMA
```

---

## 2. 公共类型层（public.d.ts）

### 2.1 版本与文档管理

`AnimationGraphExpectedVersion` 是乐观并发控制的最小单元；`AnimationGraphVersion` 追加持久化 / 脏标记状态；`AnimationGraphSnapshot` 是 `query` / `execute` / `save` / `reload` 返回的统一快照。`AnimationGraphChangedEvent` 用于向监听者广播变更。

```mermaid
classDiagram
    direction LR

    class AVExpected["AnimationGraphExpectedVersion"] {
        +string documentId
        +number revision
    }

    class AVVersion["AnimationGraphVersion"] {
        +number persistedRevision
        +boolean dirty
        +boolean externallyModified
    }

    class AVSnapshot["AnimationGraphSnapshot"] {
        +string uuid
        +string url
        +AnimationGraphViewDump graph
    }

    class AVEvent["AnimationGraphChangedEvent"] {
        +string uuid
        +string reason
        +AnimationGraphVersion version
        +string sourceId
        +string[] changedPaths
    }

    class AVReloadOpts["ReloadAnimationGraphOptions"] {
        +AnimationGraphExpectedVersion expected
        +boolean discardDirty
    }

    class AVErrorCode["AnimationGraphEditErrorCode (枚举)"] {
        +VERSION_CONFLICT
        +DOCUMENT_RELOADED
        +SOURCE_CHANGED
        +TARGET_NOT_FOUND
        +UNSUPPORTED_TARGET
        +UNSUPPORTED_PROPERTY_OPERATION
        +INVALID_PROPERTY_PATCH
        +READONLY_PROPERTY
        +NAME_CONFLICT
        +DIRTY_DOCUMENT
    }

    class AVViewDump["AnimationGraphViewDump"] {
        +AnimationGraphLayerView[] layers
        +AnimationGraphVariableView[] variables
    }

    AVExpected <|-- AVVersion : 继承
    AVVersion <|-- AVSnapshot : 继承
    AVEvent --> AVVersion : 携带
    AVSnapshot --> AVVersion : 携带
    AVSnapshot "1" *-- "1" AVViewDump : 包含
```

**字段速查**

| 类型 | 字段 | 类型 | 说明 |
|------|------|------|------|
| `AnimationGraphExpectedVersion` | `documentId` | `string` | 文档唯一 ID（每次加载重新生成） |
| | `revision` | `number` | 已提交修改的版本号 |
| `AnimationGraphVersion` | `persistedRevision` | `number` | 已持久化版本号 |
| | `dirty` | `boolean` | 是否有未保存修改 |
| | `externallyModified` | `boolean` | 源文件是否被外部改动 |
| `AnimationGraphSnapshot` | `uuid` / `url` | `string` | 资产标识 |
| | `graph` | `AnimationGraphViewDump` | 完整视图快照 |
| `AnimationGraphChangedEvent` | `reason` | `'inspector' \| 'structure' \| 'save' \| 'reload' \| 'external'` | 变更原因 |
| | `sourceId?` / `changedPaths?` | `string` / `string[]` | 变更来源与路径 |

---

### 2.2 寻址体系：Context / Address / Target

动画图由 **Layer（层）→ StateMachine（状态机）→ State（状态）/ Transition（过渡）→ Motion（动作）**，以及独立的 **Pose Graph（姿态图）→ PoseNode + 内嵌状态机** 组成。为了让 Inspector / 命令能够唯一定位任意节点，cocos-cli 定义了一套**上下文 → 地址 → 目标**的三角寻址体系。

> 说明：图中的继承箭头表示「类型组合/扩展」关系（TypeScript 交叉类型语义），`note` 块给出判别联合（discriminated union）的 `kind` 成员。

```mermaid
classDiagram
    direction TB

    class CMSctx["AnimationGraphStateMachineContext"] {
        <<判别联合>>
        +layer-state-machine kind
        +pose-node-state-machine kind
        +sub-state-machine kind
    }

    class CPGctx["AnimationGraphPoseGraphContext"] {
        <<判别联合>>
        +state-pose-graph kind
        +layer-stash kind
    }

    note for CMSctx "1) kind=layer-state-machine: { layerIndex, stateMachinePath[] }<br/>2) kind=pose-node-state-machine: { poseGraph, nodeId }<br/>3) kind=sub-state-machine: { stateMachine, stateIndex }"
    note for CPGctx "1) kind=state-pose-graph: { stateMachine, stateIndex }<br/>2) kind=layer-stash: { layerIndex, stashName }"

    class ASMAddr["AnimationGraphStateMachineAddress"] {
        <<判别联合>>
        +直接形式 (layerIndex + stateMachinePath)
        +上下文形式 (stateMachine 引用)
    }

    class AStateAddr["AnimationGraphStateAddress"] {
        +number stateIndex
    }

    class APGAddr["AnimationGraphPoseGraphAddress"] {
        <<判别联合>>
        +直接形式 (layerIndex + stateMachinePath + stateIndex)
        +上下文形式 (poseGraph 引用)
    }

    class APNAddr["AnimationGraphPoseNodeAddress"] {
        +number nodeId
    }

    class AMotionAddr["AnimationGraphMotionAddress"] {
        +number[] level 层级路径
    }

    class ATarget["AnimationGraphTarget"] {
        <<判别联合>>
        +layer 目标
        +state 目标
        +transition 目标
        +motion 目标
        +pose-node 目标
        +pose-input 目标
        +state-component 目标
    }

    CMSctx ..> ASMAddr : 引用解析
    CPGctx ..> APGAddr : 引用解析
    ASMAddr <|-- AStateAddr : 扩展
    APGAddr <|-- APNAddr : 扩展
    AStateAddr <|-- AMotionAddr : 扩展
    APNAddr <|-- AMotionAddr : 扩展
    AStateAddr <|-- ATarget : 组成
    ASMAddr <|-- ATarget : 组成
    APNAddr <|-- ATarget : 组成
    AMotionAddr <|-- ATarget : 组成
```

**字段速查（关键联合成员）**

| 类型 | 成员 | 结构 |
|------|------|------|
| `AnimationGraphStateMachineContext` | `layer-state-machine` | `{ kind, layerIndex, stateMachinePath: number[] }` |
| | `pose-node-state-machine` | `{ kind, poseGraph, nodeId }` |
| | `sub-state-machine` | `{ kind, stateMachine, stateIndex }` |
| `AnimationGraphPoseGraphContext` | `state-pose-graph` | `{ kind, stateMachine, stateIndex }` |
| | `layer-stash` | `{ kind, layerIndex, stashName }` |
| `AnimationGraphTarget` | `layer` | `{ kind, layerIndex }` |
| | `state` | `{ kind } & StateAddress` |
| | `transition` | `{ kind, transitionIndex } & StateMachineAddress` |
| | `motion` | `{ kind } & MotionAddress` |
| | `pose-node` | `{ kind } & PoseNodeAddress` |
| | `pose-input` | `{ kind, inputId } & PoseNodeAddress` |
| | `state-component` | `{ kind, componentIndex } & StateAddress` |

---

### 2.3 视图快照体系

服务端将引擎运行时对象投影为**只读视图（View）**，供 Webview / Inspector 消费。树形关系如下：

- `AnimationGraphViewDump`（整图）→ 多个 `LayerView`
- `LayerView` → `StateMachineView`；`StateMachineView` → 多个 `StateView` 与 `TransitionView`
- `StateView` 可递归内嵌 `StateMachineView`（子状态机）、携带 `MotionView`（动作状态）、或挂 `PoseView`（过程姿态状态）
- `MotionView` 递归包含子 `MotionView`（1D/2D 混合）

```mermaid
classDiagram
    direction TB

    class AViewDump["AnimationGraphViewDump"] {
        +AnimationGraphLayerView[] layers
        +AnimationGraphVariableView[] variables
    }

    class ALayer["AnimationGraphLayerView"] {
        +number index
        +string name
        +number weight
        +boolean additive
        +string maskUuid
        +string[] stashes
        +stashPoseGraphs
        +AnimationGraphStateMachineView stateMachine
    }

    class ASM["AnimationGraphStateMachineView"] {
        +context
        +number[] path
        +boolean allowEmptyStates
        +AnimationGraphStateView[] states
        +AnimationGraphTransitionView[] transitions
        +editorData
    }

    class AState["AnimationGraphStateView"] {
        +number index
        +type type
        +string name
        +number[] incomingTransitionIndices
        +number[] outgoingTransitionIndices
        +components
        +speed
        +speedMultiplier
        +speedMultiplierEnabled
        +motion
        +stateMachine
        +poseGraph
        +editorData
    }

    class ATrans["AnimationGraphTransitionView"] {
        +number index
        +type type
        +number fromStateIndex
        +number toStateIndex
        +number priority
        +conditions
        +duration
        +relativeDuration
        +exitConditionEnabled
        +exitCondition
        +destinationStart
        +relativeDestinationStart
        +startEvent
        +endEvent
    }

    class ACond["AnimationGraphTransitionConditionView"] {
        <<判别联合>>
        +BinaryCondition
        +UnaryCondition
        +TriggerCondition
        +Unknown
    }

    class AComp["AnimationGraphComponentView"] {
        +number index
        +string type
    }

    class AMotion["AnimationGraphMotionView"] {
        +number[] level
        +target
        +type (clip/blend-1d/blend-2d/blend-direct/unknown)
        +string name
        +clipUuid
        +variable / value
        +variableX / valueX
        +variableY / valueY
        +threshold
        +weight
        +children
    }

    class AVar["AnimationGraphVariableView"] {
        +string name
        +number type
        +IProperty value
        +resetMode
    }

    class APose["AnimationGraphPoseView"]

    AViewDump "1" *-- "many" ALayer
    AViewDump "1" *-- "many" AVar
    ALayer "1" *-- "many" ASM : stateMachine
    ASM "1" *-- "many" AState : states
    ASM "1" *-- "many" ATrans : transitions
    AState "1" o-- "0..1" AMotion : motion
    AState "1" o-- "0..1" ASM : 子状态机
    AState "1" o-- "0..1" APose : poseGraph
    AState "1" o-- "many" AComp : components
    ATrans "1" *-- "many" ACond : conditions
    AMotion "1" *-- "many" AMotion : children 递归
```

**字段速查**

| 类型 | 关键字段 |
|------|---------|
| `AnimationGraphViewDump` | `layers[]`、`variables[]` |
| `AnimationGraphLayerView` | `index`、`name`、`weight`、`additive`、`maskUuid: string\|null`、`stashes: string[]`、`stashPoseGraphs[]`、`stateMachine` |
| `AnimationGraphStateMachineView` | `context`、`path: number[]`、`allowEmptyStates`、`states[]`、`transitions[]`、`editorData?` |
| `AnimationGraphStateView` | `index`、`type`（`entry/exit/any/motion/empty/sub-state-machine/procedural-pose/unknown`）、`name`、`incoming/outgoingTransitionIndices[]`、`components[]`、`speed?`、`speedMultiplier?`、`speedMultiplierEnabled?`、`motion?`、`stateMachine?`、`poseGraph?`、`editorData?` |
| `AnimationGraphTransitionView` | `index`、`type`（`animation/empty-state/procedural-pose/transition`）、`fromStateIndex`、`toStateIndex`、`priority`、`conditions[]`、`duration?`、`relativeDuration?`、`exitConditionEnabled?`、`exitCondition?`、`destinationStart?`、`relativeDestinationStart?`、`startEvent?`、`endEvent?` |
| `AnimationGraphTransitionConditionView` | 判别联合：Binary / Unary / Trigger / Unknown，见下 |
| `AnimationGraphComponentView` | `index`、`type` |
| `AnimationGraphMotionView` | `level[]`、`target`、`type`、`name`、`clipUuid?`、`variable?/value?`、`variableX?/valueX?`、`variableY?/valueY?`、`threshold?`、`weight?`、`children?`、`editorData?` |
| `AnimationGraphVariableView` | `name`、`type: number`、`value: IProperty`、`resetMode?: number`（Trigger 类型才有） |

**过渡条件（TransitionConditionView）判别联合成员**

| `type` | 字段 |
|--------|------|
| `BinaryCondition` | `index`、`operator`、`lhs`、`lhsBinding`、`bindingClass`、`rhs`、`isRhsInteger` |
| `UnaryCondition` | `index`、`operator`、`operand` |
| `TriggerCondition` | `index`、`trigger` |
| `Unknown` | `index`、`className` |

---

### 2.4 Pose 图视图体系

Pose 图是一张**节点连通图**：根输出节点引出，节点间通过输入/输出端口相连；节点可内嵌状态机或动作（Motion），也可以作为 Stash 入口。

```mermaid
classDiagram
    direction TB

    class APoseView["AnimationGraphPoseView"] {
        +context
        +number rootOutputNodeId
        +AnimationGraphPoseNodeView[] nodes
        +addNodeInfos
        +assetDragHandlersMap
    }

    class APoseNode["AnimationGraphPoseNodeView"] {
        +number id
        +string type
        +string title
        +number[] outputTypes
        +AnimationGraphPoseInputView[] inputs
        +inputInsertInfos
        +stateMachine
        +motion
        +enterInfo
        +editorData
    }

    class APoseInput["AnimationGraphPoseInputView"] {
        +string id
        +string displayName
        +number type
        +boolean deletable
        +boolean insertPoint
        +boolean connected
        +producerNodeId
        +producerOutputId
        +value
    }

    class AEnterInfo["AnimationGraphPoseNodeEnterInfo"] {
        +type (state-machine/animation-blend/stash)
        +stashName
    }

    class AAddNode["AnimationGraphPoseGraphAddNodeInfo"] {
        +string typeId
        +args
        +string menu
    }

    class ADragView["AnimationGraphPoseGraphAssetDragHandlersView"] {
        +handlers
    }

    class ADragHandler["AnimationGraphPoseGraphAssetDragHandlerView"] {
        +string displayName
    }

    class ADragEntry["AnimationGraphPoseGraphAssetDragHandlersEntry"] {
        +string assetType
        +handlers
    }

    class ADragInfo["AnimationGraphPoseGraphAssetDragHandlerInfo"] {
        +string id
        +string displayName
    }

    class ASM["AnimationGraphStateMachineView"]
    class AMotion["AnimationGraphMotionView"]

    APoseView "1" *-- "many" APoseNode : nodes
    APoseView "1" *-- "many" AAddNode : addNodeInfos
    APoseView "1" *-- "many" ADragView : assetDragHandlersMap
    APoseNode "1" *-- "many" APoseInput : inputs
    APoseNode "1" o-- "0..1" AEnterInfo : enterInfo
    APoseNode "1" o-- "0..1" ASM : 内嵌状态机
    APoseNode "1" o-- "0..1" AMotion : 内嵌动作
    ADragView "1" *-- "many" ADragHandler : handlers
    ADragEntry "1" *-- "many" ADragInfo : handlers
```

**字段速查**

| 类型 | 关键字段 |
|------|---------|
| `AnimationGraphPoseView` | `context`、`rootOutputNodeId: number`、`nodes[]`、`addNodeInfos[]`、`assetDragHandlersMap` |
| `AnimationGraphPoseNodeView` | `id`、`type`、`title`、`outputTypes: number[]`、`inputs[]`、`inputInsertInfos`、`stateMachine?`、`motion?`、`enterInfo?`、`editorData?` |
| `AnimationGraphPoseInputView` | `id`、`displayName`、`type`、`deletable`、`insertPoint`、`connected`、`producerNodeId?`、`producerOutputId?`、`value?: IProperty` |
| `AnimationGraphPoseNodeEnterInfo` | `type: 'state-machine' \| 'animation-blend' \| 'stash'`、`stashName?` |
| `AnimationGraphPoseGraphAddNodeInfo` | `typeId`、`args: unknown`、`menu`（面包屑式路径） |
| `AnimationGraphPoseGraphAssetDragHandlersView/Entry` | `handlers`（按 handlerId 索引） / `assetType + handlers[]` |

---

### 2.5 Inspector 快照与命令

Inspector 通过「目标 + 属性路径」读写属性；每次操作都携带 `expected` 版本做乐观并发控制。

```mermaid
classDiagram
    direction TB

    class AInspSnap["AnimationGraphInspectorSnapshot"] {
        +string uuid
        +AnimationGraphTarget target
        +IProperty dump
        +propertyCapabilities
    }

    class AInspCap["AnimationGraphInspectorPropertyCapabilities"] {
        +boolean set
        +boolean reset
        +boolean create
    }

    class AInspReq["AnimationGraphInspectorPropertyOperationRequest"] {
        +AnimationGraphTarget target
        +string path
        +AnimationGraphExpectedVersion expected
        +string sourceId
    }

    class ASetReq["SetAnimationGraphInspectorPropertyRequest"] {
        +patch (IProperty or unknown)
    }

    class AExecReq["ExecuteAnimationGraphCommandRequest"] {
        +AnimationGraphCommand command
        +AnimationGraphExpectedVersion expected
        +string sourceId
    }

    note for AInspSnap "dump 为序列化后的属性描述树（IProperty）；propertyCapabilities 描述 property 支持 set/reset/create 的能力"
    note for ASetReq "Inspector 属性设置请求 = 基础请求 + patch"

    class ATarget["AnimationGraphTarget"] {
        <<判别联合>>
        +kind
    }

    class ACmd["AnimationGraphCommand"] {
        +string type
    }

    AInspSnap "1" *-- "1" AInspCap : propertyCapabilities
    AInspSnap "1" --> "1" ATarget : target
    AInspReq <|-- ASetReq : 继承扩展
    AExecReq "1" --> "1" ACmd : 携带命令
```

**字段速查**

| 类型 | 说明 |
|------|------|
| `AnimationGraphInspectorSnapshot` | `uuid`、`target`、`dump: IProperty`、`propertyCapabilities?` |
| `AnimationGraphInspectorPropertyCapabilities` | `set` / `reset` / `create: boolean` |
| `AnimationGraphInspectorPropertyOperationRequest` | `target`、`path`、`expected`、`sourceId?` |
| `SetAnimationGraphInspectorPropertyRequest` | 基础请求 + `patch: IProperty \| unknown` |
| `ExecuteAnimationGraphCommandRequest` | `command`、`expected`、`sourceId?` |

---

### 2.6 命令体系：AnimationGraphCommand

`AnimationGraphCommand` 是**按 `type` 判别的大型联合类型**，覆盖 Layer / State / Transition / Motion / StateComponent / Pose / Variable / Stash 的增删改。所有命令通过 `execute()` 在服务端执行，并推进文档 `revision`。

```mermaid
classDiagram
    direction LR

    class Cmd["AnimationGraphCommand"] {
        +string type 判别字段
    }

    class LayerCmds["Layer / Stash 层领域"] {
        +add-layer
        +remove-layer
        +move-layer
        +add-stash
        +remove-stash
        +rename-stash
        +stash-pose-graph
    }

    class StateCmds["State 状态领域"] {
        +add-state
        +remove-state
        +duplicate-state
        +set-state-editor-data
        +add-state-component
        +remove-state-component
    }

    class TransCmds["Transition 过渡领域"] {
        +add-transition
        +remove-transition
        +move-transition
        +add-transition-condition
        +remove-transition-condition
        +set-transition-condition-property
        +set-transition-condition-binding-class
        +set-transition-event-binding
    }

    class MotionCmds["Motion 动作领域"] {
        +set-motion
        +add-motion-child
        +remove-motion
        +set-motion-editor-data
        +set-motion-threshold
        +set-direct-blend-weight
    }

    class PoseCmds["Pose 图领域"] {
        +add-pose-node
        +create-pose-node-on-asset-drag
        +remove-pose-node
        +duplicate-pose-nodes
        +set-pose-node-editor-data
        +connect-pose-nodes
        +disconnect-pose-input
        +insert-pose-input
        +delete-pose-input
    }

    class VarCmds["Variable 变量领域"] {
        +add-variable
        +set-variable-value
        +set-trigger-reset-mode
        +remove-variable
        +rename-variable
    }

    Cmd "1" *-- "many" LayerCmds : 成员
    Cmd "1" *-- "many" StateCmds : 成员
    Cmd "1" *-- "many" TransCmds : 成员
    Cmd "1" *-- "many" MotionCmds : 成员
    Cmd "1" *-- "many" PoseCmds : 成员
    Cmd "1" *-- "many" VarCmds : 成员
```

> 大多数命令在 `type` 之外还内联携带**状态机地址（StateMachineAddress）** 或 **目标（Target）**，例如 `add-state`、`add-transition`、`connect-pose-nodes` 等；地址解析逻辑复用第 2.2 节的寻址体系。

**相关类型别名**

| 别名 | 取值 |
|------|------|
| `AnimationGraphStateType` | `'motion' \| 'empty' \| 'sub-state-machine' \| 'procedural-pose'` |
| `AnimationGraphMotionType` | `'clip' \| 'blend-1d' \| 'blend-2d' \| 'blend-direct'` |
| `AnimationGraphTransitionConditionType` | `'binary' \| 'unary' \| 'trigger'` |

---

### 2.7 AnimationMask（动画掩码）

Layer 的 `maskUuid` 指向一张动画掩码资产，其 dump 结构如下：

```mermaid
classDiagram
    class MaskDump["AnimationMaskDump"] {
        +number version
        +string assetUuid
        +AnimationMaskJoint[] joints
    }

    class MaskJoint["AnimationMaskJoint"] {
        +string path
        +boolean enabled
        +AnimationMaskJoint[] children
    }

    class MaskChange["AnimationMaskChange"] {
        +string path
        +boolean enabled
        +boolean recursive
    }

    MaskDump "1" *-- "many" MaskJoint : joints
    MaskJoint "1" *-- "many" MaskJoint : children 递归
```

---

## 3. 服务内部数据结构（animation-graph-service.ts）

服务以「文档」为核心缓存：对每个动画图资产维护一个 `AnimationGraphDocument`，内部处理版本并发、外部写入检测（指纹对比）、节点 ID 分配与变更事件广播。

```mermaid
classDiagram
    direction TB

    class SVC["AnimationGraphAssetService"] {
        +query()
        +queryInspector()
        +queryPoseGraphAssetDragHandlers()
        +queryStateMachineComponentTypes()
        +setInspectorProperty()
        +resetInspectorProperty()
        +createInspectorProperty()
        +execute()
        +save()
        +reload()
        +onChanged()
        +runExternalWrite(s)
        +assertExternalWriteAllowed()
    }

    class Doc["AnimationGraphDocument"] {
        +string uuid
        +string url
        +string source
        +graph 引擎图对象
        +string documentId
        +number revision
        +number persistedRevision
        +boolean dirty
        +boolean externallyModified
        +SourceFingerprint fingerprint
        +nodeIds (WeakMap)
        +nodesById (Map)
        +number nextNodeId
    }

    class FP["SourceFingerprint"] {
        +string hash (sha256)
        +number mtimeMs
        +number assetDbMtime
    }

    class Binding["InspectorBinding"] {
        +IProperty dump
        +propertyCapabilities
        +apply(path, patch)
        +reset(path)
        +create(path)
    }

    class Adapter["AdapterProperty"] {
        +get()
        +set(value)
        +attrs
    }

    class Err["AnimationGraphEditError"] {
        +code (AnimationGraphEditErrorCode)
        +message
        +currentVersion
    }

    note for Doc "nodeIds/nodesById：为 Pose 图节点分配稳定数字 ID 的双向索引；nextNodeId 为递增计数器"
    note for Binding "通过 createAdapterBinding / createDecoratedBinding / createAdapterBinding 构造"

    SVC "1" o-- "many" Doc : _documents 缓存
    SVC "1" o-- "many" Binding : 按需创建
    Doc "1" *-- "1" FP : fingerprint
    Binding "1" *-- "many" Adapter : 属性适配器
```

**关键说明**

| 结构 | 说明 |
|------|------|
| `AnimationGraphDocument` | 内存中的可编辑图文档；`graph` 是引擎反序列化后的对象树；`nodeIds`/`nodesById` 为 Pose 图节点分配稳定 ID；每次落盘成功会刷新 `fingerprint` |
| `SourceFingerprint` | 源文件 `sha256` + `mtimeMs` + 资源库 mtime，用于检测外部修改（`externallyModified`） |
| `InspectorBinding` | 绑定到具体目标（Layer/State/Transition/Motion/PoseNode/PoseInput/StateComponent）的属性读写职责 |
| `AdapterProperty` | 属性 getter/setter + 描述元数据（`attrs`），供编码为 `IProperty` dump |
| `AnimationGraphEditError` | 编辑异常，携带可枚举错误码（见 2.1 `AnimationGraphEditErrorCode`） |

---

## 4. 动画图变体（animation-graph-variant.ts）

动画图变体在引用一个动画图的基础上，覆写其中的**动画片段（clip）**，形成可复用的资源变体。

```mermaid
classDiagram
    direction TB

    class VSVC["AnimationGraphVariantAssetService"] {
        +query(uuid)
        +change(uuid, dump)
        +save(uuid)
    }

    class VariantDump["AnimGraphVariantDump"] {
        +string graphUuid
        +clips (Map: 原clipUuid -> 替代clipUuid)
        +invalids (Map: 未命中项)
    }

    class PendingEdit["PendingAnimationGraphVariantEdit"] {
        +string uuid
        +string source
        +number sourceMtimeMs
        +number assetDbMtime
        +PendingAnimationGraphSnapshot graph
        +sourceOverrides
        +AnimGraphVariantDump dump
    }

    class PendingSnap["PendingAnimationGraphSnapshot"] {
        +string uuid
        +string source
        +number sourceMtimeMs
        +number assetDbMtime
    }

    note for VariantDump "invalids 表示历史保存的覆写项在原图中已不存在，仅展示不落盘"
    note for PendingEdit "change() 先修改内存中的 pending 编辑，save() 统一写盘并清理 pending"

    VSVC "1" o-- "many" PendingEdit : _pendingEdits 缓存
    PendingEdit "1" *-- "0..1" PendingSnap : graph
    PendingEdit "1" *-- "1" VariantDump : dump
```

**API Schema（src/api/assets/schema.ts）**

| Zod Schema | 对应类型 | 说明 |
|-----------|---------|------|
| `SchemaAnimationGraphVariantDump` | `TAnimationGraphVariantDump` | 变体可编辑 dump：`graphUuid`（可空）、`clips`（覆写映射，空串表示无覆写）、`invalids?`（仅展示） |
| `SchemaAnimationGraphVariantResult` | `TAnimationGraphVariantResult` | `query` / `change` 的返回 |
| `SchemaAnimationGraphVariantSaveResult` | `TAnimationGraphVariantSaveResult` | `save` 的返回（恒为 `null`） |

---

## 5. 资源处理器（asset-handler）

```mermaid
classDiagram
    direction LR

    class Handler["AssetHandler （接口）"] {
        +string name
        +string assetType
        +createInfo
        +importer
    }

    class AGHandler["AnimationGraphHandler"] {
        +name = animation-graph
        +assetType = cc.AnimationGraph
        +getCreateMenuInfo()
        +import(asset)
    }

    class AGVHandler["AnimationGraphVariantHandler"] {
        +name = animation-graph-variant
        +assetType = cc.AnimationGraphVariant
        +getCreateMenuInfo()
        +import(asset)
    }

    Handler <|-- AGHandler : 实现
    Handler <|-- AGVHandler : 实现
```

| 处理器 | 扩展名模板 | importer | assetType |
|--------|-----------|----------|-----------|
| `AnimationGraphHandler` | `Animation Graph.animgraph`（模板 `default.animgraph`） | `animation-graph`（版本 `1.2.0`） | `cc.AnimationGraph` |
| `AnimationGraphVariantHandler` | `Animation Graph Varint.animgraphvari` | `animation-graph-variant`（版本 `1.0.0`） | `cc.AnimationGraphVariant` |

两者的 `import()` 均读取源 JSON，原样写入 library（`.json`），并抽取依赖 UUID 列表（`getDependUUIDList`）。

---

## 6. 整体关系一览

```mermaid
flowchart LR
    S["AnimationGraphAssetService"] -->|query / execute / save / reload| D["AnimationGraphDocument"]
    D -->|投影| V["AnimationGraphViewDump"]
    V --> La["AnimationGraphLayerView"]
    La --> SM["AnimationGraphStateMachineView"]
    SM --> St["AnimationGraphStateView"]
    SM --> Tr["AnimationGraphTransitionView"]
    St --> Mo["AnimationGraphMotionView"]
    St --> Po["AnimationGraphPoseView"]
    Mo -->|递归子节点| Mo
    Tr --> Co["AnimationGraphTransitionConditionView"]
    S -->|Inspector| IB["InspectorBinding"]
    S -->|命令| Cmd["AnimationGraphCommand"]
    T["AnimationGraphTarget"] -.定位.-> St
    T -.定位.-> Tr
    T -.定位.-> Mo
    T -.定位.-> Po
    T -.定位.-> La
    VS["AnimationGraphVariantAssetService"] -->|query / change / save| VD["AnimGraphVariantDump"]
    VD -->|graphUuid 引用还原| S
```