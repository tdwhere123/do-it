/** Compact session bootstrap, injected once via experimental.chat.messages.transform. */
export const BOOTSTRAP_TEXT = `<do-it-bootstrap>
do-it is active. Match depth to the task: choose a do-it skill or an already registered bundled subagent only when task-fit helps; direct user intent wins over hook heuristics. Bundled subagents are visible in the host agent list; delegate only bounded, independent slices that improve the result.

Read current truth before changing a repo. Confirm external or destructive actions. Before claiming completion, report task-relevant evidence; if proof is unavailable, say NOT_VERIFIED with the missing proof and next action.
</do-it-bootstrap>`;
