---
title: Claude Code 内部架构：从一次请求到代码修改
slug: claude-code-architecture
publishedAt: "2026-04-10"
date: "2026.04.10"
category: AI 探索
excerpt: Claude Code 看起来像一个终端里的聊天窗口，但真正让它能完成复杂编程任务的，是模型之外的一整套 Agent Runtime。
readTime: 15 分钟
---

很多人第一次使用 Claude Code 时，注意力会放在模型本身：它能不能理解项目、能不能一次改对、能不能自己定位 Bug。

但如果把问题改成“它是怎样完成一次任务的”，答案就不再只是一个模型名称。模型负责提出下一步动作，真正把动作变成可执行流程的，是 CLI、工具系统、权限控制、上下文管理、任务调度和会话存储共同组成的 Runtime。

2026 年 3 月 31 日，Claude Code 的一个 npm 发布包意外包含了内部源码映射文件，公开了大量 CLI TypeScript 源码。这里需要先划清边界：泄露的是 Claude Code 这个编程 Agent 的客户端与运行时源码，不是 Claude 模型的权重、训练代码或“模型完整源码”。[Axios 的报道](https://www.axios.com/2026/03/31/anthropic-leaked-source-code-ai)也将其描述为 Claude Code 的内部源码泄露。

本文不尝试逐行复述某个特定版本的源码，而是用源码级分析、公开文档和可观察行为，回答三个问题：Claude Code 的整体架构是什么；一次请求如何流过这套系统；阅读源码时，应该怎样把目录和模块对应起来。源码版本会变化，精确的文件名和实现细节不能被当成稳定 API。

为了避免把推测写成源码事实，后文把证据分成三层：源码或源码级研究直接支持的结论，官方文档公开说明的当前行为，以及根据 Agent 通用机制画出的解释性模型。第一层适合回答“代码实际上怎么做”，第二层适合回答“产品现在承诺什么”，第三层只用来帮助读者建立心智模型。

## 一、先看结论：Claude Code 不是一个“带终端的聊天框”

可以先把 Claude Code 抽象成下面这张图：

![Claude Code 总体架构](../assets/posts/claude-code-architecture/architecture-overview.svg)

它的核心循环其实很朴素：调用模型，检查模型是否要求使用工具，执行工具，把结果放回上下文，再次调用模型，直到模型结束本轮任务。对 Claude Code 的源码级研究也把这个循环概括成一个简单的 `while` loop。[相关研究](https://arxiv.org/abs/2604.14228)

真正复杂的地方在循环周围：什么工具可以被看见，什么工具可以被调用；调用前是否要用户确认；结果应该全部保留还是压缩；大任务是否交给子 Agent；外部 MCP 工具如何接入；失败的命令和中断的任务如何恢复。

所以更准确的公式是：

> Claude Code 的能力 = 模型决策能力 × Agent Loop × 工具执行 × 上下文管理 × 权限与反馈

任何一个环节缺失，系统都会退化成另一种东西：只有模型，没有工具，它是聊天；只有工具，没有循环，它是命令面板；只有循环，没有权限，它是一个危险的自动化脚本。

## 二、一次请求是怎样完成的

假设用户输入：

> 给这个项目增加一个用户登录接口，并补上测试。

从用户视角看，这似乎是“一次提问”。从 Runtime 视角看，它至少会经历以下阶段。

![Claude Code 一次请求的生命周期](../assets/posts/claude-code-architecture/request-lifecycle.svg)

### 1. 启动阶段：先建立工作边界

Claude Code 不是拿到用户文字后直接调用 API。它需要先确定当前会话在哪个目录运行、项目是否可信、有哪些项目级说明、有哪些工具和 MCP Server，以及当前权限模式是什么。

这一步决定了后面模型“能看见什么”和“能做什么”。例如，工作目录边界、代码库信任状态、项目配置和 `CLAUDE.md` 等内容，都会影响后续的上下文和工具权限。官方安全文档明确说明，默认情况下 Claude Code 只能写入启动目录及其子目录，访问范围之外的路径需要额外确认。[安全文档](https://code.claude.com/docs/en/security)

### 2. 模型阶段：模型只提出动作，不直接碰机器

模型返回的不是“已经执行完的结果”，而是文本和结构化的 Tool Use 请求。例如：

```json
{
  "name": "Read",
  "input": {
    "file_path": "src/auth/login.ts"
  }
}
```

这个请求仍然只是一个提案。Runtime 要先确认工具是否存在、参数是否符合 Schema、当前 Agent 是否拥有这个工具、当前路径是否允许访问，以及是否需要用户确认。只有通过这些检查，工具才会真正执行。

这也是 Agent 和“让模型输出一段 Shell 命令”的重要区别：模型不能越过工具层直接获得进程、文件系统或网络权限。

### 3. 工具阶段：每个动作都是一个受治理的能力

工具系统可以理解成一个注册表加一条执行管线：

文件读取、目录搜索、代码编辑、Shell 执行和 MCP 工具，看起来都是“工具调用”，但风险完全不同。只读搜索通常可以自动进行，写文件和执行外部命令则需要更严格的权限判断。官方文档也把敏感操作的显式确认、工作目录范围、命令注入检测和 MCP 权限配置列为安全机制。[Claude Code Security](https://code.claude.com/docs/en/security)

### 4. 反馈阶段：工具结果会改变下一轮问题

工具结果不是答案的附属信息，而是 Agent 的新观察值。

一次典型的反馈过程是：用户提出“增加登录接口”后，Agent 先用 Read 发现项目使用 Spring Security，再用 Grep 找到 `UserRepository` 和密码编码器，随后用 Bash 运行测试；如果测试暴露出认证配置问题，模型就会把下一步计划改成“先修复认证配置，再添加接口”。

每一轮工具调用都可能让模型改变计划。Agent 的“自主性”不是模型凭空想出完整方案，而是模型不断提出动作、接收环境反馈、修正下一步动作。

## 三、五个需要分开理解的架构中心

一份基于公开 TypeScript 源码的架构分析把 Claude Code 拆成五个中心：终端应用、Agent Query 与 Tool Runtime、权限与沙箱控制面、任务与 Agent 执行系统、集成与扩展平台。[Claude Code Source Architecture](https://claude-code-explain.vercel.app/) 这是一种有用的阅读视角，不是 Anthropic 发布的官方目录结构。另一份源码级研究则指出，核心循环之外的大量代码集中在权限、上下文压缩、扩展机制、子 Agent 和会话存储上，并将其归纳为七种权限模式、五层上下文压缩和四类扩展机制。[源码级研究](https://arxiv.org/abs/2604.14228)

### 1. Terminal Application Shell

这是用户看到的部分：输入框、流式文本、工具确认、进度状态、文件差异和错误提示。它不负责决定“下一步要做什么”，而是负责把 Runtime 的状态可靠地呈现给用户，并把用户的确认和中断传回 Runtime。

把 UI 和 Agent Loop 分开很重要。否则一个终端渲染问题，就可能影响任务执行；一次用户中断，也可能被误处理成模型错误。

### 2. Query Engine

这是 Agent Loop 所在的地方，负责维护一次查询的生命周期：

- 接收用户消息；
- 组装模型请求；
- 处理流式响应；
- 识别 Tool Use；
- 调度工具执行；
- 把结果加入下一轮请求；
- 在结束、失败、中断和重试之间做状态转换。

阅读源码时，这通常是最值得先找的入口。不要一开始就从某个具体工具读起，先找到“模型请求在哪里发出、工具结果在哪里回流、循环在哪里结束”。

### 3. Permission and Sandbox Control Plane

这是 Agent Runtime 的“控制面”。它不创造业务能力，但决定业务能力在什么条件下可用。

可以把一次工具调用的安全判断写成：

1. 判断工具类型；
2. 检查参数和路径；
3. 匹配 `allow / deny` 规则；
4. 判断当前权限模式；
5. 执行 Hook 或安全分析；
6. 自动执行、请求确认，或直接拒绝。

官方文档列出的工作目录限制、网络命令确认、失败关闭匹配和危险命令检测，都说明权限不是 UI 上的一个“允许”按钮，而是贯穿工具生命周期的中间层。[官方安全说明](https://code.claude.com/docs/en/security)

### 4. Task、Agent 与 Background Execution

当任务变大，所有搜索结果都塞回主会话会造成两个问题：上下文变长，主 Agent 需要处理大量并不重要的中间细节。

因此，Claude Code 可以把探索、规划或实现拆给拥有独立上下文的子 Agent。子 Agent 完成后只返回摘要，主会话继续保留决策所需的信息。官方文档也明确把“避免探索结果淹没主上下文”作为使用子 Agent 的主要原因，并允许为子 Agent 限制工具和权限。[Subagents 文档](https://code.claude.com/docs/en/subagents)

更进一步，隔离的 worktree 让多个执行单元可以在不同工作区里修改代码，减少互相覆盖的风险。这里的关键不是“多调用几个模型”，而是把上下文、权限和工作目录一起隔离。

### 5. Integration and Extensibility Platform

MCP、插件、Skills、Hooks、LSP 和 IDE 桥接，看起来是不同功能，架构上都在回答同一个问题：如何把外部能力变成 Agent 可以理解、选择和调用的工具。

扩展系统如果没有统一的工具描述、生命周期和权限边界，最后就会变成一堆只能靠 Prompt 约定的旁路逻辑。Claude Code 的价值之一，正是把扩展能力纳入同一条工具治理链。

## 四、源码阅读地图与四套关键机制

这里不要把“文件名”当成架构本身。不同版本可能重命名、拆分或合并文件，更稳妥的做法是先按职责建立阅读地图，再用关键词把职责落到具体实现：

| 架构模块                    | 先找什么                                        | 阅读时要回答的问题                               |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| CLI / Terminal              | 启动参数、交互渲染、输入输出、interrupt         | 用户输入如何进入 Runtime？确认和中断如何返回？   |
| Query Engine                | model request、stream、tool use、stop reason    | Tool Use 如何被识别？循环何时结束？              |
| Tool Registry               | tool definition、Schema、executor、result       | 工具如何注册？模型看到的是完整集合还是动态集合？ |
| Permission                  | allow / deny、approval、sandbox、path check     | 权限是在调用前、调用中还是调用后判断？           |
| Context / Compaction        | context、summary、token、compact、truncate      | 什么信息被保留？什么信息被压缩？                 |
| Task / Agent                | task、agent、background、worktree、isolation    | 子任务如何创建、隔离、汇总和恢复？               |
| MCP / Plugin / Skill / Hook | server、plugin、skill、hook、lifecycle          | 扩展如何进入工具注册表？权限是否沿用主会话？     |
| Session / Storage           | session、transcript、append、resume、checkpoint | 任务中断后，系统凭什么恢复上下文？               |

一个高效的源码阅读顺序是：

1. 入口与启动
2. Query Engine
3. Tool Registry / Tool Executor
4. Permission
5. Context / Compaction
6. Task / Agent / Worktree
7. MCP、Plugin、Skill、Hook 等扩展

这个顺序对应一次请求的真实路径。先建立路径，再深入单个模块，通常比从五十万个文件里寻找“最聪明的 Prompt”更有效。

源码阅读时还要同时画两条链：

一条是控制链：用户确认 → 权限判断 → 工具执行 → 中断 / 重试 / 恢复。

另一条是数据链：用户消息 → Context → 模型请求 → Tool Result → Context 更新。

控制链回答“谁有权让动作发生”，数据链回答“模型凭什么做出下一步决定”。很多 Agent 的设计问题，恰好发生在两条链交叉的地方：工具结果既是数据，也是下一轮模型请求的一部分；权限结果既是控制状态，也可能改变模型下一步能看到的工具集合。

### 1. 不要把 Context 当成一条无限增长的消息数组

上下文管理至少要处理五类动作：收集事件、筛选相关信息、控制 Token 预算、压缩旧内容、保留可追溯的原始记录。它们的目标并不是把历史全部塞给模型，而是为当前动作构造一份“最小充分上下文”。

例如，模型刚刚读取了一份 5,000 行日志，下一步只需要知道其中的错误类型、时间范围和三条关键堆栈。原始日志可以留在会话记录或外部文件中，当前 Context 则只保留摘要和来源引用。

这解释了为什么上下文压缩不能被简单理解成“把旧消息删掉”：真正的压缩要保留状态变化、已验证结论和未解决问题，否则 Agent 会在下一轮重新探索已经走过的路。源码级研究将 Claude Code 的上下文压缩描述为一个多层管线，而不是一个孤立的截断函数。[相关研究](https://arxiv.org/abs/2604.14228)

#### 五层上下文压缩

v2.1.88 的源码级分析将压缩过程归纳为五层。它们按照“先做影响较小的处理，仍然不够时再逐步升级”的顺序工作：

| 层级 | 机制             | 主要作用                                       | 对历史的影响                   |
| ---- | ---------------- | ---------------------------------------------- | ------------------------------ |
| 1    | Budget Reduction | 限制单个工具结果的大小，避免一份日志占满上下文 | 只控制新结果的体积             |
| 2    | Snip             | 轻量裁剪较早的历史内容                         | 移除低价值旧内容               |
| 3    | Microcompact     | 进行细粒度、缓存友好的压缩                     | 生成压缩边界，尽量保留缓存价值 |
| 4    | Context Collapse | 读取历史时构造更短的虚拟视图                   | 不直接改写原始 Transcript      |
| 5    | Auto-compact     | 由模型生成完整会话摘要                         | 用摘要代表较早的历史片段       |

这五层的关键并不是“压得越短越好”，而是尽量推迟有损摘要。`Budget Reduction` 始终生效，`Auto-compact` 默认开启但可以关闭，中间三层则受到 Feature Flag 控制。[五层压缩管线](https://arxiv.org/html/2604.14228)

压缩后，系统不会简单删除旧 Transcript。`compact.ts` 会追加边界和摘要事件，并保留仍需继续使用的消息、附件与 Hook 结果。这样，模型看到的是压缩后的工作视图，磁盘上仍然保留可追踪的原始事件。

### 2. 不要把 Permission 当成 Prompt 里的几句提醒

如果安全边界只写在系统 Prompt 里，那么模型仍然可能在一次错误判断后提出危险动作。更稳妥的做法是把权限放在工具执行路径上：即使模型提出了越权调用，Runtime 也能在真正接触文件系统、Shell 或网络之前拦截它。

因此，源码中应该重点确认三件事：权限判断是否发生在执行前；拒绝结果是否能回流到模型；规则是否默认失败关闭。只看“有哪些权限提示词”，无法判断系统是否真的有控制能力。

#### 七种权限模式

权限模式不是简单的“开或关”，而是一条从低自治到高自治的连续光谱：

| 模式                | 行为                                                     | 典型用途                   |
| ------------------- | -------------------------------------------------------- | -------------------------- |
| `plan`              | 模型先创建计划，用户批准后才能进入执行                   | 大范围改动前先审查方案     |
| `default`           | 标准交互模式，多数有风险的动作需要确认                   | 日常使用                   |
| `acceptEdits`       | 工作目录内的编辑和部分文件操作自动批准，其他命令仍需确认 | 连续修改代码，减少重复确认 |
| `auto`              | 快速规则无法判断时，交给基于 Transcript 的分类器评估     | 在边界内提高自动化程度     |
| `dontAsk`           | 不弹出确认；原本需要询问的动作直接拒绝                   | 无人值守但不允许临时提权   |
| `bypassPermissions` | 跳过大多数权限提示，但部分安全关键检查仍然存在           | 已隔离环境中的高自治任务   |
| `bubble`            | 子 Agent 把权限请求上浮到父终端                          | 内部子 Agent 权限协商      |

其中 `plan、default、acceptEdits、dontAsk、bypassPermissions` 是外部可见模式，`auto` 受功能开关控制，`bubble` 主要服务于子 Agent。规则匹配采用 deny-first：拒绝规则优先于允许规则，未匹配的风险动作默认询问，而不是静默执行。[权限模式与授权管线](https://arxiv.org/html/2604.14228)

### 3. 四种扩展机制不是重复功能

MCP、Plugin、Skill 和 Hook 都能扩展 Claude Code，但它们进入 Runtime 的位置不同，对上下文窗口造成的成本也不同：

| 机制   | 改变什么                                       | 插入位置               | 上下文成本                               |
| ------ | ---------------------------------------------- | ---------------------- | ---------------------------------------- |
| MCP    | 给模型增加可调用的外部工具和资源               | Tool Pool              | 高：需要向模型提供工具 Schema            |
| Plugin | 打包并分发 MCP、Skill、Hook、Agent 等组件      | 多个层级               | 取决于包含的组件                         |
| Skill  | 给 Agent 注入领域说明和可复用工作流            | Context Assembly       | 低：通常先加载描述，调用时再注入完整内容 |
| Hook   | 在工具、会话、压缩等生命周期节点拦截或补充行为 | 执行前后或生命周期事件 | 默认接近零，除非主动注入上下文           |

因此，MCP 解决的是“模型还能调用什么”，Skill 解决的是“模型应该怎样完成某类工作”，Hook 解决的是“某个事件发生前后系统要做什么”，Plugin 则负责把这些能力组合并分发。把四者统一成一种 Tool API 看起来简单，却会让不需要进入模型上下文的生命周期逻辑也占用 Token。[扩展机制与上下文成本](https://arxiv.org/html/2604.14228)

### 4. Session 不是 Context 的另一个名字

Context 是模型这一轮真正看到的工作视图，Session 是任务在磁盘上的持久记录。Context 可以被压缩，Session 则要尽量保留事件，以便审计、恢复和分支。

| 状态载体           | 保存什么                                            | 生命周期                           |
| ------------------ | --------------------------------------------------- | ---------------------------------- |
| Live Context       | 当前 Prompt、工具定义、相关历史、工具结果和摘要     | 每次模型调用前重新组装             |
| Session Transcript | 用户消息、模型消息、Tool Use、Tool Result、压缩边界 | 以近似 append-only 的 JSONL 持久化 |
| Subagent Sidechain | 子 Agent 的独立历史和元数据                         | 单独保存，父 Agent 只接收最终结果  |
| File History       | 文件修改前后的快照                                  | 为 `--rewind-files` 提供文件级回滚 |
| Permission Context | 当前会话临时批准的权限                              | 只保存在内存中，不随恢复继承       |

`--resume` 会通过 `conversationRecovery.ts` 重放 Transcript，`fork` 会从旧会话创建新的分支。但两者都不会恢复 Session 级临时权限：新会话需要重新建立信任。这样会多几次确认，却避免把旧环境里的授权无声带进已经变化的代码库和任务上下文。[Session 持久化与恢复](https://arxiv.org/html/2604.14228)

子 Agent 也不会把完整历史写进父 Session。每个子 Agent 有独立的 JSONL Transcript 和元数据文件，父 Agent 只接收最终文本和必要元数据。这既保留了调试证据，也避免子任务的大量搜索结果挤占主上下文。

## 五、三条源码调用链

前面的模块图还比较抽象。下面把它还原成三条可以沿着源码追踪的链路。文件名依据公开的 v2.1.88 源码级分析整理，适合用来定位职责，不应理解成当前版本的稳定 API。[研究方法与版本说明](https://arxiv.org/html/2604.14228)

### 链路一：用户输入如何进入 Agent Loop

这条链回答的是：用户输入之后，究竟在哪里调用模型，又在哪里决定继续下一轮。

这条链可以按下面的源码职责逐步追踪：

1. `QueryEngine.ts` 接收用户输入，建立本轮状态、Token 预算和取消信号。
2. `query.ts` 中的 `queryLoop()` 取出压缩边界之后的消息，应用 Context Shaper，构造 System Prompt。
3. `services/api/claude.ts` 以流式方式调用模型，并把响应中的文本块和 `tool_use` 块交给上层。
4. 如果没有 `tool_use`，本轮可以结束；如果有，就交给 `toolOrchestration.ts` 执行。
5. 工具结果被包装成 `tool_result` 消息，再回到 `queryLoop()`，进入下一轮。

源码级分析把 `QueryEngine.ts` 描述为外层编排器，把 `query.ts` 描述为真正的内层循环。前者管理一轮任务的状态、预算和取消信号，后者负责准备消息、调用 API、识别工具调用、收集结果，并决定继续还是退出。[Query Engine 结构](https://claude-code-explain.vercel.app/query-engine)

这条链最容易被误读的地方，是把“模型返回文本”当成一次请求的终点。对 Agent 来说，文本只是其中一种输出；如果响应里有 `tool_use`，真正的终点要等工具执行结果重新进入消息流之后才会到来。

### 链路二：工具如何从注册表变成一次受控执行

这条链回答的是：模型为什么能调用某个工具，以及工具调用为什么不会直接绕过权限系统。

![Claude Code 工具注册与授权源码链路](../assets/posts/claude-code-architecture/tool-pipeline.svg)

这里有一个很重要的设计：工具定义不只是“名称加一个函数”。公开的工具接口还包含输入 Schema、是否只读、是否可并行、是否具有破坏性、如何响应中断以及如何渲染进度等信息。这样，执行器、权限系统和终端 UI 可以共享同一份工具描述。[Tool Interface 与 Registry](https://claude-code-explain.vercel.app/tools/tool-interface)

工具池组装与单次授权判断是两个不同阶段：

- 工具池组装决定“模型能不能看见这个工具”；
- 授权判断决定“模型提出这次调用后，能不能真的执行”。

例如，一个被 deny 规则整体屏蔽的 MCP Server，可以在工具池组装阶段就不出现在模型上下文里；一个已经可见的 Bash 工具，仍然要在具体调用时经过参数、路径、规则和确认流程。前者减少无效调用，后者保护真实执行边界。

### 链路三：子 Agent 如何执行并把结果交回主 Agent

这条链回答的是：子 Agent 不是“多开一个聊天窗口”，它如何拥有独立上下文，又如何不把全部中间过程塞回主会话。

![Claude Code 子 Agent 委派与结果回流](../assets/posts/claude-code-architecture/agent-delegation.svg)

`BaseAgentDefinition` 是理解这条链的关键：它把 Agent 的身份、可用工具、提示词、模型、最大轮数、权限模式、记忆范围和隔离方式放在同一个定义里。内置 Agent、用户在 `.claude/agents/` 中定义的 Agent，以及插件提供的 Agent，最终都要被转换成这种可执行配置。[Agent 定义与隔离](https://claude-code-explain.vercel.app/agents/agent-types)

子 Agent 的价值不只是并行。它把“工作过程”和“主 Agent 的决策上下文”分开：探索 Agent 可以读取大量文件，但主 Agent 最终只接收结论；需要修改代码的 Agent 可以进入独立 worktree，避免直接污染主工作区；需要验证的 Agent 可以只拥有读取和测试权限。

这条链还解释了 Context、Session 和 Agent 的关系：Context 是某个 Agent 当前这一轮看到的内容，Session 是整个过程的可恢复记录，Agent 是拥有自己 Context 和权限边界的执行单元。三者混在一起，系统就无法做到既能并行，又能恢复，还能控制信息量。

## 六、最小可复现的 Agent Loop

把外围系统暂时拿掉，核心循环大致可以写成下面这样：

```python
messages = [system_prompt, user_message]

while True:
    response = model(messages, tools=visible_tools)
    messages.append(response)

    if response.stop_reason == "end_turn":
        break

    for call in response.tool_calls:
        validate_schema(call)
        check_permission(call)
        result = execute_tool(call)
        messages.append(tool_result(call.id, result))
```

这段代码很短，但生产系统必须在它周围补上大量机制：流式输出、并行工具调用、超时和取消、重试、错误归因、工具结果截断、上下文压缩、会话持久化、权限确认、Hook、子任务和观测日志。

因此，阅读 Claude Code 源码时最值得问的不是“它有没有一个神秘算法”，而是：

> 一个简单的 Agent Loop，怎样被包装成一个可以长期运行、可以被用户打断、可以访问真实代码库、又不会默认拥有无限权限的产品？

## 七、版本与研究边界

本文分析的源码基线是 2026 年 3 月 31 日公开的 Claude Code v2.1.88 TypeScript 源码材料，并使用 Anthropic 当前公开文档核对用户可见行为。Claude Code 更新频繁，文件名、工具数量、Feature Flag、权限模式和子 Agent 类型都可能继续变化。

因此，文中的文件路径适合用来理解 v2.1.88 的职责分布，不应被视为最新版的稳定接口；外部源码分析站点提供的是研究者整理的架构视图，也不是 Anthropic 的官方设计文档。更稳定、也更值得复用的是它解决问题的方式：反应式 Agent Loop、统一工具接口、执行前授权、分层上下文压缩、隔离式委派和近似 append-only 的会话记录。

本文主要依据以下三类材料：

- [源码级架构研究](https://arxiv.org/html/2604.14228)：v2.1.88 的调用链、权限、压缩、扩展和持久化分析；
- [Anthropic 官方安全文档](https://code.claude.com/docs/en/security)：当前公开的权限边界和安全行为；
- [Claude Code Source Architecture](https://claude-code-explain.vercel.app/)：源码文件与架构职责的辅助索引。

## 八、结论：模型负责决策，Runtime 负责落地

Claude Code 最值得学习的不是某个单独模块，而是模块之间的边界：

- 模型只负责提出下一步决策；
- Query Runtime 负责循环和状态转换；
- Tool System 负责把能力结构化；
- Permission Control Plane 负责把能力限制在边界内；
- Context Manager 负责控制模型每一轮看到什么；
- Task / Agent Runtime 负责拆分复杂工作；
- Session Storage 负责让过程可追踪、可恢复。

如果只记住一条主线，可以记住：目标先进入上下文，模型据此提出动作，动作经过权限治理后执行，环境产生反馈，反馈再更新上下文并触发下一轮决策。

Claude Code 的“聪明”最终要通过这条链落地。模型决定往哪里走，Runtime 决定能走哪些路，工具执行产生真实反馈，权限系统决定哪些动作必须停下来问人，而上下文系统决定下一轮模型还能记住什么。

这也是源码分析最值得带走的通用经验：Agent 产品的核心竞争力，往往不在一个更长的 Prompt，而在围绕模型建立了一套更完整的执行系统。
