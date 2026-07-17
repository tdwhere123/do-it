# do-it：Kimi Code 适配 + 修复包 + 技能吸收

## 背景与已确认的决策

子智能体调研结论（2026-07-16，官方文档核实）：

- Kimi Code 0.26.0 插件清单（仓库根 `kimi.plugin.json`）原生支持 `skills` / `hooks` / `commands` / `sessionStart.skill`；hook 协议与 Claude Code 近同构（stdin snake_case JSON、exit 0/2、fail-open）；不支持自定义子智能体（仅内置 coder/explore/plan）；插件 per-user，`/plugins install <GitHub URL>` 安装。
- do-it 审计 P0 为零；问题集中在 P1（发布卫生、会话目录解析漂移）与 P2 一批。
- 上游技能库对照：无第 10 技能的必要，6 个候选全部"吸收"进现有技能；`docs/upstream-map.md` 有 stale 名称需修正。

用户拍板：

1. **形态**：根清单直挂——仓库根放 `kimi.plugin.json`，零构建步骤，直接引用 `./skills/do-it/`、`./hooks/`、`./commands/`。
2. **Agents**：Kimi 端砍掉（无对应机制），文档诚实标注。
3. **修复**：版本与发布卫生 + 会话目录解析归一 + P2 打包 + 适配前重构，全做。
4. **技能**：按调研结论做吸收式扩展 + 修正 upstream-map。

## Phase 0 — Kimi 协议实测（先行，决定分支）

在 `/tmp/kimi-smoke/` 搭最小试验插件（一个 skill、两条 hook、一个 command），用 `KIMI_CODE_HOME=/tmp/kimi-code-home` 隔离安装实测，回答：

1. `UserPromptSubmit` payload 是否含 `prompt` 字段（router/grill/behavior-feedback 依赖）。
2. `Stop` payload 是否含 `transcript_path`（verification-gate 依赖；无则确认优雅降级）。
3. exit 0 时 stdout 的 `{"hookSpecificOutput":{"additionalContext":...}}` JSON 是否被解析，还是原始 stdout 文本直接入上下文 —— 决定 `hooks/lib/common.sh` 的 `do_it_emit_context` 是否需要 Kimi 纯文本分支。
4. `commands/*.md` 带 Claude 风格 frontmatter（`allowed-tools` 等额外字段）在 Kimi 是否只被忽略而不报错。
5. 清单 `skills: "./skills/do-it/"` 单父路径是否注册全部 9 个技能。

产出：把结论写进 `skills/do-it/references/host-kimi.md` 的协议小节；若 (3) 不解析 JSON，则 Phase 2 给 `do_it_emit_context` 加 `KIMI_CODE_HOME`/`KIMI_PLUGIN_ROOT` 检测分支。

## Phase 1 — 适配前重构（单一来源化）

1. **Hook 清单单一来源**：新建 `scripts/lib/hook-manifest.mjs`，导出规范 hook 脚本列表与各宿主事件接线；改造引用点：`scripts/build-codex-plugin.mjs`（内联数组，~L167）、`build-cursor-plugin.mjs`（`cursorHookScripts`）、`build-opencode-plugin.mjs`（`hookScripts`）、`validate-harness-matrix.mjs`；`hooks/run-hook.cmd` 的 cmd/bash 双份 allowlist 不生成，但由 validate 脚本断言与 hook-manifest 一致（注释注明来源）。
2. **manifest.json extras 去重**：新增顶层 `commonExtras`（约 10 个共有 hook/reference 条目），`targets.{codex,claude,cursor}.extras` 只留各自增量（claude: strict-external-actions + commands + .claude-plugin；cursor: session-start + run-hook.cmd + plugin meta；codex: codex-hooks-json 双写）；`install/manage.mjs` 读取时合并 commonExtras + 目标 extras。跑 `tests/install/*` 验证。
3. **build 公共库**：抽 `scripts/lib/plugin-build.mjs`（`writeJsonAtomic`/`assertVersionParity`/copySkills/copyAgents/copyHooks），三个 build 脚本改为引用；保持生成产物字节一致（CI 的 `git diff --exit-code` 会证明）。
4. **会话目录解析归一**：以 `hooks/lib/common.sh` 的 8 级顺序为基准；补 `install/manage.mjs` `sessionsBaseDir()` 缺失的 `PLUGIN_DATA`/`OPENCODE_DATA` 两级；对齐 `plugins/do-it-opencode/src/bridge.ts` `resolveSessionStateDir()`；`docs/harness-adapter-matrix.md` 的 7 级列表更新为 8 级；四处互加注释指向基准。**同一批改动中加入 KIMI 级**：`$KIMI_CODE_HOME/do-it-data/sessions`（注意：不写 `KIMI_PLUGIN_ROOT`——那是受管副本，只读语义）。

