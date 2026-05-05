---
description: 在编码前对当前任务做四视角并行脑暴（CEO/UX/end-user/Ops），写入 .do-it/brainstorm/<task>.md，把开放决策交给 grill 收敛。
---

# /do-it-brainstorm

为当前任务派出 read-only persona 子代理（`ceo-reviewer` / `ux-designer` / `end-user-advocate` / `ops-sre`），每个跑 Sonnet、≤ 150 行返回，并行执行。结果合并到 `.do-it/brainstorm/<task>.md`，开放决策由后续 `do-it-grill` 在收敛模式中处理。

## 调用方式

- `/do-it-brainstorm` — 由 router tier 决定派出几个 persona（Standard：2-3；Heavy：4；Light：1）
- `/do-it-brainstorm ceo,ux` — 显式指定 persona 列表（逗号分隔）
- `/do-it-brainstorm all` — 强制四个全派（等价 Heavy 行为）

## 行为

1. 加载 `do-it-brainstorm` skill。
2. 按 tier 选 persona、并行 dispatch（同一 Agent 工具消息发多个调用）。
3. 把四个返回消息分别提炼到 `.do-it/brainstorm/<task>.md` 的对应段。
4. 把每个 persona 的 "one question" 收集到 "Open decisions for grill"。
5. **不**做收敛——交给 `/do-it-grill`。

## 跳过条件

- 任务是机械重构、单文件改名、依赖升级、纯内部基础设施。
- 当前 task slug 已存在 `.do-it/brainstorm/<task>.md` 且提案未实质变更——只追加 "Open decisions"。

## 与 grill 的衔接

完成 brainstorm 后，下次说 `grill` / `脑暴一下` / 显式触发 grill，grill 检测到 `status: open` 的 brainstorm 文件会自动进入收敛模式（见 `do-it-grill` 的 "Convergence after brainstorm" 段）。
