# do-it

[English](./README.md) | [中文](./README.zh-CN.md)

[![CI](https://github.com/tdwhere123/do-it/actions/workflows/ci.yml/badge.svg)](https://github.com/tdwhere123/do-it/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tdwhere123/do-it/actions/workflows/codeql.yml/badge.svg)](https://github.com/tdwhere123/do-it/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 不要再要求 AI agent 记住流程。把流程装进去。

`do-it` 把 AI 编程协作里的工程纪律变成 Codex 和 Claude Code 可安装的工作流：
按风险选择流程、用明确契约委派子智能体、没有新鲜验证证据不能宣布完成。

这是我自己每天真实使用的工作流，用在实际项目里。如果它适合你的习惯，可以直接
用；如果你觉得哪里不对，欢迎提 issue、发 PR，或者 fork 后改造成自己的 agent
工作流。

## 三件事

### 按风险路由

agent 动手之前，先把任务分成 `Light`、`Standard` 或 `Heavy`。

- `Light`：小范围本地修改、文档微调、一次性检查。
- `Standard`：普通的非平凡工程任务。
- `Heavy`：发布、架构调整、跨模块策略、公开工作流变化，或多 agent 交付。

重点不是增加仪式，而是让流程匹配风险：小事保持小，大事不能跳过计划、审查和证据。

### 用契约委派

子智能体只有在边界清楚时才真正有用。`do-it` 把委派当成契约问题，而不是调度问题。

每个被委派的 slice 都要锁定：

| 字段 | 锁定的内容 |
|---|---|
| `scope` | 子 agent 拥有的那一个边界明确的产出。 |
| `write ownership` | 子 agent 被允许编辑的路径。 |
| `forbidden paths` | 子 agent 即使能帮上忙也不许碰的路径。 |
| `must-verify facts` | 子 agent 动手之前必须确认的具体声明。 |
| `stop condition` | 触发子 agent 收尾的具体事件。 |
| `return schema` | 它最终回报的结构化形态。 |

不需要外部 orchestrator。父 agent 仍然负责，契约就是普通文本；任何支持 skill
和子 agent 的 host 都能用。

### 用证据收口

`do-it` 把“完成”当成一个需要证据支持的声明。只要改了文件，agent 就需要拿到
新鲜验证输出，才能说任务完成。

这样收口状态绑定的是仓库实际状态，而不是 agent 的自信。

## 从 GitHub 安装

从这个 GitHub 仓库全局安装 CLI，然后运行 setup：

```bash
npm install -g https://github.com/tdwhere123/do-it/archive/refs/heads/main.tar.gz
do-it setup
```

这里仍然使用 `npm` 作为终端安装器，但包会从 GitHub source tarball 下载，
不依赖 npm registry。

`do-it setup` 会先执行 `do-it install`，再执行 `do-it doctor`。

- `do-it install` 会把受管 skill 和 agent 复制到目标 host。
- `do-it doctor` 会检查已安装文件和安装状态是否与 `manifest.json` 一致。
- Codex 安装到 `CODEX_HOME`，默认是 `~/.codex`。

测试安装行为时，建议使用临时 Codex home：

```bash
CODEX_HOME=/tmp/do-it-codex-test do-it setup
```

安装器不会静默覆盖用户自己的 skill 或 agent 文件。如果目标文件没有被标记为
do-it 受管文件，安装会停止。只有在你明确要替换这些目标时，才设置
`DO_IT_FORCE=1`。

## Claude Code

`do-it` 也是 Claude Code 插件。通过插件 marketplace 安装：

```text
/plugin marketplace add tdwhere123/do-it
/plugin install do-it
```

或者在不使用 marketplace 时用 CLI target：

```bash
do-it install --target=claude
do-it doctor --target=claude
```

Claude target 默认装到 `~/.claude/`；用 `CLAUDE_PLUGIN_ROOT_OVERRIDE` 改根目录。
可选 skill（如 `do-it-visual-planning`）默认不装，加 `--with-optional` 才装。

## 它会安装什么

- do-it 原生 skill：路由、grill、**brainstorm（多视角发散）**、
  **handbook（项目文档骨架）**、context、planning、slicing、interface /
  architecture / domain drills、子智能体编排、TDD、调试、review、fix loop、
  verification、worktree 隔离、分支收口、视觉规划、skill 编写。
- 可移植的 Codex agent 定义：代码路径映射、计划挑战、正确性审查、架构审查、
  红队审查、规格合规、领域语言、安装/发布审查、文档、测试、语言专项，以及
  **brainstorm 视角**：必选的 `product-strategist` / `architecture-strategist`
  双核心，用来澄清产品边界、核心目标、架构地基和扩展形态；再加上按任务选择的
  产品、UX、终端用户、运维、安全、领域语言和计划补充视角。
- Claude Code 插件资产、hooks、commands 和生成后的子 agent 定义。Hook 包含
  新的 PostToolUse `code-map-refresh`：当 barrel / 迁移 / 路由 / workspace
  manifest 文件发生编辑时，给 `.do-it/handbook/code-map.md` 顶部打上 stale
  标记。
- 基于复制的安装器和 `doctor` 命令，用 `manifest.json` 校验受管 host 文件。
- 可从本地 checkout、打包产物、GitHub 仓库或 GitHub 终端安装使用的发布入口。

## 整体流程

```mermaid
flowchart TD
    P[UserPromptSubmit] --> R[do-it-router<br/>分类 Light / Standard / Heavy]
    R --> M{需要多视角<br/>脑暴吗}
    M -- 需要 --> BR[do-it-brainstorm<br/>产品 + 架构双核心<br/>按任务补充视角]
    M -- 不需要 --> G
    BR --> G{前提稳吗}
    G -- 不稳 --> GR[do-it-grill<br/>plan 前先核查；<br/>收敛 brainstorm 决策]
    G -- 稳 --> T{tier}
    GR --> T
    T -- Light --> L[直接执行]
    T -- Standard --> S[inline 修改地图 -> 执行<br/>有风险才 review]
    T -- Heavy --> H[plan -> slicing -> drills -><br/>子 agent 编排 -> review-loop -> fix-loop]
    L --> PG{Edit / Write?}
    S --> PG
    H --> PG
    PG -- Heavy 或显式 --> PGY[PreToolUse: 计划闸]
    PG -- 否则 --> V[Stop]
    PGY --> V
    V --> VG[verification-gate:<br/>必须有新鲜证据]
    VG --> D[完成]
```

实际运行时：

1. `do-it-router` 先给任务分类，并选择最小必要工作流。
2. 涉及产品、架构、工作流或发布相关的工作，`do-it-brainstorm` 在 grill 之前
   先澄清需求形态、产品边界、核心目标、架构地基、扩展模块和选项优劣，再按
   任务补充 UX、终端用户、运维、安全、领域语言或计划风险视角。
3. 当存在 brainstorm 产物时，`do-it-grill` 进入收敛模式：把
   `Must Resolve In Grill` 当成候选前提排序、逐项核验或留给用户决策，而不是
   重新发散。
   只有当前提需要先压力测试时，grill 才在 Light 之外触发。
4. `Light`、`Standard` 和 `Heavy` 是三套不同流程，不是同一流程的强弱档。
5. Heavy 或显式要求 durable plan 的工作，会在写入边界前检查计划是否存在。
6. Stop gate 会在 agent 宣布完成前检查新鲜证据。

完整策略见 [`docs/routing-matrix.md`](./docs/routing-matrix.md)。

## 不需要你记住的事

- 没有要背的斜杠命令。Hook 在合适的 host lifecycle 事件上自动触发 skill。
- 没有外部 orchestration runtime。子 agent 的控制就在
  `do-it-subagent-orchestration` 这个 skill 里。
- 一次性跳过：在 prompt 里写 `yolo` / `直接做` / `skip grill` /
  `/do-it-skip` 即可关掉这一轮 hook。

## 其它安装方式

如果要测试本地打包产物：

```bash
npm pack
npm install -g ./tdwhere-do-it-0.6.1.tgz
do-it setup
```

## 本地开发

在仓库 checkout 中，优先使用包入口：

```bash
npm exec --package . -- do-it setup
npm exec --package . -- do-it install
npm exec --package . -- do-it doctor
```

也可以使用等价的 package scripts：

```bash
npm run setup
npm run install:do-it
npm run doctor
npm run do-it -- doctor
```

保留的 shell wrapper 用于直接测试安装器，它们委托给同一套受管安装逻辑：

```bash
./install/install.sh
./install/doctor.sh
```

这个包不会通过 npm lifecycle scripts 自动修改 `~/.codex`。只有操作者显式
运行 `do-it setup` 或 `do-it install` 时，才会安装到 Codex。

修改 hook 之前提交 review 前，运行 `npm run lint`（通过 `scripts/lint-hooks.sh`
跑 shellcheck）。`npm test` 会跑 hook lint 加 `scripts/test-hooks.sh` 里的
hook 回归测试。CI 会在 push / PR 上跑 Node 矩阵、生成 agent 检查、Codex 和
Claude 安装 smoke test，以及 package dry run。

## 仓库结构

```text
agents/          可移植的 Codex 智能体 TOML 定义
bin/             全局 do-it CLI 入口
commands/        Claude Code command 入口
dist/claude/     生成后的 Claude Code agent 定义
docs/            路由、维护、来源映射和发布说明
hooks/           Host hook 脚本
install/         安装器、doctor 和 shell wrapper 入口
skills/custom/   默认不安装的本地 skill 示例
skills/do-it/    会被安装的 do-it 原生 skill 目录
manifest.json    安装清单和目标路径
package.json     npm 包元数据和 CLI scripts
```

私有 `.do-it/` 目录用于本地计划、笔记和临时材料。它被 Git 忽略，也不会被安装。

## 升级到 0.6.1

`do-it 0.6.1` 保留 0.6 的工作流升级，同时修复 Codex / Claude agent schema
拆分问题。Codex agent TOML 不再携带 Claude 专用 model 字段；Claude 生成器仍
会给需要的 brainstorm 视角和 `code-mapper` 生成 `model: sonnet`。

**grill 之前先 brainstorm。** `do-it-brainstorm` 现在默认是双核心：
`product-strategist` 负责产品边界、核心目标、需求形态和多个选项的好处 / 坏处 /
风险；`architecture-strategist` 负责核心底层、扩展模块、阶段闭环、边界和验证
路线。然后再按任务动态补充 `ux-designer`、`end-user-advocate`、`ops-sre`、
`ceo-reviewer`、`red-team-reviewer`、`domain-language-reviewer` 或
`plan-challenger`。输出按 `Requirement Shape`、`Product Boundary`、
`Core Goal`、`Options`、`Architecture Foundation`、`Extension Modules` 和
`Must Resolve In Grill` 分层，而不是固定四角色各问一个问题。

**grill 改成做收敛而不是重新发散。** 当 brainstorm 文件存在且 `status: open`
时，`do-it-grill` 会把 `Must Resolve In Grill` 拉成候选前提，逐项核验或留作
user decision，最后把 brainstorm 的 `status: open` 翻成 `converged`。
Light tier 仍然走原来的单线程 grill，除非用户显式要求 brainstorm。

**handbook 项目骨架一键初始化。** `/do-it-handbook`（或 `do-it-handbook`
skill）会在 `.do-it/handbook/` 下铺出 12 个通用化的模板——invariants、
architecture、code-map、glossary、backlog、runtime-status、maintenance、
task-card-template，再加三个 workflow 文件（agent-workflow、review-protocol、
subagent-dispatch）。模板都是占位骨架，bootstrap 是增量式，永远不会覆盖
已有文件。`code-map.md` 的「Current Implementation Locations」段由
`code-mapper` 子代理维护。

**code-map 持久化 + stale 跟踪。** 新的 `code-map-refresh` PostToolUse hook
在 barrel / 迁移 / 路由 / workspace manifest 文件被编辑时，给
`.do-it/handbook/code-map.md` 顶部打上 `<!-- stale: true; reason: ... -->`。
标记是幂等的——再次结构性编辑会**替换**，而不是堆叠。

0.5.x 老用户无需特殊操作：`do-it install` 会静默迁移。新增的
`.do-it/brainstorm/` 目录是叠加式的；没有 brainstorm 产物时，grill 行为
和之前完全一致。新的 code-map 刷新 hook 仅在
`.do-it/handbook/code-map.md` 已经存在时才触发。

调试钩子：`DO_IT_DEBUG=1` 让每个 hook 在 stderr 上输出一行决策跟踪
（escape / skip / question / tier / trigger / evidence）。用
`do-it doctor --session=<id>` 查看会话状态。

## 站在前人的肩膀上

`do-it` 借用了已经被两个高质量项目验证过的 **plan / subworker / TDD / review**
范式：

- [`obra/superpowers`](https://github.com/obra/superpowers)：skill + subworker
  协作模式。
- [`mattpocock/skills`](https://github.com/mattpocock/skills)：skill 的打包
  与发现机制。

`do-it` 是我自己对同一类问题的解法，来自这些项目给我的启发，也来自我每天在
真实项目里的使用。

也感谢 [Linux.do](https://linux.do) 社区。那里的讨论持续给我提供了很多实际的
agent 工作流反馈和想法。

## 维护说明

修改 skill、agent、安装器或包元数据时，参考 [docs/maintenance.md](./docs/maintenance.md)。
简要规则如下：

1. 修改仓库中的受维护副本。
2. 安装清单变化时同步更新 `manifest.json`。
3. 路由或收口策略变化时同步更新 `docs/routing-matrix.md`。
4. 用临时 `CODEX_HOME` 验证安装和 doctor。
5. 发布前确认打包产物包含预期文件。

常用发布检查：

```bash
git diff --check
npm test
npm run build:claude-agents
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it doctor
CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude
npm pack --dry-run --json
```

## 贡献

你可以直接使用 `do-it`，也可以提交聚焦改进，或者 fork 成自己的工作流。这里接受
改动的唯一硬要求是：它来自真实使用。

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)：两条硬规则（先 dogfood、先 Issue）、
例外清单（typo / 翻译 / 可复现 bug fix），以及 PR 模板。
