# DeepSeek Harness 最小 Agent Loop 替换实验

实验针对 DeepSeek Harness 提交 `47f943859bef60e4160492346772ded9b24f765a`（`0.1.0-rc.5`）。它不加载官方 `@deepseek-ai/dsh-agent-loop`，而是向 `ctx.agents` 注册一个单轮 `AgentFactory`，并通过确定性假模型验证一次模型请求和 Session Event 日志。

## 运行

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout 47f943859bef60e4160492346772ded9b24f765a
pnpm install
mkdir -p experiment
cp /path/to/minimal-loop.ts experiment/minimal-loop.ts
pnpm exec tsx experiment/minimal-loop.ts
```

预期输出保存在 `result.json`。

## 实验边界

这个实现只支持一个 follow-up、一次模型调用，不支持工具循环、恢复、并发 steering、完整取消收敛和生产级生命周期回滚。它验证的是替换缝隙和公共消费者的互操作性，不证明该最小实现与默认 Agent Loop 功能等价。
