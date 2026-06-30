/**
 * Compact session bootstrap (~300 tokens). Injected once per session via
 * experimental.chat.messages.transform (cached at module level in index.ts).
 */
export const BOOTSTRAP_TEXT = `<do-it-bootstrap>
do-it OpenCode adapter is active. Use do-it-router first on non-trivial repo work to pick Light, Standard, or Heavy tier and set session dims (dim_touches_code, dim_breaks_interface, etc.).

Tiers: Light = bounded single-file/docs fix; Standard = ordinary engineering; Heavy = cross-module, interface, release, or architecture work — requires .do-it/plans/* before src/packages/apps edits (grill-pretool enforces).

Skip hooks for one turn: include yolo, skip grill, just do it, 直接做, 不用 grill, or /do-it-skip [router|grill|gate|all]. Session flags live under $OPENCODE_DATA/sessions/.

Skills: load on demand via the host skill tool — read plugins/do-it-opencode/skills/_index.md (or repo skills/do-it/_index.md) for names; start with do-it-router, then tier-appropriate skills (planning, grill, tdd, review-loop, verification-gate).

Truth plane: live-opencode — cite fresh command output before done/ready/merge/install claims; verification-gate runs on session idle (soft reminder here, hard block on Codex/Claude stop hooks).
</do-it-bootstrap>`;
