# 安装指南

[English](./install.md) | [中文](./install.zh-CN.md)

交付方式按宿主区分：Codex 与 Claude Code **marketplace 优先**；Cursor
目前走**本地拷贝或 Team Import，公开上架待完成**；Pi 使用**独立 npm 包**。
技能、专业代理和运行时检查按下文的宿主路径交付。Grok Build 使用生成的
`do-it-grok` 插件包。OpenCode 和 Kimi Code 的仓库支持已退役；
这不会移除本机应用或用户配置。

| 真相平面 | 本仓库可以声明的内容 |
| --- | --- |
| 源码 / 包元数据 | 当前 checkout 准备 `0.19.0`、10 个可运行 skill + 1 个生成式发现入口、8 个 agent。 |
| Git tag | 本次源码更新不创建发布 tag；将来的 `v0.19.0` 应标记已验证的发布提交。版本元数据不等于发布。 |
| Marketplace / npm | 两个 npm 包已于 2026-10-17 发布 `0.18.1`（2026-11-04 查询确认），那些 tarball 早于本次源码；本次不发布 `0.19.0`。Cursor 公开上架仍待完成。 |
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
10 个可运行 skill、1 个生成式 `_index.md` 发现入口及插件内 hooks；
原生代理按下文单独安装。插件使用 `.codex-plugin/plugin.json`。隔离环境中的
`codex 0.162.0` `plugin/read` 对比发现：根 `plugin.json` 未发现任何 hook，
而 Codex 清单能发现 hooks。因此构建器移除根清单和插件内 `agents/` 目录。
当时的历史原生探针返回 12 个技能发现条目、3 个 hook 声明及 Skills/Hooks
能力字段，不代表当前清单数量。当前原生发现及实际钩子执行都需要各自的证据。

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

1. **本地（今日推荐）：** 升级时暂停 Cursor agent 和 hook 活动：受管资源文件
   会逐个替换，并非供读取者使用的原子快照。运行时 `.do-it-data` 与无关的用户
   文件保留原位；同路径的插件资源会更新，未知或已修改的退役文件会保留。进程
   中断后不会自动回滚；重试前请检查遗留的 `.do-it-backup-*` 与 `.do-it-stage-*`
   路径。回滚冲突会报告保留的备份路径。

   ```bash
   npm run install:cursor-local
   ```

   然后 **Developer: Reload Window**。脚本会先构建插件包，再把它**真实拷贝**到
   `~/.cursor/plugins/local/do-it-cursor`（Cursor **拒绝**指向 `local/` 外的
   symlink），并**合并** do-it 条目到用户级 `~/.cursor/hooks.json`（此前本地验证的
   Cursor Hooks UI/服务不会注册 plugin 包内 `hooks/hooks.json`）。本轮尚未重新验证
   当前版本的插件原生 hook 加载：应检查是否重复执行，不能假定用户级镜像仍有必要。
   入口一律走 `hooks/run-hook.cmd …`——原生 Windows 上若直接写 `.sh`，Cursor
   会把脚本**当文件打开**而不是执行。**原生 Windows** 目标是
   `%USERPROFILE%\.cursor\plugins\local\do-it-cursor`（绝不会写成
   `/mnt/c/...`）。Windows + WSL 下，设置 `USERPROFILE` 为该 Windows 配置目录，
   或设置 `CURSOR_LOCAL_HOME` 为其 WSL 路径，即可同步该目录。Reload 后确认准确的插件目录存在，且 Customize → Hooks
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

已发布包与当前未发布的 checkout 不同。确认
`npm view @tdwhere/do-it-pi@0.19.0 version` 已提供目标版本后，再安装这个确切版本：

```bash
pi install npm:@tdwhere/do-it-pi@0.19.0
```

