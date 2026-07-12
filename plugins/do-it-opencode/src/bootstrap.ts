/**
 * Compact session bootstrap (~300 tokens). Injected once per session via
 * experimental.chat.messages.transform (cached at module level in index.ts).
 */
export const BOOTSTRAP_TEXT = `<do-it-bootstrap>
do-it OpenCode adapter is active. It routes each user message into Light, Standard, or Heavy state; tiers adjust scrutiny, not a required sequence.

Light = bounded single-file/docs fix; Standard = ordinary engineering; Heavy = cross-module, interface, release, or architecture work. Use do-it-decide only when a premise, option, or durable handoff needs pressure. Use do-it-code-quality while writing (premise, blast radius, bounded chain).

Skills: load on demand via the host skill tool — read plugins/do-it-opencode/skills/_index.md (or repo skills/do-it/_index.md) for canonical names: do-it-router, do-it-code-quality, do-it-decide, do-it-review, and do-it-verify (plus persistence skills where installed).

Truth plane: live-opencode — cite fresh, relevant command or inspection output before done/ready/merge/install claims. Idle verification is a soft reminder here; state NOT_VERIFIED with the missing proof and next action when evidence is unavailable.
</do-it-bootstrap>`;
