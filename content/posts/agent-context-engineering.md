---
title: Agent 上下文工程：在信息过载中构造最小充分上下文
slug: agent-context-engineering
publishedAt: "2026-04-07"
date: "2026.04.07"
category: AI 应用
excerpt: Agent 的问题往往不是不知道，而是一次看到了太多信息。本文从一个线上 Bug 修复案例出发，梳理上下文的生命周期，并用 Python 实现一个最小可用的 Context Manager。
readTime: 15 分钟
---

线上某个 API 在发布后开始偶发 500。

一个编程 Agent 可以访问日志、Trace、指标、Git 仓库、发布记录、配置和历史 Incident。乍看之下，信息越全，定位问题应该越快。但如果把这些内容不加筛选地全部塞进上下文，结果通常恰恰相反：模型注意力被无关信息稀释，旧日志和新日志混在一起，Agent 还可能把一条未经验证的猜测当成事实继续推理。

这揭示了 Agent 工程里一个经常被低估的问题：

> Agent 不一定缺少上下文，很多时候是上下文太多。

因此，Agent 的上下文工程不只是“把 Prompt 写得更好”，而是要在每一次模型调用前，动态构造一份足够完成当前步骤、同时又不会制造额外噪声的上下文。

本文不讨论模型训练、微调或具体的 Agent 编排模式，只讨论 Agent Runtime 中的信息如何产生、选择、组织、更新、压缩和淘汰。全文以“发布后某个 API 偶发 500”的编程 Agent 为例，并实现一个最小的 Context Manager。

## 一、Context Engineering 到底在解决什么问题

### 1. Prompt Engineering 和 Context Engineering

Prompt Engineering 关注的是：

- 如何描述任务；
- 如何写角色和行为约束；
- 如何要求模型输出指定格式；
- 如何通过示例帮助模型理解要求。

Context Engineering 关注的则是另一个问题：

- 这一轮模型应该看到哪些信息；
- 这些信息来自哪里，什么时候产生；
- 哪些信息与当前步骤相关；
- 哪些信息已经过时或被新证据替代；
- 哪些信息需要压缩，哪些信息必须保留原文。

以线上 Bug 为例，Agent 可能先看到一条用户报告，随后查询到一批错误日志，又通过 Trace 找到调用链，最后读到最近一次发布的代码变更。真正重要的不是把所有结果都永久追加到消息列表，而是让每一轮模型调用都拥有当前排查步骤所需要的那部分信息。

可以把上下文工程定义为：

> 根据 Agent 当前的任务状态，在每一轮决策前组织出完成当前步骤所需的信息，并控制无关、过时或冲突的信息进入模型。

### 2. Context、State 和 Memory

这三个概念经常被混用，但它们在工程上承担不同职责。

| 概念    | 含义                             | 例子                                       |
| ------- | -------------------------------- | ------------------------------------------ |
| Context | 当前这一轮真正传给模型的信息     | 当前错误堆栈、相关代码片段、最近一次 Trace |
| State   | Agent 在外部保存的结构化任务状态 | 当前处于“验证”阶段，已经验证了假设 A       |
| Memory  | 跨轮次或跨任务保存的信息         | 服务依赖关系、历史 Incident、团队约定      |

Memory 只有被检索并注入当前请求后，才会成为 Context；State 也不是模型自动可见的，必须先被格式化并放进 Context。换句话说：

> Context 是模型当前能看到的内容，State 和 Memory 是构造 Context 时可以使用的外部材料。

这个区分很重要。如果把所有东西都叫作 Context，就很难回答两个问题：一条信息究竟应该保存多久，以及它什么时候应该再次进入模型的视野。

## 二、核心原则：最小充分上下文

上下文工程最容易犯的错误，是把“完整”误认为“有效”。

把整个代码库、所有历史日志、完整对话记录和所有工具输出一起放进去，看起来没有遗漏信息，但模型需要在大量无关内容里寻找关键线索。上下文越长，成本越高，噪声越多，过时信息造成的干扰也越明显。

更实用的目标是：

> 每一轮只提供完成当前步骤所必需、足够新鲜、来源可追踪的信息。

这可以称为“最小充分上下文”。它不是简单地追求最短，而是在信息完整性和认知噪声之间做取舍。

例如，排查 API 500 时，不同阶段需要的信息不同：

