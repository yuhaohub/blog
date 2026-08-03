---
title: 别再把 Skill 当成 Prompt：从零编写一个 Codex PR 审查 Skill
slug: codex-skills-pr-review
publishedAt: "2026-04-01"
date: "2026.04.01"
category: AI 探索
excerpt: 用一个 Gin 项目的 PR 审查案例，理解 Codex Skill 的工作方式，并从零写出、调用和迭代自己的 Skill。
readTime: 16 分钟
---

我们经常这样使用 Codex：打开一个项目，贴上一段要求，让它帮忙审查代码。

> 请检查这个 PR，重点关注权限、错误处理和测试，不要纠结格式问题；发现问题时说明影响，并给出文件和行号。

第一次效果不错。到了下一个 PR，我们又把这段话复制一遍。过几天要求变多了：先读 `AGENTS.md`，再查看路由和 Service；必须运行测试；输出要按严重程度排序；没有证据的问题不要报。

Prompt 越写越长，团队成员手里的版本还可能不同。真正的问题已经不是“怎样把这次问题问好”，而是：**怎样把一套有效的审查方法保存下来，让 Codex 在以后重复使用？**

这正是 Codex Skill 适合解决的问题。

本文不会做一个没有实际价值的 Hello World。我们会为一个 Go + Gin 项目编写 PR 审查 Skill，并用“新增取消订单接口”的改动验证它。读完后，你应该能理解 Skill 的工作方式，并独立完成一个 Skill 的设计、创建、调用和迭代。

## Skill 不是一段更长的 Prompt

先给出本文最重要的结论：

> Codex Skill 不是一段更长的 Prompt，而是把专业判断、操作步骤和输出标准封装成可重复调用的工作流。

