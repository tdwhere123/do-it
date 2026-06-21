---
description: 在编码前用产品视角 + 架构视角双核心澄清需求形态与选项，沿决策阶梯发散，并把需要收敛的事项交给 do-it-grill。
---

# /do-it-brainstorm

对当前任务先做 divergent brainstorm，搞清楚需求到底是什么、可能长什么样、有哪些选项，再把需要收敛的事项交给 `do-it-grill`。每一遍都由两个核心视角支撑：

- **产品视角**（`product-strategist`）：产品边界、核心目标、需求形态、多个选项及其好处 / 坏处 / 风险。
- **架构视角**（`architecture-strategist`）：核心底层、扩展模块、阶段闭环、边界、验证路线。

两个视角固定存在，但**默认由主线程内联推演**；只有 Heavy 或你显式要求时，才真正扇出成独立只读子智能体。按任务再动态补充 `ux-designer`、`end-user-advocate`、`ops-sre`、`ceo-reviewer`、`red-team-reviewer`、`domain-language-reviewer` 或 `plan-challenger`（零到两个，只在能改变实现路线时加）。

## 调用方式

- `/do-it-brainstorm` — 默认双视角内联；由 router / 当前任务决定是否补充视角与是否扇出。
- `/do-it-brainstorm product,architecture,ops` — 显式指定 lenses（逗号分隔）。
- `/do-it-brainstorm lenses=ux,end-user,red-team` — 在双视角之外补充指定视角。
- `/do-it-brainstorm discuss` — 只做内联讨论，不写 artifact（这是默认形态）。
- `/do-it-brainstorm all` — 扇出双视角 + 所有适用补充视角为独立子智能体；只在 Heavy 或明确要求时用。

## 行为

1. 加载 `do-it-brainstorm` skill。
2. 先定「哪个问题主导」（产品形态 / 架构地基 / 某个补充关切），把力气投在那里。
3. 确认 task frame 和当前 repo 真相；上下文空白或没有真正待决项时，直说并交给 planning，不硬造选项。
4. 沿决策阶梯（跳过 → stdlib/原生 → 已装依赖 → 最小自建 → 完整自建）铺开选项，偏向减法与无聊的方案。
5. 输出 `Requirement Shape` / `Product Boundary` / `Core Goal` / `Options` / `Architecture Foundation` / `Extension Modules` / `Must Resolve In Grill` 分层；默认内联，下一 session 需复用或 Heavy 时才写 `.do-it/brainstorm/<task>.md`。
6. **不**在 brainstorm 内做最终收敛；需要收敛时交给 `/do-it-grill`。

## 跳过条件

- 任务是机械重构、单文件改名、依赖升级、纯内部基础设施。
- 当前 task slug 已存在 `.do-it/brainstorm/<task>.md` 且提案未实质变更。
- 拷问后发现没有真正的开放决策 —— 直接交给 planning。

## 与 grill 的衔接

完成 brainstorm 后，`do-it-grill` 会读取 `status: open` 的 brainstorm 文件，优先处理 `Must Resolve In Grill`。brainstorm 负责把需求形态和选项讲清楚，grill 负责收敛。