| 排查阶段 | 当前问题           | 优先上下文                                  |
| -------- | ------------------ | ------------------------------------------- |
| 分诊     | 影响范围是什么     | 告警、用户报告、时间窗口、错误比例          |
| 定位     | 请求经过了哪些组件 | Trace、调用链、服务拓扑、错误堆栈           |
| 假设     | 最可能的原因是什么 | 相关代码、最近提交、配置差异、历史 Incident |
| 验证     | 这个猜测是否成立   | 查询结果、实验输出、测试结果、对照样本      |
| 修复     | 应该改哪里         | 相关代码、接口约束、测试、发布规范          |
| 回归     | 问题是否真的消失   | 新日志、指标、回归测试和部署结果            |

如果在“分诊”阶段就把完整代码库和所有历史 Incident 送给模型，信息并没有变得更充分，反而会让当前问题被埋在噪声中。

## 三、从信息产生到信息淘汰：上下文生命周期

一个可维护的 Context Manager，至少要处理下面七个阶段：

```text
信息产生
   ↓
标准化与标注
   ↓
保存到 State / Memory
   ↓
根据任务阶段检索候选信息
   ↓
在 Token 预算内组装 Context
   ↓
模型决策与工具执行
   ↓
更新、压缩或淘汰旧信息
   ↺
```

### 1. 信息产生

信息可能来自用户，也可能来自 Agent 的工具调用：

- 用户报告：“订单接口偶发 500”；
- 监控查询：过去十分钟错误率从 0.1% 上升到 3%；
- 日志搜索：发现 `NullPointerException`；
- Trace 查询：定位到订单服务调用库存服务的链路；
- Git 查询：发现最近发布修改了库存超时处理逻辑。

这些结果的性质不同。用户报告可能是主观描述，日志是系统事实，Agent 的“可能是库存服务超时”则只是一个待验证假设。它们不能被同等对待。

### 2. 标准化与标注

工具返回结果后，不要只把一段字符串追加到对话历史，而应该转换成结构化的信息单元，并记录来源、时间、可信度和适用阶段。

最小的信息单元可以包含：

```text
ContextItem
├── content       内容
├── kind          类型：日志、代码、假设、计划、约束……
├── source        来源
├── created_at    产生时间
├── stages        适用的任务阶段
├── trust         可信度
├── tokens        预计占用的 Token
├── status        active / verified / stale / archived
└── provenance    能否追溯到原始记录
```

结构化的好处是，后续可以根据任务阶段、可信度和 Token 预算做选择，而不是只能对一整段历史文本进行粗粒度截断。

### 3. 保存到 State 或 Memory

并不是每个工具结果都应该直接保存在当前 Context 里。

- 当前阶段和待验证问题属于 State；
- 原始日志和完整 Trace 可以放在外部存储，需要时再检索；
- 已确认的根因可以保存为高可信度的 State；
- 与当前任务无关的历史信息可以保留在 Memory，但不必继续注入当前上下文。

一个常见的错误是把“保存过”误认为“模型一直看得到”。实际上，外部存储只是信息的仓库，Context Manager 仍然要在每一轮决定拿出什么。

### 4. 根据任务阶段检索候选信息

当前阶段决定了检索问题。

在“定位”阶段，查询条件应该偏向服务名、接口名、Trace ID 和调用链；在“验证”阶段，查询条件则应该围绕当前假设寻找支持或反驳证据。

这比每一轮都使用同一个用户问题做向量检索更可靠。因为 Agent 的问题已经随着调查过程发生变化：它不再只是回答“为什么 API 500”，而是在回答“库存服务的超时是否足以解释这批 500”。

### 5. 组装当前 Context

组装时通常需要同时考虑四类信息：

1. **固定约束**：任务目标、安全规则、输出格式和权限边界；
2. **当前状态**：任务阶段、已完成动作、待解决问题；
3. **相关证据**：日志、代码、Trace、指标和实验结果；
4. **行动接口**：当前允许使用的工具及其参数约束。

其中固定约束和关键状态通常应该优先保留。动态证据则根据当前阶段和 Token 预算进行筛选。

### 6. 决策与工具执行

模型看到 Context 后，可能提出一个假设、调用工具、修改文件或请求人工确认。工具执行结果不应该直接覆盖旧信息，而应该作为新的 ContextItem 加入系统。

这样可以保留完整的证据链：

