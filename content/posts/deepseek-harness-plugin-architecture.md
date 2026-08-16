---
title: DeepSeek Harness 插件化架构：Agent Loop 真的可以被替换吗？
slug: deepseek-harness-plugin-architecture
publishedAt: "2026-08-16"
date: "2026.08.16"
category: AI 探索
excerpt: 从 Profile、Bundle、Cordis Context 一路追到 AgentFactory，并用一个可运行的单轮 Agent Loop 验证 DeepSeek Harness 的“Everything is a Plugin”。
readTime: 20 分钟
---

DeepSeek Harness 把自己的架构主张写得非常直接：**Everything is a Plugin**。

这句话很容易被翻译成一句没有信息量的结论：“它扩展性很好。”真正值得追问的是：负责接收消息、调用模型、写入会话日志并决定何时结束的 Agent Loop，也只是一个可以从配置中卸下的普通插件吗？如果答案是肯定的，新的 Loop 需要实现什么契约？系统又靠什么保证替换之后其他组件仍然工作？

本文以 DeepSeek Harness `0.1.0-rc.5`、提交 [`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a) 为分析对象。项目仍处于 Developer Preview，官方明确提醒兼容性会被打破，因此文中的文件和接口是一次带版本锚点的源码观察，不应被视为长期稳定 API。[项目 README](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a#developer-preview)

## 先说结论：“一切皆插件”成立，但不是字面意义

DeepSeek Harness 没有消灭核心，而是把核心分成了两层：

| 层次 | 主要内容 | 是否属于 Harness 可替换能力 |
| --- | --- | --- |
| 最小运行时 | Cordis Context、插件 Loader、依赖解析、Fiber 和 Effect 生命周期 | 否，它们负责让插件存在 |
| 产品能力 | 模型 Adapter、工具注册表、Session Store、Agent Registry、默认 Agent Loop、权限与沙箱等 | 是，通过插件树组合 |

因此，更准确的结论是：

> DeepSeek Harness 没有不可替换的**业务核心**。它保留 Cordis 作为最小运行时，再把 Agent 产品的能力拆成由配置组合、由服务键连接、由事件协作、由 Effect 管理生命周期的插件。

这比“支持第三方插件”更激进。普通插件系统通常保留一个固定主循环，只允许插件增加工具或 Hook；DeepSeek Harness 则把默认 Agent Loop 自身也放进插件树。官方架构文档列出的 `ctx.sessions`、`ctx.systemPrompt`、`ctx.tools`、`ctx.agents`、`ctx.agentLoop` 和 `ctx.llm`，并不是一个大对象内部的私有模块，而是分别注册到 Context 的服务。[架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#core-packages)

## 一、运行中的 dsh 不是程序清单，而是一棵插件树

要理解 Agent Loop 为什么能替换，不能从 `agent-loop/src/agent.ts` 直接开始。第一条链路是：它最初为什么会出现在进程里？

```text
Profile
  └─ 按顺序列出多个 Bundle
       └─ 每个 Bundle 提供一组 Patch
            └─ Profile / Home / --patch 继续覆盖
                 └─ 得到 Entry 列表
                      └─ Cordis Loader 挂载插件树
                           └─ 插件向 Context 注册服务、事件和 Effect
```

### 1. Profile 和 Bundle 解决“装哪些插件”

Profile 是一次运行使用的具名组合；Bundle 是可分发的配置层。`loadProfile()` 读取 Profile 清单中的 Bundle，找到每个 Bundle 在 `package.json` 里声明的 Patch 文件，再按顺序组成多个配置层。[`profile.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/boot/app-boot/src/profile.ts#L371-L402)

这些层不是修改一份预先写死的总配置。`composeEntries()` 从空数组开始，依次应用 Patch，最后得到真正要加载的 Entry 列表。[`composeEntries()`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/boot/app-boot/src/profile.ts#L405-L420)

基础 Bundle 就是在这里插入默认 Agent Loop：

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents: []
```

这不是编译进启动入口的特殊调用，只是一条普通配置记录。[`dsh-base/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/base/cordis.patch.yml#L434-L439)

### 2. Boot 只负责建立运行环境并挂载配置

`boot()` 创建根 Context、安装 Loader，再把最终配置交给 `mountRootInclude()`；随后等待插件树完成激活。[`boot()`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/boot/app-boot/src/index.ts#L757-L785) Loader 因此属于最小运行时，而不是某项 Agent 能力。

这也揭示了“一切皆插件”的第一条边界：必须先有 Context 和 Loader，才可能加载其他插件。口号成立的范围是 Harness 的产品能力，而不是让插件系统凭空加载自己。

### 3. Patch 能改配置，却不能偷偷把包名换掉

Patch 以 `id` 找到已有 Entry，可以覆盖 `config`、`disabled`、`inject` 等字段，也能插入新 Entry。`name` 在已有 Entry 上只是校验条件；如果它与原名称不一致，Patch 会警告并跳过，而不是直接换包。[`applyEntryPatches()`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/vendor/include/src/index.ts#L58-L128)

所以，用自定义 Loop 替换默认 Loop 的配置动作不是“把 `name` 改掉”，而是：

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  disabled: true

- insert:
    - id: my-agent-loop
      name: './my-agent-loop.ts'
```

这个细节很重要。可组合性不是任意覆写，而是由明确的 Entry 身份和 Patch 规则约束。

## 二、Cordis 怎样把插件从“文件”变成系统组件

配置只能决定加载什么，真正让各插件协作的是 Cordis。官方 Primer 把机制总结为五个概念：Plugin、Context、`inject`、类型化事件和可逆 Effect。[Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md#cordis-in-five-ideas)

### 1. Context 是服务仓库

Cordis 的 `Service` 子类在构造时用稳定名称向 Context 注册自己。消费者读取 `ctx.llm`、`ctx.tools` 或 `ctx.sessions`，而不是导入某个具体实现。[`Service`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/vendor/cordis/src/service.ts#L5-L53)

这是一种运行时依赖倒置：调用方依赖服务键代表的能力，具体 Provider 由插件树决定。

### 2. `inject` 把加载顺序改写成依赖关系

默认 `AgentLoop` 声明：

```ts
static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt']
```

Cordis 会等这些服务存在后再激活插件。开发者不需要手写“先初始化 Session，再初始化 LLM，最后初始化 Loop”的启动脚本。[`AgentLoop`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/index.ts#L295-L320)

这带来真正的组合能力：配置中的书写顺序不再等同于业务初始化顺序，依赖图才是约束。

### 3. 类型化事件负责拦截和协作

直接能力调用使用服务方法，横切行为则通过事件加入。事件用 TypeScript declaration merging 扩展，分为 `emit`、`waterfall`、`parallel` 和 `serial` 等分发模式。

例如，`agent/pre-step` 可以改写或拒绝即将进入模型的消息；`agent/request` 可以包装请求；`llm/stream` 可以替换模型流。Waterfall 监听器必须调用 `next()` 才会继续向下委托，不调用就会短路。[Waterfall 语义](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md#cordis-waterfall-semantics)

### 4. 注册行为必须是可逆 Effect

工具、Adapter、监听器和 Prompt Section 不是只进不出的全局数组。它们通过 `ctx.effect()`、`ctx.on()` 或返回 disposer 的注册方法加入系统；所属 Fiber 卸载时，注册随之撤销。

默认 Loop 注册 Agent Factory 的代码只有一行：

```ts
ctx.effect(() => ctx.agents.setFactory(this), 'agentLoop.setFactory()')
```

Effect 把“注册 Factory”和“卸载时清空 Factory”绑定成一个生命周期单元。[默认 Loop 注册点](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/index.ts#L346-L353)

这也是热重载能够成立的前提：旧插件离开时必须撤销自己对共享 Context 的影响，否则所谓替换只是把第二套实现叠在泄漏的第一套实现之上。

## 三、Agent Loop 的真正替换缝隙不是 `ctx.agentLoop`

初看源码，很容易认为替换接口是 `ctx.agentLoop`，因为默认实现以这个服务键注册。但其他组件创建 Agent 时，并不需要依赖这个具体服务。

真正的缝隙位于 `ctx.agents` 内部的 `AgentFactory` 插槽。

### 1. 接口定义在 `dsh-agent`，实现放在 `dsh-agent-loop`

`AgentFactory` 只有两个入口：创建新 Agent 的 `createAgent()`，以及从持久化 Session 恢复的 `resume()`。它被定义在 `@deepseek-ai/dsh-agent` 包中，而不是具体 Loop 包中。[`AgentFactory`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent/src/index.ts#L177-L214)

默认实现则是：

```ts
export class AgentLoop extends Service implements AgentFactory
```

消费者只调用 `ctx.agents.create()`。`AgentRegistry` 取出当前注册的 Factory，再把调用转发给它；调用方不需要知道 Factory 是官方 Loop 还是第三方实现。[Registry 转发](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent/src/index.ts#L396-L415)

```text
Web / ACP / Headless / SDK
          │
          ▼
     ctx.agents.create()
          │
          ▼
   AgentRegistry 的 Factory 插槽
          │
          ├── 默认 AgentLoop
          └── 自定义 AgentFactory
```

这个拆分满足了插件替换最关键的条件：**接口包不能反向依赖默认实现包**。否则消费者即使表面调用接口，也会在构建时把默认 Loop 一起拖进来。

### 2. 系统一次只允许一个 Factory

`setFactory()` 发现插槽已被占用时会直接报错，而不是按“最后注册者获胜”。注册返回的 disposer 会在卸载时清空插槽。[`setFactory()`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent/src/index.ts#L360-L388)

这项限制减少了歧义：同一次 Agent 创建只能有一个权威 Factory。但它也说明配置替换必须完整——先禁用默认 Loop，再装入新 Loop；不能让两个 Provider 竞争同一个服务。

### 3. 替换 Factory 只是开始，真正困难的是实现 `Agent`

Factory 返回的 `Agent` 需要暴露 Session、Inbox、状态、Agent 级 Context，以及 `followup()`、`steer()`、`inject()`、`cancel()`、`whenIdle()` 等行为。[`Agent` 接口](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent/src/runtime-types.ts#L63-L143)

这不仅是 TypeScript 方法列表。注释还规定了时序和所有权语义：什么时候进入 `running`，取消后新消息属于当前 Turn 还是下一个 Turn，`whenIdle()` 要等待哪一段活动，以及 Agent 级注册何时释放。

因此，“可以替换”不等于“随便实现几个同名函数即可”。类型系统验证结构，真正的行为契约还分布在 JSDoc、事件顺序、不变量和测试中。

## 四、默认 Agent Loop 实际做了什么

默认 Loop 的复杂度主要不在 `while`，而在边界管理。

用户消息通过 `followup()` 进入 Inbox 并唤醒 Driver；Driver 打开 Turn，从 Inbox 领取消息，组装 Prompt 和工具 Schema，经过 `agent/pre-step` 后才正式打开 Step。随后它从 Session Log 派生历史，通过 `ctx.llm` 发起流式请求，把原始 Chunk 和最终 Assistant Message 都写回日志；出现工具调用时，再进入工具流水线并决定是否继续下一个 Step。[Turn Flow](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#turn-flow)

默认实现中的模型调用核心可以压缩为：

```text
session.deriveMessages()
  → ctx.llm.stream(request)
  → assistant/chunk × N
  → BlockAssembler
  → assistant/message
  → tool calls 或完成
```

源码确实在收到每个流式 Chunk 时先追加 `assistant/chunk`，再组装最终消息并追加 `assistant/message`。[`step()`](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts#L332-L399)

这里需要区分两种事件：

| 事件类型 | 示例 | 用途 |
| --- | --- | --- |
| Durable Session Event | `turn/start`、`user/message`、`assistant/chunk`、`tool/result` | 重放、恢复、持久化、UI Transcript、重新派生模型历史 |
| Live Agent / Capability Event | `agent/status`、`agent/pre-step`、`llm/stream`、`tools/pre-execute` | 运行时观察、拦截和策略控制 |

官方规则是“模型可见即必须记录”：进入模型请求的信息必须能从 Session Log 重建。[Session Log](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#session-log) 这条规则对替代 Loop 同样成立；否则新 Loop 虽然能返回答案，却会破坏恢复、分叉和回放。

## 五、可运行实验：不加载默认 Loop，完成一次模型请求

为了验证替换不是接口层的纸面设计，我实现了一个 `SingleTurnFactory` 和 `SingleTurnAgent`。实验使用仓库真实的 Cordis、`LlmRuntime`、`SessionStore`、`AgentRegistry`、Inbox、消息类型和 Session Event；唯一假的部分是模型 Adapter，它固定返回可预测文本。

实验刻意**没有加载** `@deepseek-ai/dsh-agent-loop`：

```ts
const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(SessionStore)
await ctx.plugin(AgentRegistry)

ctx.llm.registerAdapter(['deterministic'], adapter)
ctx.agents.setFactory(new SingleTurnFactory(ctx))
```

随后仍然通过公共消费者入口创建 Agent：

```ts
const { agent } = await ctx.agents.create({
  sessionId: SessionId('minimal-loop-demo'),
  agentOptions: {
    provider: 'deterministic',
    model: 'fixture-model',
  },
})
```

自定义 Loop 只执行一个 Step：领取一条 follow-up，写入 `user/message`，通过 `ctx.llm.stream()` 调用确定性 Adapter，再写回 Chunk、Assistant Message 和结束边界。完整代码保存在 `experiments/deepseek-harness-agent-loop/minimal-loop.ts`。

在提交 `47f9438` 上执行得到：

```json
{
  "factory": "SingleTurnFactory",
  "defaultLoopLoaded": false,
  "adapterCalls": 1,
  "finalText": "deterministic reply: hello plugin loop",
  "eventTypes": [
    "agent/inbox/spliced",
    "turn/start",
    "agent/inbox/spliced",
    "step/start",
    "user/message",
    "assistant/chunk",
    "assistant/chunk",
    "assistant/chunk",
    "assistant/chunk",
    "assistant/chunk",
    "assistant/message",
    "step/end",
    "turn/end"
  ]
}
```

这个结果证明了三件事：

1. `AgentRegistry` 不要求默认 `AgentLoop` 类存在，只要求有一个 `AgentFactory`。
2. 自定义 Agent 可以继续复用官方 LLM Adapter 注册表和 Session Log。
3. `ctx.agents.create()`、`agent.followup()` 和 `agent.whenIdle()` 这些公共消费者入口不需要因替换而改变。

但它**没有**证明最小实现已经与默认 Loop 等价。实验不支持工具循环、持久化恢复、并发 Steering、完整取消收敛、Agent Scope 回滚和热重载。恰恰是这些缺口揭示了插件化的真实成本：替换点存在，不代表实现契约很小。

## 六、从三个维度评析这套插件化架构

### 1. 可替换性：结构上是真的，行为上有很高门槛

Agent Loop 的可替换性不是靠一个抽象类自我宣称，而是由四个源码事实共同成立：

- 默认 Loop 通过普通配置 Entry 进入系统；
- `AgentFactory` 定义在接口包；
- 消费者通过 `AgentRegistry` 间接创建 Agent；
- Factory 注册是可撤销 Effect。

所以从结构上看，“核心也可替换”成立。

但默认 Loop 承担的语义远多于一次模型调用。它管理 Session 与 Agent 的原子发布、创建失败回滚、Fiber 所有权、取消、恢复、作用域、事件顺序、工具并发和错误收敛。一个替代实现只要漏掉其中一项，就可能仍能聊天，却不再是完整 Harness Provider。

最终判断是：**替换缝隙是真实的，替换成本也是真实的。**

### 2. 可组合性：配置是架构的一部分，不只是启动参数

Profile、Bundle 和 Patch 把“产品形态”从代码入口移到了配置层。Web、Headless 或自定义部署不是几个不断分叉的 Main 函数，而是同一批插件的不同组合。

它的优点是：

- Bundle 可以分发一组有共同目的的插件；
- 上层 Patch 可以禁用或重新配置下层 Entry；
- `--dump-config` 能展示机器实际启动的插件树；
- 依赖关系由 `inject` 表达，减少手工启动顺序。

代价也很明确：

- 行为来源可能散落在多个配置层；
- Patch 覆盖 `config` 时是整块替换，调用方必须重述要保留的字段；
- 同一服务只能有一个 Provider 时，替换需要同时处理旧 Entry 和新 Entry；
- HMR 让运行配置可变化，也提高了生命周期实现的要求。

换句话说，配置层已经拥有一部分传统“应用组装代码”的复杂度。它不是附属文件，而是系统架构的一部分。

### 3. 契约可靠性：强类型解决“接得上”，不自动解决“行为正确”

这套架构用了多层契约：

| 契约 | 解决的问题 | 仍然可能遗漏什么 |
| --- | --- | --- |
| Context 服务键 | 消费者不导入具体 Provider | 运行时缺少服务、服务版本不兼容 |
| `inject` | Provider 未就绪时不激活消费者 | 动态依赖和配置语义错误 |
| TypeScript 接口 | Factory、Agent、Adapter 的结构一致 | 时序、所有权、取消等语义不一致 |
| 类型化事件 | 事件名、参数和分发模式可检查 | Listener 忘记 `next()` 或错误短路 |
| Effect / disposer | 注册可随插件卸载撤销 | 清理顺序错误、异步资源未收敛 |
| Session Event 不变量 | 模型上下文可重建 | 自定义 Loop 漏记事实或记错顺序 |

这比只约定几个回调函数可靠得多，但它没有消除集成测试。尤其 Agent Loop 的公共接口看起来不大，JSDoc 中的行为承诺却非常密集。真正的契约是“类型 + 文档 + 事件日志 + 生命周期测试”的组合。

## 七、这套设计最值得借鉴的不是“多写插件”

DeepSeek Harness 的核心价值不在于插件数量，而在于它把三个层次分开了：

1. **组合层**决定本次运行加载哪些能力；
2. **服务层**提供可以直接调用的稳定能力入口；
3. **事件层**让策略、观察和拦截在不导入主循环的情况下加入。

很多系统只做到了第一层：可以加载扩展包，却仍然要求扩展包调用内部单例。DeepSeek Harness 进一步用 Context 服务键切断具体实现依赖，再用 Effect 处理卸载，用 Session Event 保留可重建事实。

如果要在自己的 Agent Runtime 中借鉴这套设计，应该先问四个问题：

- 默认 Agent Loop 是否只是某个公共 Factory 接口的 Provider？
- UI、SDK 和协议层是否只依赖公共 Agent 接口？
- 模型可见状态是否都能从持久日志重建？
- 每项注册是否都有确定的所有者和反向清理动作？

只把工具改成插件，并不能得到同样的架构结果。

## 八、推荐的源码阅读顺序

如果希望继续深入，不建议按目录从头读到尾。围绕插件化主线，下面的顺序更有效：

1. `docs/architecture.md`：先建立服务、事件和 Session Log 的总图；
2. `docs/cordis-primer.md`：理解 Context、`inject`、事件模式和 Effect；
3. `packages/boot/app-boot/src/profile.ts`：看 Profile 和 Bundle 如何组成 Entry；
4. `vendor/include/src/index.ts`：确认 Patch 的精确语义；
5. `packages/bundle/base/cordis.patch.yml`：看默认产品实际装了哪些插件；
6. `packages/core/agent/src/index.ts`：追踪 Factory 注册与消费者转发；
7. `packages/core/agent/src/runtime-types.ts`：阅读 Agent 行为契约；
8. `packages/core/agent-loop/src/index.ts`：看默认 Provider 怎样注册；
9. `packages/core/agent-loop/src/agent.ts`：最后进入 Turn、Step、模型和工具循环。

这条路径从“为什么会加载”走到“加载后如何运行”，比一开始扎进 Loop 的内部状态机更容易识别真正的架构边界。

## 结语

DeepSeek Harness 的“Everything is a Plugin”不是说系统没有核心，而是说它没有一块必须通过修改内部代码才能扩展的特权业务核心。

源码和实验共同证明：默认 Agent Loop 确实只是 `AgentFactory` 的一个 Provider；禁用它并注册另一个 Factory 后，现有的 Registry、LLM Runtime 和 Session Store 仍能协同完成一次模型请求。

更值得注意的是替换背后的约束。一个合格的 Loop 不仅要“能调用模型”，还要维护日志可重建性、事件顺序、取消语义、Agent Scope 和资源所有权。插件化没有消除复杂度，而是把复杂度从硬编码依赖转化成显式契约。

这正是这套架构最有价值的地方：它没有承诺扩展会变得免费，而是让扩展发生在哪里、依赖什么、如何卸载，以及破坏了什么，都更容易被看见和验证。
