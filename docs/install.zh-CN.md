# 安装指南

[English](./install.md) | [中文](./install.zh-CN.md)

交付方式按宿主区分：Codex 与 Claude Code **marketplace 优先**；Cursor
目前走**本地拷贝或 Team Import，公开上架待完成**；OpenCode 与 Pi 使用
**独立 npm 包**；Kimi Code 则**直接把仓库根当作插件**
（`kimi.plugin.json`），无需构建。插件包同时携带 skills、agents 和 hooks。

| 真相平面 | 本仓库可以声明的内容 |
| --- | --- |
| 源码 / 包元数据 | 当前 checkout 声明 `0.16.0`、11 个用户可运行 skill + 1 个生成式发现入口、10 个 agent。 |
| Git tag | `0.16.0` 发布提交必须带有 `v0.16.0`；版本元数据不等于发布 tag。 |
| Marketplace / npm | 文档记录坐标与发布路径；只有 workflow 之后的 `npm view` 才能证明已发布到 registry。Cursor 公开上架仍待完成。 |
| Live host | 只有在对应宿主安装并检查，才能证明那里实际启用了什么；不能从源码或 tarball 推断。 |

## Codex

```bash
codex plugin marketplace add tdwhere123/do-it
codex plugin add do-it@tdwhere-do-it
```

`codex plugin marketplace add` 只注册 marketplace，**不会**安装插件。安装后请在 `/hooks` **信任插件 hooks**，以便自动跑路由、Heavy grill 提醒、子 agent 姿态、write-quality lint 和 verification 提醒。

本地 checkout 冒烟（可用临时 `CODEX_HOME`）：

```bash
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
```

Codex plugin bundle 位于 `plugins/do-it/`（由 `manifest.json` 生成）：
11 个用户可运行 skill、1 个生成式 `_index.md` 发现入口、10 个 agent，以及插件内 hooks。
现代 Codex 插件拥有这些 do-it agent；`manifest.targets.codex.installAgents=false`
会保留 `~/.codex/agents` 给用户自己定义的 agent。旧版迁移只会移除已确认的 do-it
重复项。

## Claude Code

```text
/plugin marketplace add tdwhere123/do-it
/plugin install do-it@do-it
```

## Cursor

**Cursor 不使用 Claude Code 的 `/plugin …` 斜杠命令。**

