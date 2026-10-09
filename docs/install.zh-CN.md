# 安装指南

[English](./install.md) | [中文](./install.zh-CN.md)

交付方式按宿主区分：Codex 与 Claude Code **marketplace 优先**；Cursor
目前走**本地拷贝或 Team Import，公开上架待完成**；Pi 使用**独立 npm 包**。
技能、专业代理和运行时检查按下文的宿主路径交付。Grok Build 使用生成的
`do-it-grok` 插件包。OpenCode 和 Kimi Code 的仓库支持已退役；
这不会移除本机应用或用户配置。

| 真相平面 | 本仓库可以声明的内容 |
| --- | --- |
| 源码 / 包元数据 | 当前 checkout 声明 `0.18.1`、12 个用户可运行 skill + 1 个生成式发现入口、10 个 agent。 |
| Git tag | `0.18.1` 的 GitHub/npm 发布仍需要 `v0.18.1`；版本元数据不等于发布 tag。 |
| Marketplace / npm | 文档记录坐标与发布路径；只有 workflow 之后的 `npm view` 才能证明已发布到 registry。Cursor 公开上架仍待完成。 |
| Live host | 只有在对应宿主安装并检查，才能证明那里实际启用了什么；不能从源码或 tarball 推断。 |

## Codex

```bash
codex plugin marketplace add tdwhere123/do-it
codex plugin add do-it@tdwhere-do-it
```

`codex plugin marketplace add` 只注册 marketplace，**不会**安装插件。安装后请在 `/hooks` 检查并信任已配置的插件 hooks。清单验证和技能发现不证明当前宿主实际执行钩子；依赖上下文或编辑检查前需单独验证。

本地 checkout 冒烟（可用临时 `CODEX_HOME`）：

```bash
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
```

Codex plugin bundle 位于 `plugins/do-it/`（由 `manifest.json` 生成）：
12 个用户可运行 skill、1 个生成式 `_index.md` 发现入口及插件内 hooks；
原生代理按下文单独安装。插件使用 `.codex-plugin/plugin.json`。隔离环境中的
`codex 0.162.0` `plugin/read` 对比发现：根 `plugin.json` 未发现任何 hook，
而 Codex 清单能发现 hooks。因此构建器移除根清单和插件内 `agents/` 目录。
对最终仓库插件包的原生读取返回 12 个技能、3 个 hook 声明及 Skills/Hooks
能力字段。发现配置仍不证明实际执行钩子。

**具名专业代理需要原生 agent 安装。** Codex 从 `.codex/agents/*.toml`
或显式角色配置加载角色；插件 `agents` 字段和缓存文件不等于角色注册。
在本 checkout 中使用同一套所有权和替换保护，仅安装原生代理：

```bash
node bin/do-it.mjs setup --target=codex --only=agents
node bin/do-it.mjs doctor --target=codex --only=agents
```

默认目标为 `~/.codex/agents`；用 `CODEX_HOME` 指定隔离 home。此路径不会再安装
一份 skills/hooks 镜像，也不编辑用户配置。旧版迁移保留当前规范代理及无关的用户自定义代理。
Doctor 只证明受管文件和状态一致；具名角色发现与沙箱行为需在实际宿主中另行验证。
参见[架构说明（英文）](./architecture.md)中的固定版本宿主契约及证据边界。

## Claude Code

```text
/plugin marketplace add tdwhere123/do-it
/plugin install do-it@do-it
```

在 checkout 中用 `claude plugin validate --strict .claude-plugin/plugin.json`
验证插件清单；本次源码更新已通过此检查。验证仓库根目录检查的是 marketplace，
不能代替明确的插件清单检查；两者都不证明实际执行钩子。

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

Cursor 安装完整技能、发现索引、参考文档和限定范围的代理。精简上下文和编辑检查
通过 run-hook.cmd 运行，不注册完成措辞门禁和自动诊断。详见[宿主矩阵](./harness-adapter-matrix.md)。

## Pi

确认 `npm view @tdwhere/do-it-pi@0.18.1 version` 成功后，再安装独立的 Pi npm 包：

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

用 `/do-it-status` 检查 Bash、Windows Git Bash、hook 诊断及 `Agent`/`subagent`
工具注册。实际 `do-it.*` 角色列表需另行检查；工具已注册不代表当前会话或子 fork
已经发现 package agents。全新 Pi 1.1.0 进程中的原生持久化子会话已通过 `pwd`
探针验证：只收到子代理职责提示，没有 Core 或主会话 hook。
构建与独立打包验证使用 `npm run test-pi` 和
`npm run smoke:pi-package`。详见
[`plugins/do-it-pi/README.md`](../plugins/do-it-pi/README.md)。

## Grok Build

使用生成的 `plugins/do-it-grok/`，插件名为 `do-it-grok`。仓库根可能与 Claude
marketplace 中名为 `do-it` 的插件冲突，因此不是 Grok 的安装目标。生成插件包后，
在 checkout 根目录运行：

```bash
npm run build:generated
node scripts/build-grok-plugin.mjs
agent plugin validate plugins/do-it-grok
agent plugin install "$(pwd)/plugins/do-it-grok" --trust
agent inspect --json
```

上述命令使用 Grok Build 原生 `agent` 可执行文件（已核实的宿主版本为 1.0.46）。
刷新 Plugins 页或启动新会话，检查 `do-it-grok` 下实际加载的来源路径、技能名和
代理名；仅在插件列表中出现不能证明发现时哪个来源生效。插件包包含 12 个规范技能
和 10 个生成式 Markdown 专业代理。

UserPromptSubmit 仅更新轮次状态，不输出 Core 上下文。
Grok 钩子协议与 Claude 不同：prompt/session 钩子的输出不能证明模型收到引导上下文。
PostToolUse 可在工具结果之后传递上下文。适配器在首个工具完成后交付 Core，
并非首个动作之前；实际宿主执行仍需独立证据。
Grok 不复制 Claude 的严格外部操作配置。详见
[Grok 宿主说明（英文）](../skills/do-it/references/host-grok.md)。

## 可选 / 遗留：`do-it setup`

CLI setup 仍可用于 doctor、临时 home 冒烟，以及从旧全局安装迁移。**不是**
推荐的首选安装方式。优先走插件 marketplace；setup 只做镜像或迁移——不要同时
启用插件安装与一套仍存活的、受 do-it 管理的遗留全局镜像。用户自己定义的全局
agent 可以独立保留。上面的 Codex agent-only 命令是插件交付的补充，
不会建立遗留的 skills/hooks 镜像。

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

专业技能、宿主支持的限定范围代理、精简上下文和建议性编辑检查。无需 .do-it
脚手架。详见[宿主矩阵](./harness-adapter-matrix.md)和[迁移说明](./simplification-migration.zh-CN.md)。
托管升级仅在能够证明安装器所有权时移除已退役的包组件，不迁移或删除用户配置和记忆。

## 其它安装方式

如果要测试本地打包产物：

```bash
npm pack
npm install -g ./tdwhere-do-it-0.18.1.tgz
do-it setup   # 可选 / 遗留全局拷贝
```