```text
假设：库存服务超时导致订单 API 失败
  ↓
查询：最近 10 分钟库存服务 P99 延迟
  ↓
结果：P99 没有变化，假设被削弱
  ↓
下一步：检查本次发布的连接池配置
```

如果只保留最后一段文本，Agent 可能知道“下一步查配置”，却不知道为什么放弃了库存超时这个方向，调试时也无法解释决策过程。

### 7. 更新、压缩和淘汰

上下文管理的最后一步不是简单清空旧消息，而是根据价值做分层处理：

- 关键约束和已确认事实：长期保留；
- 当前假设和开放问题：保留到验证完成；
- 大段日志和 Trace：保存原文，只在 Context 中保留摘要和引用；
- 已经证伪的假设：保留结论，压缩过程；
- 与当前阶段无关的内容：移出当前 Context；
- 过时且不可复用的信息：标记为 stale 或淘汰。

压缩的目标不是让历史消失，而是把“可供模型使用的内容”和“可供系统追溯的原始记录”分开。

## 四、用 Context Item 统一表示上下文

下面是一个不依赖具体模型 SDK 的最小数据结构。它的作用不是替代数据库，而是为上下文选择提供统一接口。

```python
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum


class Stage(StrEnum):
    TRIAGE = "triage"
    LOCATE = "locate"
    HYPOTHESIZE = "hypothesize"
    VERIFY = "verify"
    FIX = "fix"
    REGRESSION = "regression"


@dataclass
class ContextItem:
    content: str
    kind: str
    source: str
    stages: set[Stage] = field(default_factory=set)
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    trust: float = 0.5
    relevance: float = 0.0
    pinned: bool = False
    status: str = "active"
    provenance: str | None = None

    @property
    def estimated_tokens(self) -> int:
        # 这里只是粗略估算，生产环境应替换为实际 tokenizer。
        return max(1, len(self.content) // 4)
```

这里有几个值得注意的设计点：

- `kind` 让系统区分事实、假设、计划和工具结果；
- `stages` 让同一条信息只在适用阶段出现；
- `trust` 防止未经验证的推断与原始日志拥有相同优先级；
- `pinned` 用于保护任务目标、权限规则等不可丢失的信息；
- `provenance` 让模型输出可以追溯到原始日志、代码或查询结果；
- `status` 支持过时、归档和已验证等生命周期状态。

## 五、让任务阶段驱动上下文选择

Context Manager 不应该只问“哪些内容和用户问题最相似”，还应该问“当前 Agent 正在完成哪一步”。

可以先定义每个阶段最关心的信息类型：

```python
STAGE_KINDS: dict[Stage, set[str]] = {
    Stage.TRIAGE: {"user_report", "alert", "metric"},
    Stage.LOCATE: {"trace", "stacktrace", "service_map", "code"},
    Stage.HYPOTHESIZE: {"code", "deploy", "incident", "evidence"},
    Stage.VERIFY: {"query_result", "experiment", "test", "hypothesis"},
    Stage.FIX: {"code", "constraint", "test", "root_cause"},
    Stage.REGRESSION: {"metric", "test", "deploy_result", "log"},
}
```

阶段不是静态的标签，而是 State 的一部分。Agent 在执行动作后，应该根据结果更新阶段。例如：

- 日志确认错误集中在库存服务，进入 `LOCATE`；
- 找到可疑提交，进入 `HYPOTHESIZE`；
- 查询结果支持该假设，进入 `VERIFY`；
- 修复通过测试，进入 `REGRESSION`。

如果没有明确的阶段，Context Manager 往往只能依赖模糊的相似度排序；有了阶段，系统才有机会把“当前最有用”编码成明确的工程规则。

## 六、一个最小可用的 Context Manager

下面的实现完成四件事：保存 Context Item、切换阶段、筛选候选信息，以及在 Token 预算内组装上下文。