## Phase 2 — Kimi 适配本体（根清单直挂）

1. **新建仓库根 `kimi.plugin.json`**：
   - `name: "do-it"`，`version` 与 package.json 同步，`interface` 展示信息；
   - `skills: "./skills/do-it/"`（待 Phase 0 (5) 确认；否则枚举 9 个 `./skills/do-it/<name>/` 路径）；
   - `commands: "./commands/"`（`/do-it:skip`、`/do-it:handbook`、`/do-it:retrospective`）；
   - `hooks`: 5 条 v1 接线——`UserPromptSubmit` × 3（router、grill-prompt、behavior-feedback）、`PostToolUse` matcher `"Edit|Write|MultiEdit"` → write-quality-lint、`Stop` → verification-gate；command 形如 `DO_IT_HOOK_DATA="${KIMI_CODE_HOME}/do-it-data" ./hooks/router.sh`；
   - **不接** `subagent-stance`（其 transcript 探测在 Kimi 无对应物；Kimi 有 `SubagentStart` 事件但 payload 形状未知，v1 诚实跳过并在 host-kimi.md 记录为后续项）；
   - 不启用 `sessionStart.skill`（router hook 的紧凑建议行更符合 token 预算哲学）。
2. **`hooks/lib/common.sh` / `behavior-feedback.sh`**：加 KIMI 分支（`bf_host()`、session-dir、按 Phase 0 (3) 决定的输出协议分支）。改动走 `tests/hooks/` 回归。
3. **文档**：
   - 新建 `skills/do-it/references/host-kimi.md`（安装、hook 深度表、工具名映射、**诚实标注：10 个 agents 不可用（Kimi 无自定义子智能体），委派走内置 coder/explore**、per-user 限制、协议实测结论）；
   - `skills/do-it/references/host-vocabulary.md` 加 Kimi 行；`docs/harness-adapter-matrix.md` 加第五列（Distribution: git URL 插件安装；Hook depth: Full-minus-subagent）；
   - `README.md` + `README.zh-CN.md`：安装表加 Kimi 段（`/plugins install https://github.com/tdwhere123/do-it`），宿主计数 4→5，说明 agents 缺口。
4. **校验**：新建 `scripts/validate-kimi-plugin.mjs`——断言清单路径存在、9 技能齐全且与 `skill-tiers.mjs` 一致、hook 脚本存在且可执行、commands 文件存在、version 与 package.json 一致；挂入 `npm test`、`prepack`、CI（`.github/workflows/ci.yml`）与 `release.yml`。**不新增** `manifest.json targets.kimi`（根直挂无需 managed install），**不新增** build 脚本与 `plugins/do-it-kimi/`。
5. **冒烟**：`KIMI_CODE_HOME=/tmp/do-it-kimi-test` 下 `/plugins install <本地 checkout>`，headless 跑一轮验证 5 条 hook 触发与技能发现；步骤写进 README 的 Kimi 段。

## Phase 3 — 修复包

**P1 版本与发布卫生**
- `.gitignore` 加 `.claude/`（现含本地设置 + 2.6MB 嵌套 agent 工作区）；顺手去重 `.codex` 两行。
- 全部 version 字段（package.json、manifest.json、index.json、`.claude-plugin/`、`plugins/do-it*/`、`kimi.plugin.json`）统一升 **0.14.1**（用户决定：本轮工作直接作为 patch 发布，不挂 dev 版本号；在其余工作完成后执行）；CHANGELOG 的 `Unreleased` 内容归入 `## 0.14.1`；确认 `scripts/validate-release.mjs` 与 prepack 通过。
- git tag 策略：建议补打 `v0.14.0`（定位 0.14.0 提交）并此后坚持 tag 触发发布；runbook 写入 `docs/release.md`。**所有 git tag/push 操作执行前单独向用户确认。**