Cursor **有**官方公开市场（[cursor.com/marketplace](https://cursor.com/marketplace)），但 **`do-it` 目前尚未上架**。在提交并通过审核前，请用：

1. **本地（今日推荐）：**

   ```bash
   npm run install:cursor-local
   ```

   然后 **Developer: Reload Window**。脚本会先构建插件包，再把它**真实拷贝**到
   `~/.cursor/plugins/local/do-it-cursor`（Cursor **拒绝**指向 `local/` 外的
   symlink），并**合并** do-it 条目到用户级 `~/.cursor/hooks.json`（当前
   Cursor Hooks UI/服务**不会**注册 plugin 包内 `hooks/hooks.json`）。
   入口一律走 `hooks/run-hook.cmd …`——原生 Windows 上若直接写 `.sh`，Cursor
   会把脚本**当文件打开**而不是执行。**原生 Windows** 目标是
   `%USERPROFILE%\.cursor\plugins\local\do-it-cursor`（绝不会写成
   `/mnt/c/...`）。Windows + WSL 下若能看到 `/mnt/c/Users` 还会镜像到该
   Windows 配置目录。Reload 后确认准确的插件目录存在，且 Customize → Hooks
   能看到用户级 do-it 的 `.cmd` 条目；Agent 触发时不应弹出 `.sh` 源码。这个
   本地拷贝路径不会生成受管 CLI install state，因此普通 `do-it doctor` 不负责
   验证它。
2. **受管 CLI setup：** `do-it setup --target=cursor` 后 Reload（同一
   `…/plugins/local/do-it-cursor` 路径 + 用户 hooks 合并）。`setup` 会先受管安装
   再运行 `doctor`；之后的 `do-it doctor --target=cursor` 仅适用于该受管 CLI
   setup。
3. **团队 Import（不必公开上架）：** Dashboard → Plugins → Import from Repo → `https://github.com/tdwhere123/do-it`（读取 `.cursor-plugin/marketplace.json`）。
4. **日后公开上架：** 提交到 [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)。

Cursor 装 **完整 11 个 skill**（`do-it-core`、`do-it-router`、`do-it-code-quality`、`do-it-architecture`、`do-it-review`、`do-it-decide`、`do-it-verify`，以及 `do-it-handbook`、`do-it-context`、`do-it-skill-authoring`、`do-it-retrospective`），外加 skills index 与 `references/`——与 Codex、Claude、OpenCode 相同。

中等 hook 深度：`sessionStart`、`beforeSubmitPrompt`（由 `prompt-submit` 串行执行 router / Heavy grill，再执行 stance）、`postToolUse` / `afterFileEdit` 旁路 `write-quality-lint`、`stop` 建议性验证提醒。详见 [`harness-adapter-matrix.md`](./harness-adapter-matrix.md)。

## OpenCode

OpenCode 从 `opencode.json` 的 `"plugin"` 数组加载插件。确认
`npm view @tdwhere/do-it-opencode@0.16.0 version` 成功后，再安装独立 npm 包：

```bash
opencode plugin @tdwhere/do-it-opencode -g
```

registry 尚未发布、checkout 开发或 registry 故障时，可用
`npm run install:opencode-global` 构建并
vendor 到 OpenCode 配置目录。日常宿主不要直接指向可变的 git checkout。详见
[`plugins/do-it-opencode/docs/README.opencode.md`](../plugins/do-it-opencode/docs/README.opencode.md)。

```bash
npm run test-opencode
```

## Pi

确认 `npm view @tdwhere/do-it-pi@0.16.0 version` 成功后，再安装独立的 Pi npm 包：

```bash
pi install npm:@tdwhere/do-it-pi
```

registry 尚未发布或开发该包时可使用本地 checkout：运行
`npm run install:pi-global`，然后在 Pi 中执行
`/reload`。核心 extension、skills 与 prompt templates 不依赖额外包。若要运行
十个带命名空间的 package agents（例如 `do-it.code-mapper`、
`do-it.reviewer`），再单独安装：

```bash
pi install npm:pi-subagents
```

用 `/do-it-status` 检查 Bash、Windows Git Bash、hook 诊断和可选 package-agent
运行时。构建与独立打包验证使用 `npm run test-pi` 和
`npm run smoke:pi-package`。详见
[`plugins/do-it-pi/README.md`](../plugins/do-it-pi/README.md)。

## Kimi Code

Kimi Code 直接把仓库根当作插件——无需构建、无生成式插件包。根目录
`kimi.plugin.json` 直接引用 `./skills/do-it/`、`./commands/` 与 `./hooks/`：

```text
/plugins install https://github.com/tdwhere123/do-it
```

然后 `/reload`（或开新会话）。安装为 per-user，落在
`$KIMI_CODE_HOME/plugins/managed/do-it/` 并以该受管副本运行；更新需重新安装。

隔离本地冒烟（不碰真实 Kimi home）：

```bash
export KIMI_CODE_HOME=/tmp/do-it-kimi-test
# 在指向本 checkout 的 Kimi Code 会话中：
#   /plugins install /path/to/do-it
#   /reload
# 确认 11 个 skill 可见、`/do-it:skip` 可用，并用一轮 prompt + Edit + stop
# 触发 router / write-quality-lint / verification-gate。
# 无实机会话时至少跑：
npm run validate:kimi-plugin
```

Kimi Code 装 **完整 11 个 skill**，三个命令以 `/do-it:skip`、
`/do-it:handbook`、`/do-it:retrospective` 提供，以及 4 条清单 hooks
（`UserPromptSubmit` 通过 `prompt-submit` 串行执行 router / grill，并执行
behavior-feedback；`PostToolUse`（matcher `Edit|Write`）执行 write-quality-lint；
`Stop` 执行 verification-gate）。Kimi Code 没有自定义子智能体机制（仅内置 `coder` / `explore` / `plan`），
因此 10 个可移植 agent **不会**装到该宿主，`subagent-stance` 也不接线
（Kimi 的 Subagent 事件 payload 携带空 `session_id`）。协议与限制详见
[`skills/do-it/references/host-kimi.md`](../skills/do-it/references/host-kimi.md)。

## 可选 / 遗留：`do-it setup`

CLI setup 仍可用于 doctor、临时 home 冒烟，以及从旧全局安装迁移。**不是**
推荐的首选安装方式。优先走插件 marketplace；setup 只做镜像或迁移——不要同时
启用插件安装与一套仍存活的、受 do-it 管理的遗留全局镜像。用户自己定义的全局
agent 可以独立保留。

```bash
npm install -g https://github.com/tdwhere123/do-it/archive/refs/heads/main.tar.gz
do-it setup                  # Codex 遗留全局拷贝
do-it setup --target=claude  # 可选：CLI 镜像 Claude 插件
do-it setup --target=cursor  # 可选：CLI 镜像 Cursor 插件
do-it doctor
```

只有在你明确要替换未标记目标时才设 `DO_IT_FORCE=1`。测试时优先用临时 home
（`CODEX_HOME=…`、`CLAUDE_PLUGIN_ROOT_OVERRIDE=…`、`CURSOR_PLUGIN_ROOT_OVERRIDE=…`）。

## 它会安装什么

可运行 skill 矩阵（分层见 `scripts/skill-tiers.mjs`）：

| Host | 用户可运行 skill | 发现元数据 | Agent |
| --- | --- | --- | --- |
| Codex / Claude / Cursor / OpenCode | 11 个 — 7 核心 + 4 扩展 | 1 个生成式 `_index.md` 入口（不是第十二个 skill） | 10 个 |
| Pi | 11 个 — 7 核心 + 4 扩展 | 宿主原生（extension + skills 目录）+ prompt templates | 装了可选 `pi-subagents` 时为 10 个 `do-it.*` package agents；否则 0 个 |
| Kimi Code | 11 个 — 7 核心 + 4 扩展 | 宿主原生发现（无生成式索引） | 0 — 无自定义子智能体 |

- 意涵分桶 skill：`do-it-core`（协议蓝本——先定分级，再证据 / 范围 / 验证 /
  汇报）、`do-it-router`、`do-it-code-quality`（写码主防线）、
  `do-it-architecture`（承重架构治理）、`do-it-review`（审查 + 修复）、
  `do-it-decide`（压测 / 发散 / 计划 / 切片）、`do-it-verify`（证据 + 收口），
  以及扩展的 `do-it-handbook`、`do-it-context`、`do-it-skill-authoring`，
  还有按需的 `do-it-retrospective`。
- 十个可移植 agent：决策侧 `product-strategist` /
  `architecture-strategist` / `plan-challenger`；写码侧 `code-mapper` /
  `code-quality-cleaner` / `tdd-red-writer`；审查侧 `reviewer` /
  `red-team-reviewer` / `spec-compliance-reviewer`；以及
  `documentation-engineer`。
- 共享 hook 集合，按宿主接线：默认关闭、静默的 `behavior-feedback`；
  `prompt-submit`（在清单宿主串行执行 `router` 与仅 Heavy 的 `grill-prompt`，
  适配器宿主保持相同顺序）；`subagent-stance`；旁路
  `write-quality-lint`；建议性 `verification-gate`；`session-start`（Cursor）；
  以及 Claude 默认关闭的具名命令 `strict-external-actions` profile。
  verification hook 在所有宿主都只做建议性提醒；`do-it-verify` 仍负责声明级的
  证明。任何宿主都不再注册 `grill-pretool` 计划闸。
- 斜杠命令（`do-it-skip`、`do-it-handbook`、`do-it-retrospective`）：Claude 直接装载，
  Kimi Code 以 `/do-it:*` 命名空间注册；不保留旧工作流命令别名。
- 可选 CLI 安装器 / `doctor`，用于迁移与冒烟。
- 根目录 `index.json`，供外部发现与覆盖检查。

如需卸载，请按[安全清理 runbook](./maintenance.md#safe-cleanup-runbook) 逐宿主、
逐准确路径清理并保留无关插件与 hook；不要为了移除 do-it 递归删除整个宿主配置目录。

## 其它安装方式

如果要测试本地打包产物：

```bash
npm pack
npm install -g ./tdwhere-do-it-0.16.0.tgz
do-it setup   # 可选 / 遗留全局拷贝
```
