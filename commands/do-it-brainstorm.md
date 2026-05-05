---
description: 在编码前用产品边界 + 架构地基双核心澄清需求形态，并按任务动态补充 UX、用户、Ops、安全、领域语言或计划视角。
---

# /do-it-brainstorm

对当前任务先做 divergent brainstorm，搞清楚需求到底是什么、可能长什么样，再把需要收敛的事项交给 `do-it-grill`。默认运行两个核心视角：

- `product-strategist`：产品边界、核心目标、需求形态、多个选项及其好处 / 坏处 / 风险。
- `architecture-strategist`：核心底层、扩展模块、阶段闭环、边界、验证路线。

根据任务再动态补充 `ux-designer`、`end-user-advocate`、`ops-sre`、`ceo-reviewer`、`red-team-reviewer`、`domain-language-reviewer` 或 `plan-challenger`。旧的四补充视角组合不再是默认固定流程。

## 调用方式

- `/do-it-brainstorm` — 默认双核心；由 router / 当前任务决定是否补充视角。
- `/do-it-brainstorm product,architecture,ops` — 显式指定 lenses（逗号分隔）。
- `/do-it-brainstorm lenses=ux,end-user,red-team` — 在双核心之外补充指定视角。
- `/do-it-brainstorm discuss` — 项目上下文还不足时先讨论问题空间，不强制写 artifact。
- `/do-it-brainstorm all` — 运行双核心 + 所有适用补充视角；只在 Heavy 或用户明确要求时使用。

## 行为

1. 加载 `do-it-brainstorm` skill。
2. 先确认 task frame 和当前 repo 真相；上下文空白时先讨论需求形态，不强制写 artifact。
3. 默认选择 `product-strategist` + `architecture-strategist`，再按任务风险选择补充视角。
4. 输出按 `Requirement Shape` / `Product Boundary` / `Core Goal` / `Options` / `Architecture Foundation` / `Extension Modules` / `Must Resolve In Grill` 分层。
5. 当结果需要后续 session 复用时，写入 `.do-it/brainstorm/<task>.md`。
6. **不**在 brainstorm 内做最终收敛；需要收敛时交给 `/do-it-grill`。

## 跳过条件

- 任务是机械重构、单文件改名、依赖升级、纯内部基础设施。
- 当前 task slug 已存在 `.do-it/brainstorm/<task>.md` 且提案未实质变更。

## 与 grill 的衔接

完成 brainstorm 后，`do-it-grill` 会读取 `status: open` 的 brainstorm 文件，优先处理 `Must Resolve In Grill`。brainstorm 负责把需求形态和选项讲清楚，grill 负责收敛。