根据 [Codex 官方文档](https://learn.chatgpt.com/docs/build-skills)，一个 Skill 是一个目录：其中必须有 `SKILL.md`，还可以按需加入脚本、参考资料和资源文件。ChatGPT 和 Codex 会先看到 Skill 的名称与描述；当任务匹配时，才读取完整说明。这种渐进式加载让我们能够保存详细流程，又不必把所有内容塞进每一次对话。

但 Skill 并不取代所有其他手段。更准确的理解是：它们处在不同层次。

![Prompt、AGENTS.md、Skill 与静态检查工具的分工](../assets/posts/codex-skills-pr-review/codex-skill-responsibilities.svg)

如果规则可以机械判断，例如格式、未使用变量、常见错误模式，应该优先交给 `gofmt`、`go vet` 或 `golangci-lint`。如果规则是整个仓库都要长期遵守的约定，例如构建命令、目录说明和提交前检查，则更适合写进 `AGENTS.md`。

Skill 的优势出现在另一类任务里：它需要读取上下文、执行一组步骤、运用判断，并以固定形式交付结果。PR 审查正是典型案例。审查者不能只看一行代码，还要理解路由是否受保护、当前用户如何传入、Service 是否验证资源归属、错误如何映射成 HTTP 状态码，以及测试是否覆盖失败路径。

## 从审查目标倒推 Skill

先别急着写 `SKILL.md`。一个好 Skill 至少要回答五个问题：

1. **什么时候使用？** 用户要求审查 PR、分支、提交或本地 diff 时使用。
2. **需要读取什么？** 改动、相关上下文、项目约定、路由、业务层和测试。
3. **按什么顺序工作？** 先确定改动范围，再追踪行为，最后运行验证。
4. **重点判断什么？** 业务正确性、权限边界、错误传播、兼容性和测试缺口。
5. **怎样输出？** 只报告可复现、可定位、值得作者修复的问题，并按严重程度排序。

这里最容易犯的错误，是把“请认真审查代码”当作流程。它只描述了愿望，没有告诉 Codex 什么叫认真，也没有给出完成标准。

本文的示例是一项 Gin 接口改动：

```go
func (h *OrderHandler) Cancel(c *gin.Context) {
	orderID := c.Param("id")

	if err := h.orders.Cancel(c.Request.Context(), orderID); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "cancel failed"})
		return
	}

	c.Status(http.StatusNoContent)
}
```

这段代码能编译，格式也没有问题，但它留下了几个需要语义判断的疑点：

- 接口没有把当前用户传给业务层，订单归属由谁验证？
- 取消失败时为什么仍返回 `200 OK`？上游能否分辨失败？
- 重复取消、订单不存在、数据库失败等路径有没有测试？

静态检查工具很难独立回答这些问题，因为答案散落在路由、中间件、Service 接口、Repository 和测试里。我们的 Skill 就要指导 Codex 主动寻找这些证据。

## 创建第一个仓库级 Skill

Codex 可以从多个位置发现本地 Skill。对于只服务于当前项目、并且希望随代码一起提交给团队的工作流，最合适的位置是仓库中的 `.agents/skills`。创建如下目录：

```text
.agents/
└── skills/
    └── go-pr-review/
        └── SKILL.md
```

如果一个 Skill 希望在个人的所有项目中使用，可以放在 `$HOME/.agents/skills`。官方文档也说明，Codex 会从当前工作目录向仓库根目录扫描各级 `.agents/skills`。本文使用仓库级目录，因为审查流程明显依赖本项目的结构和约定。

现在编写 `.agents/skills/go-pr-review/SKILL.md`：

```markdown
---
name: go-pr-review
description: Review Go and Gin pull requests for business correctness, authorization, error propagation, compatibility, and missing tests. Use when the user asks to review a PR, branch, commit, or diff in this repository. Do not use for formatting-only checks or general Go questions.
---

# Go PR review

Review the requested code change as a senior Go backend engineer.

## Goal

Find defects introduced by the change that are concrete, actionable, and
supported by repository evidence. Do not report style preferences.

## Workflow

1. Determine the review scope from the user's request. If it is ambiguous,
   inspect the working tree and recent diff before asking a question.
2. Read the applicable `AGENTS.md` files and repository documentation.
3. Inspect the complete diff, then read enough surrounding code to understand
   the old and new behavior.
4. Trace affected Gin routes through middleware, handlers, services,
   repositories, data models, and tests. Do not review files in isolation.
5. Run the smallest relevant tests first. Run `go test ./...` when practical.
6. Review the change for:
   - missing authentication, authorization, or resource-ownership checks;
   - swallowed errors, incorrect wrapping, or wrong HTTP status mapping;
   - broken API contracts, state transitions, concurrency, or transactions;
   - missing tests for important success and failure paths.
7. Verify every finding against the repository. If evidence is insufficient,
   investigate further or omit the finding.

## Output

List findings before any summary, ordered by severity:

- `[P0]` release-blocking or destructive;
- `[P1]` high-impact defect that should be fixed before merge;
- `[P2]` normal defect worth fixing;
- `[P3]` low-risk improvement.

For each finding:

1. use a short, imperative title;
2. cite the narrowest relevant file and line;
3. explain the runtime condition and concrete impact;
4. do not include praise, style-only feedback, or speculative concerns.

If there are no findings, say so and mention any tests you could not run.
Do not modify code unless the user explicitly asks for a fix.
```

这份文件没有使用复杂语法。顶部是 YAML frontmatter，正文是普通 Markdown。`name` 和 `description` 是必需字段，其中 `description` 尤其重要：Codex 会用它判断任务是否与 Skill 匹配，因此不能只写“Review code”，而应该明确使用场景、技术范围和不适用边界。

正文则尽量使用命令式步骤，并写明输入、过程与输出。官方最佳实践也建议让一个 Skill 聚焦一项工作，优先使用说明；只有需要确定性行为或外部工具时，再加入脚本。

## Codex 如何执行这个 Skill

Skill 写好后，Codex 通常会自动检测变更；如果桌面应用里没有出现，可以重启应用。在桌面应用的 Skills 区域找到 `go-pr-review`，把它加入新任务，然后输入：

> 审查当前分支相对 main 的改动，只报告会影响合并决定的问题。

一次完整执行大致经历下面的过程：

![PR 审查 Skill 从触发到输出 Findings 的执行流程](../assets/posts/codex-skills-pr-review/pr-review-skill-flow.svg)

对于前面的取消订单接口，理想的输出不是泛泛而谈“建议加强错误处理”，而应接近下面这样：

```text
[P1] 在取消订单前验证资源归属 — internal/http/order_handler.go:42

处理函数只把 URL 中的 orderID 传给 Service，没有传入认证用户。
如果 Service 也只按订单 ID 更新，任意已登录用户都可能取消其他用户的
订单。应在业务层使用 userID 与 orderID 联合查询或显式校验归属。

[P1] 不要把取消失败返回为 200 — internal/http/order_handler.go:44

Repository 返回错误时，接口仍然返回 200，调用方会把失败当成成功，
而且无法区分订单不存在、状态冲突和服务端故障。应保留错误语义并映射
为对应的 4xx 或 5xx 状态。

[P2] 覆盖取消订单的失败路径 — internal/http/order_handler_test.go:1

当前改动没有测试其他用户的订单、重复取消和 Repository 错误。
这些分支决定接口的权限和错误契约，缺少测试会让上述行为在后续修改中
再次退化。
```

注意，真实审查不能仅凭示例 Handler 就断言一定存在越权。Codex 必须继续查看认证中间件和 Service 实现：如果业务层已经验证归属，就应该删除第一条 Finding。**好的 Skill 不只是让模型多找问题，也要让它减少没有证据的误报。**

## 为什么不直接把规则写进 AGENTS.md

`AGENTS.md` 与 Skill 的确有重叠，但它们解决的问题不同。

`AGENTS.md` 更适合保存对仓库长期生效的事实和约束，例如：

- 项目使用 Gin，入口和模块分别在哪里；
- 修改业务代码后必须运行 `go test ./...`；
- 错误需要保留 cause，Handler 负责映射 HTTP 状态；
- 禁止直接编辑生成文件。

Skill 保存的是完成某类任务的操作方法，例如：

- 怎样确定一次 PR 审查的范围；
- 怎样从 Gin 路由追踪到 Repository；
- 按什么维度寻找回归；
- 什么证据足以形成 Finding；
- 最终使用什么格式交付。

简单说，`AGENTS.md` 回答“这个项目有什么规矩”，Skill 回答“遇到这类任务应该怎么办”。让 Skill 在执行时主动读取 `AGENTS.md`，两者就能组合起来，而不是互相替代。

## 第一次写不好，才是正常状态

Skill 不是写完就永久不动的系统 Prompt。更有效的方法是把它当成代码一样迭代。

### 1. Skill 没有自动触发

先检查 `description`。不要堆背景故事，要把主要用例和触发词放在前面，例如 `Review Go and Gin pull requests`，并明确 `PR`、`branch`、`commit` 和 `diff`。然后分别测试应该触发和不应该触发的请求。

### 2. 审查结果太泛

“检查安全性和错误处理”仍然太抽象。把它改成可执行动作，例如“沿 Gin 路由追踪中间件、Handler、Service 和 Repository”，以及“说明触发条件和运行时影响”。

### 3. 误报太多

加入证据门槛：必须阅读相关上下文；无法确认时继续调查或不报告；不要把风格偏好列为缺陷。这类负面边界往往比再加十项检查清单更有效。

### 4. 每次输出形式不同

固定严重程度、标题形式、文件定位和说明内容。需要更严格时，可以在 `references/` 中放一份优秀 Review 示例，让 Codex 对齐团队真实可接受的结果。

### 5. 确定性步骤不稳定

如果 Skill 总要执行复杂且固定的命令，可以再加入 `scripts/`。例如写一个脚本确定 merge base、收集 diff 和测试结果。说明负责决策，脚本负责确定性操作，两者不要混为一谈。

每次实际使用后，都问四个问题：它是否在正确的任务中触发？是否读取了足够上下文？是否漏掉或误报了问题？输出是否能直接帮助作者修改？答案会自然告诉你下一版该改什么。

## 什么时候值得写成 Skill

一个任务同时满足下面几项时，通常值得写成 Skill：

- 会重复出现，而不是一次性问题；
- 有相对稳定的步骤和完成标准；
- 需要读取资料、项目上下文或运行工具；
- 需要专业判断，不能完全交给静态规则；
- 输出有固定消费者，例如 PR 作者、值班工程师或发布负责人。

反过来，简单问答用 Prompt 就够了；整个仓库长期有效的约定写进 `AGENTS.md`；可机械判断的规则交给 linter、测试或 CI；需要连接外部系统和执行实时动作时，再考虑 MCP 或插件。

不要为了“用了 Agent”而写 Skill。Skill 的价值不在文件名，也不在 Prompt 的长度，而在于它能否把一次偶然成功的协作，变成下一次仍然可靠的工作方式。

## 结语

我们从一个容易复制粘贴的 PR 审查 Prompt 出发，最终得到了一套可以随仓库维护的工作流。它知道什么时候触发、需要读哪些上下文、按什么顺序检查、什么问题值得报告，以及怎样输出可执行的结论。

这也是理解 Codex Skill 最简单的方式：**它不是教 Codex 背下一段话，而是教 Codex 怎样完成一类工作。**

当你下一次发现自己又在复制同一段 Prompt 时，不妨停一下：其中是否已经包含一套稳定的方法？如果答案是肯定的，它可能就应该成为你的下一个 Skill。

延伸阅读：[Build skills（Codex 官方文档）](https://learn.chatgpt.com/docs/build-skills) · [Save workflows as skills（官方用例）](https://learn.chatgpt.com/use-cases/reusable-codex-skills)