```python
from collections.abc import Iterable


class ContextManager:
    def __init__(self, token_budget: int = 4_000) -> None:
        self.token_budget = token_budget
        self.stage = Stage.TRIAGE
        self.items: list[ContextItem] = []

    def add(self, item: ContextItem) -> None:
        self.items.append(item)

    def add_many(self, items: Iterable[ContextItem]) -> None:
        self.items.extend(items)

    def set_stage(self, stage: Stage) -> None:
        self.stage = stage

    def _score(self, item: ContextItem) -> float:
        stage_match = 1.0 if self.stage in item.stages else 0.0
        kind_match = 1.0 if item.kind in STAGE_KINDS[self.stage] else 0.0

        # 这里只是示意性的评分函数，真实系统可以加入检索分数、
        # 新鲜度、依赖关系和任务特定的规则。
        return (
            5.0 * kind_match
            + 4.0 * stage_match
            + 3.0 * item.relevance
            + 2.0 * item.trust
        )

    def build(self) -> list[ContextItem]:
        active = [
            item
            for item in self.items
            if item.status in {"active", "verified"}
        ]

        pinned = [item for item in active if item.pinned]
        candidates = [item for item in active if not item.pinned]
        candidates.sort(key=self._score, reverse=True)

        selected: list[ContextItem] = []
        used_tokens = 0

        # 关键目标和安全约束优先进入上下文。
        for item in pinned:
            if used_tokens + item.estimated_tokens <= self.token_budget:
                selected.append(item)
                used_tokens += item.estimated_tokens

        for item in candidates:
            if used_tokens + item.estimated_tokens > self.token_budget:
                continue
            selected.append(item)
            used_tokens += item.estimated_tokens

        return selected
```

这个实现还很简单，但已经体现了几个重要原则：

1. 上下文由结构化信息单元组成，而不是一条永远增长的字符串；
2. 固定约束和关键目标有更高优先级；
3. 当前阶段会影响信息类型的选择；
4. Token 预算是硬约束，不允许上下文无限膨胀；
5. 原始记录和当前 Context 可以分开保存。

生产环境通常还需要接入实际 Tokenizer、向量检索、关键词过滤、权限检查、去重、摘要服务和持久化存储。但这些能力都可以建立在同一个抽象之上：先管理 Context Item，再决定如何检索和排序。

## 七、上下文压缩不是简单截断

当上下文超过预算时，最危险的实现是直接保留最后 N 条消息。因为最后出现的内容不一定最重要，最早的任务目标和安全约束反而可能被截掉。

更可靠的压缩策略应该按内容类型处理。

### 1. 日志和 Trace

日志通常数量最多，也最容易产生重复信息。可以保留：

- 错误类型和代表性堆栈；
- 首次出现和最近一次出现的时间；
- 受影响的请求数量；
- 一个或多个原始记录的引用；
- 与当前假设直接相关的字段。

重复的成功日志、无关请求和完整原始堆栈不需要每一轮都进入模型，但原文应该保留在日志系统里，供后续追溯。

### 2. 代码

代码不应该按文件大小机械截断。更合理的方式是：

- 先定位到相关函数和调用链；
- 保留接口定义、关键分支和依赖配置；
- 对未修改的巨大模块只保留结构摘要；
- 给出文件路径和行号，必要时再按需展开。

“摘要 + 可回查引用”通常比“把整个文件放进上下文”更适合长任务。

### 3. 计划和历史对话

计划需要保留当前未完成的步骤、已经验证的结论和下一步动作，而不是保留每一次措辞变化。历史对话也可以压缩为：

```text
目标：解释发布后订单 API 的偶发 500
已确认：错误集中在 14:05-14:12，库存服务延迟正常
已排除：库存服务超时不是主要原因
待验证：本次发布是否改变了连接池配置
下一步：对比发布前后的配置并在测试环境复现
```

这类摘要必须明确区分“已确认”“已排除”和“待验证”，否则压缩会把推测伪装成事实。

### 4. 旧假设

假设被证伪后，不一定要完全删除。可以只保留结论和证据引用：

```text
假设：库存服务 P99 延迟导致订单 API 500
结论：暂不支持
证据：故障时间窗口内库存服务 P99 无明显变化
原始查询：query://incident-2026-08-04-001
```

这样既不会让模型反复走回头路，又保留了调试所需的证据链。

## 八、上下文的可信度与来源

上下文工程不仅是“相关性排序”，还要处理信息的可信度。

对于线上 Bug，建议至少区分以下几种信息：

| 信息类型   | 例子                       | 默认可信度                 |
| ---------- | -------------------------- | -------------------------- |
| 系统事实   | 日志、指标、Trace 原始字段 | 高，但要关注时间和采样范围 |
| 代码事实   | 当前分支中的代码和配置     | 高，但要确认版本           |
| 用户描述   | “刚才一直报错”             | 中，需要和监控交叉验证     |
| Agent 推断 | “可能是连接池耗尽”         | 低，必须标记为假设         |
| 压缩摘要   | 历史调查的总结             | 取决于原始证据是否可追溯   |

