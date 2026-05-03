# do-it Workflow

[English](./README.md) | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@tdwhere/do-it.svg)](https://www.npmjs.com/package/@tdwhere/do-it)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`do-it` 是跨 host 的智能体软件交付工作流包。它把一套可执行的工程习惯打包起来：先判断任务类型，检查当前事实，再按风险决定规划深度；实现时保持切片边界，交付后审查和修复，最后只用刚刚验证过的证据说明完成状态。

0.4.0 起两个目标都是一等公民：

- **Codex**（`do-it install`，默认）：技能装到 `~/.codex/skills`，TOML 智能体装到 `~/.codex/agents`。
- **Claude Code**（`do-it install --target=claude`，或通过插件 marketplace）：技能装到 `~/.claude/skills`，Markdown 智能体装到 `~/.claude/agents`，钩子脚本让工作流在对话里自动触发，不需要任何斜杠命令。

两个目标共用同一份 `skills/do-it/*/SKILL.md` 和 `agents/*.toml`。

## 升级到 0.5.1

`do-it 0.5.1` 保留 0.5.0 的关键词收紧，同时把默认流程减重：Standard prompt 不再因为有 intent verb 就自动 grill；长输入必须同时满足长度和方案 / spec 类 hint 才触发 grill；问答 turn 不再留下 sticky skip state；Standard 源码编辑可以用 inline modification map，不再强制先写 `.do-it/plans/*`。

Heavy 工作仍然会自动触发 grill；涉及发布、策略、迁移、广接口或架构风险时仍然使用 durable plan。Review 改为按风险预算：Light / docs-only 本地审查；Standard 最多加 1 个聚焦 reviewer；Heavy release / workflow 默认只需要两条关键线：skill/policy quality 和 install/release readiness。

0.4.x 老用户无需特殊操作 —— `do-it install` 会检测旧 state、备份到 `.pre-migrate.json`、再静默迁移。详见 [`install/migrations/0.4-to-0.5.md`](./install/migrations/0.4-to-0.5.md)。如果想拒绝迁移，用 `do-it install --no-migrate`（会以退出码 2 失败）。

调试钩子：`DO_IT_DEBUG=1` 让每个 hook 在 stderr 上输出一行决策跟踪（escape / skip / question / tier / trigger / evidence）。用 `do-it doctor --session=<id>` 查看会话状态。

## 这个包提供什么

- `Light`、`Standard`、`Heavy` 三层任务路由模型。
- do-it 原生技能：规划、切片、前提压力测试、实现、TDD、调试、审查、修复循环、验证门、worktree 隔离、分支收口、视觉规划和技能编写。
- 可移植的 Codex 智能体定义：代码路径映射、计划挑战、正确性审查、架构审查、红队审查、规格合规、领域语言检查、安装/发布审查、文档、测试和专项技术审查。
- 基于复制的安装器和 doctor 命令，用 `manifest.json` 校验 Codex home 中的受管文件。
- 可从本地 checkout、打包产物、GitHub 仓库或 npm registry 使用的发布入口。

## 路由模型

`do-it` 不要求所有任务都走同一套流程，而是按风险选择强度：

1. `Light`：小型文档修改、机械修复、窄范围命令检查。通常本地完成，用针对性验证收口。
2. `Standard`：普通功能、Bug 修复、重构和范围明确的策略更新。需要先做修改地图，再实现、验证，并在有风险时进行审查。
3. `Heavy`：wave、phase、公共接口、架构变更、发布任务或高风险改动。父智能体负责计划、切片边界、审查栈、修复循环、复审和收口证据。

完整策略见 [docs/routing-matrix.md](./docs/routing-matrix.md)。

## 从 npm 安装

全局安装 CLI，然后运行 setup：

```bash
npm install -g @tdwhere/do-it
do-it setup
```

`do-it setup` 会先执行 `do-it install`，再执行 `do-it doctor`。

- `do-it install` 会把受管技能和智能体复制到 `CODEX_HOME`。
- `do-it doctor` 会检查已安装文件和安装状态是否与包内 manifest 一致。
- `CODEX_HOME` 默认是 `~/.codex`。

测试安装行为时，建议使用临时 Codex home：

```bash
CODEX_HOME=/tmp/do-it-codex-test do-it setup
```

安装器不会静默覆盖用户自己的技能或智能体文件。如果目标文件没有被标记为 do-it 受管文件，安装会停止。只有在你明确要替换这些目标时，才设置 `DO_IT_FORCE=1`。

## 安装到 Claude Code

`do-it` 是 Claude Code 插件。通过插件 marketplace 安装：

```text
/plugin marketplace add tdwhere123/codex-workflow
/plugin install do-it
```

或者用 CLI（无 marketplace 时）：

```bash
do-it install --target=claude
do-it doctor --target=claude
```

Claude target 默认装到 `~/.claude/`；用 `CLAUDE_PLUGIN_ROOT_OVERRIDE` 改根目录。可选技能（如 `do-it-visual-planning`）默认不装，加 `--with-optional` 才装。

Claude target 接了三个 hook，工作流在对话里自动出现：

- `UserPromptSubmit` → `do-it-router`（Light/Standard/Heavy 分级）+ `do-it-grill`（前提压测）
- `PreToolUse(Edit|Write)` → Heavy / 显式 durable-plan 的计划和源码编辑门
- `Stop` → `do-it-verification-gate`（完成声明没有证据时阻拦）

不需要记任何斜杠命令。当前 turn 想跳过钩子：在输入里加 `yolo / 直接做 / skip grill / /do-it-skip`。

## registry 发布前的安装方式

如果包暂时托管在 GitHub：

```bash
npm install -g github:OWNER/codex-workflow
do-it setup
```

如果要测试本地打包产物：

```bash
npm pack
npm install -g ./tdwhere-do-it-0.5.1.tgz
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

这个包不会通过 npm lifecycle scripts 自动修改 `~/.codex`。只有操作者显式运行 `do-it setup` 或 `do-it install` 时，才会安装到 Codex。

## 仓库结构

```text
agents/          可移植的 Codex 智能体 TOML 定义
bin/             全局 do-it CLI 入口
docs/            路由、维护、来源映射和发布说明
install/         安装器、doctor 和 shell wrapper 入口
skills/custom/   默认不安装的本地技能示例
skills/do-it/    会被安装的 do-it 原生技能目录
manifest.json    安装清单和目标路径
package.json     npm 包元数据和 CLI scripts
```

私有 `.do-it/` 目录用于本地计划、笔记和临时材料。它被 Git 忽略，也不会被安装。

## 维护说明

修改技能、智能体、安装器或包元数据时，参考 [docs/maintenance.md](./docs/maintenance.md)。简要规则如下：

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

## 致谢

`do-it` 吸收并重写了 Superpowers 技能生态中有价值的工作流思想，并把它们整理为面向 Codex 的原生包。公开名称、路由模型、安装器和收口策略都以这个仓库为维护来源。