registry 尚未发布或开发该包时可使用本地 checkout：运行
`npm run install:pi-global`，然后在 Pi 中执行 `/reload`。核心 extension、skills
与 prompt templates 不依赖额外包。主要 runtime `@tintinweb/pi-subagents` 的正确
子会话路由目前需要尚未发布的源码补丁，而不是未打补丁的 npm 0.23.0。
先按[原生验证记录](release-evidence/pi-child-identity-boundaries.md)准备并审查补丁，再明确选择
本地 runtime 来源来替代旧来源：

```bash
pi install /path/to/pi-subagents-child-identity
```

先检查 `pi list`，如已有旧 runtime，只移除该 runtime 的包注册；不要同时加载两份。
这是操作人员主动执行的步骤，do-it 安装器和测试不会代为修改现有安装。迁移必须
**配对进行**：不要单独部署或重载新版适配器来连接未打补丁的 Tintinweb。
修改实时链接的源码 checkout 也会在重载时改变已安装插件，因此 runtime/适配器的
配对迁移仍须明确授权。

该 runtime 目前按裸名称发现 package roles，例如 `code-mapper`；另一个兼容性
runtime `pi-subagents` 使用 `do-it.code-mapper` 等名称。工具已注册不代表已确认
最终采用的角色来源：用户及项目角色可能覆盖 package roles。`/do-it-status` 报告
Bash、hook 诊断及工具注册，并不验证角色发现。

Pi 1.5.0 上的无外部 provider 原生测试覆盖了打补丁后的持久化、内存中及嵌套子会话，
普通 fork、extension 筛选，以及取消一个子会话而其兄弟会话继续运行的情况。
创建者提供会话局部身份；`PI_SUBAGENT_CHILD=1` 仍是独立的子进程标记。两者均不可用时，
身份为 **unmarked**，应用主会话 hooks，并在状态中明确警告。未打补丁的 Tintinweb
0.23.0 子会话不受支持，不再根据会话谱系或工具存在性猜测。主会话身份通过 shell 边界
传递，即使 transcript 路径含 `/agents/` 也不会被误判。Pi 根据 SDK 实际持久化的职责
提示去重，因此中断的输出可在恢复时重试。角色切换仅从模型上下文中排除本扩展拥有的
不适用提示，不删除或重写不可变历史及用户内容。测试未修改任何现有安装。

SDK peer 策略为 `~1.5.0`，原生证据仅覆盖 **1.5.0**。兼容 runtime 的可选 peer 和
开发依赖均固定为 **0.35.1**。Linux 上的模拟 provider 原生测试已验证包级角色发现、
项目指令继承、子代理职责提示且不运行主会话 hooks、结果保留，以及活跃子进程取消后的
PID 消失和父会话继续运行。详见 [`tests/pi/nicobailon-native.md`](../tests/pi/nicobailon-native.md)。
Windows 和 0.84.0 生命周期仍为 **NOT_VERIFIED**；nicobailon 的证明式验收层可能在
退出码为 0 时仍拒绝纯文本完成声明。两个 runtime 共用包级代理，但元数据语义不同；
投影文字明确区分 runtime 名称，不会自动选择 runtime。
Tintinweb 的替换提示不继承项目指令文件，应在委派任务中提供必要约束。工具列表、
只读指令及这个受信任 extension 身份接口都不是沙箱。详见 [`plugins/do-it-pi/README.md`](../plugins/do-it-pi/README.md)。

`pi update` 更新 Pi 本身；`pi update --extensions` 协调 extension packages，固定版本
的来源仍保持固定。构建与独立打包验证使用 `npm run test-pi` 和
`npm run smoke:pi-package`。

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

上述命令使用 Grok Build 原生 `agent` 可执行文件（隔离发现检查的宿主版本为 1.0.70）。
刷新 Plugins 页或启动新会话，检查 `do-it-grok` 下实际加载的来源路径、技能名和
代理名；仅在插件列表中出现不能证明发现时哪个来源生效。插件包包含 10 个规范技能
和 8 个生成式 Markdown 专业代理。原生发现中的角色名称形如 `do-it-grok:reviewer`。

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
npm install -g ./tdwhere-do-it-0.19.0.tgz
do-it setup   # 可选 / 遗留全局拷贝
```