**P2 一批**
- `scripts/lint-hooks.sh` 补 lint `hooks/session-start.sh`、`anti-patterns-lint.sh`、`comments-lint.sh`。
- `scripts/build-codex-plugin.mjs` 生成的 hook 命令 `${PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}` 加最终兜底（避免静默退化成 `/hooks/...`），重建 `plugins/do-it/hooks/hooks.json` 并跑 codex 插件测试。
- 删除空目录 `hooks/claude/`（零引用）；删除空 `.codex/`。
- `scripts/build-index-json.mjs`：`total_skills` 排除生成的 `_index.md`（口径回到 9，`total_discovery_entries` 保留），重建 `index.json`。
- `hooks/lib/write-quality-scan.sh` mktemp 缺失兜底加 `noclobber`（`set -C`）+ `umask 077`。
- Codex/OpenCode 的 Windows 无 `.cmd` 故事：本轮只在 `host-codex.md`/`host-opencode.md` 记为已知限制，不改代码。

## Phase 4 — 技能吸收（无第 10 技能）

按调研结论做章节级吸收（每处改动控制在数行，守住 keep-it-small）：

1. `do-it-code-quality`：+ merge-conflict 小节（按意图逐 hunk 解决，溯源两侧来源；永不 `--abort` 逃逸；完成后验证）；+ 一条 observability 规则（交付可在生产运行的特性时，点名其证据面——log/metric/trace 之一）。
2. `do-it-verify`：claim 表 +1 行（生产可运行的证据类型）；branch closeout +1 行（收尾前 grep 延期标记约定，如 `TODO(@owner)`）。
3. `do-it-handbook`：+ 可选 `decisions.md` 晋升规则（grill 结论若永久定路线，晋升为一段话决策记录；一个文件、每个决策一段，防膨胀）。
4. `do-it-decide`：§Research-First +1 行（引用一手来源；结论耐久则落入 worklog/handbook）；+1 行（新鲜上下文的质疑适用于"决定中"，不只针对完成后的 diff）。
5. `docs/upstream-map.md` 修正（用户原则：**只记录真实血脉，收敛趋同 ≠ 来源，不强行加映射**——do-it 起步确实学习过上游，但后期大量内容是独立创新）：
   - 仅对**已存在的映射条目**修正 stale 名称（`to-prd`→`to-spec`、`to-tickets`、`triage`、`writing-great-skills`、`domain-modeling`；`zoom-out` 已删记为历史；`qa`/`design-an-interface`/`request-refactor-plan` 标注 upstream 已 deprecated）。
   - 只为**本轮真正从上游借鉴的新吸收**（merge-conflict、observability、ADR-lite、research capture/doubt 行）补 "inspired by" 条目。
   - **不**补 superpowers 全量映射表；**不**为 do-it 独立创新的能力（review 双轴、router、verify 等）追加溯源行。在 upstream-map 开头加一句原则说明：convergence is not lineage，只记录真实学习/借鉴关系。
6. 明确不加（保持拒绝）：固定执行链（implement/executing-plans/wayfinder）、tracker 耦合技能、token-golf、teach/wizard、domain 工具技能、blocking gates。

技能改动后必跑：`npm run check:skill-links`、`validate:core-skill-boundaries`、`build:generated` + 重建受影响的插件包（CI diff 门禁兜底）。

## Phase 5 — 收尾验证

1. `npm test` 全量（含新增 validate-kimi-plugin）、`npm run lint`、`npm run smoke:package`、`git diff --check`。
2. Kimi 实机冒烟（Phase 0 的断言对真实插件复跑一遍）。
3. 文档口径扫描：README/README.zh-CN 的宿主数、技能数（9）、agents 数（10，Kimi 除外）一致；`docs/harness-adapter-matrix.md` 与代码一致；CHANGELOG `Unreleased` 记录本轮全部变更。

## 执行顺序与边界

- 顺序：Phase 0 → 1 → 2 →（3、4 可并行）→ 5。Phase 1.4 与 Phase 2.2 同一批改 `common.sh`，一次完成。
- 不做：不新增第 10 技能；不做 Kimi 自定义子智能体的变通模拟（lens 化已被用户否决）；不动 OpenCode/Cursor/Codex/Claude 现有行为；git tag/push 另行确认。
- 风险：Phase 0 若发现 Kimi 不解析 `hookSpecificOutput`，`common.sh` 输出分支是唯一协议改动面，回归由 `tests/hooks/` 覆盖；commands frontmatter 若报 diagnostics，再评估是否给 Kimi 单独维护精简命令集。