尤其要避免把模型自己的上一轮输出当成事实。模型说“根因是连接池耗尽”，这只是一个 Context Item，除非有日志、指标或实验支持，否则不应该被下一轮当作已确认结论。

另外，日志、代码和用户输入都可能包含提示注入或恶意内容。Context Manager 应该为外部内容标注不可信边界，并在系统指令中告诉模型：外部材料是待分析的数据，不是可以覆盖系统规则的指令。

## 九、如何评估上下文工程是否有效

上下文优化不能只看“Token 降低了多少”。如果删掉关键线索，Token 变少了，但 Agent 的任务成功率也会下降。

一个更合理的目标是：

> 在不降低任务成功率的前提下，用更少、更相关、更可信的上下文完成任务。

可以从以下指标开始：

### 1. 任务成功率

线上 Bug 是否正确定位，修复是否通过测试，是否在回归后不再出现。它是最重要的指标。

### 2. Token 成本

记录每一轮输入 Token、输出 Token 和压缩次数，观察 Context Manager 是否减少了无效输入。

### 3. 调查效率

包括工具调用次数、重复查询次数、无效假设数量、从告警到提出有效根因所需的轮数。

### 4. 信息质量

检查当前上下文中是否包含：

- 当前阶段所需的关键证据；
- 已过时或已证伪的信息；
- 无来源的推断；
- 与当前任务无关的大段内容。

### 5. 可追溯性

对于 Agent 的关键结论，能否回溯到日志、代码、查询结果或实验记录。没有来源的正确答案，在生产排障场景里仍然不够可靠。

实际评估时，可以做一个简单的对照实验：

1. 使用完整历史对话作为 Context；
2. 使用固定窗口截断历史；
3. 使用阶段驱动的 Context Manager；
4. 在三种方案下运行同一批线上 Bug 任务。

比较任务成功率、平均 Token、工具调用次数和错误假设数量，才能知道上下文优化究竟是在减少噪声，还是只是在丢失信息。

## 十、几个容易踩到的坑

### 把所有信息都放进系统 Prompt

系统 Prompt 适合放稳定的规则、角色和安全约束，不适合承载不断变化的日志、计划和工具结果。动态信息应该作为独立 Context Item 管理。

### 只按相似度检索

相似度不能代表时效性、可信度和阶段适配性。一条与问题文字很相似、但发生在半年前的日志，可能不如一条字面相似度较低、刚刚产生的 Trace 有价值。

### 用最后 N 条消息代替上下文管理

这会同时丢掉早期目标、关键约束和重要结论，而且无法区分已经证伪的假设与仍然有效的事实。

### 把摘要当作原始事实

摘要应该记录自己的来源和压缩时间。对线上事故这类高风险任务，关键结论最好保留原始查询、日志或提交的引用。

### 让 Agent 自己决定什么都保留

模型可以参与判断相关性，但 Token 预算、权限、隐私和安全边界应该由系统控制。上下文工程不是把所有存储决策都交给模型，而是让模型在明确边界内使用信息。

## 结语：上下文是 Agent 的运行时操作系统

Agent 的上下文不是一段静态 Prompt，而是一条持续变化的信息流：

```text
用户目标
  ↓
任务状态
  ↓
工具结果与外部证据
  ↓
筛选、排序、压缩
  ↓
当前决策上下文
  ↓
新的行动与新的状态
```

如果把所有信息都放进模型，系统会被上下文噪声拖慢；如果过度压缩，又会丢掉完成任务所需的证据。上下文工程真正要解决的，是在两者之间建立一个可解释、可控制、可评估的选择过程。

对于编程 Agent，最值得坚持的原则可以归纳为四句话：

1. **Context、State 和 Memory 分开管理。**
2. **上下文选择要由任务阶段驱动。**
3. **优先提供最小充分上下文，而不是完整历史。**
4. **压缩可以减少模型负担，但不能切断证据来源。**

当 Agent 能在正确的时间看到正确的信息，它才真正拥有了稳定完成长任务的基础。

## 进一步阅读

- [Building effective agents，Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- [A practical guide to building agents，OpenAI](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [A Survey of Context Engineering for Large Language Models](https://arxiv.org/abs/2507.13334)
