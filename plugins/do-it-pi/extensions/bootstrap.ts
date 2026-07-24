/** Compact session bootstrap injected once via before_agent_start. */
export const BOOTSTRAP_TEXT = `<do-it-bootstrap>
do-it is active on Pi. Match depth to the task: choose a do-it skill or a bounded subagent only when task-fit helps; direct user intent wins over hook heuristics.

Read current truth before changing a repo. Confirm external or destructive actions. Before claiming completion, report task-relevant evidence; if proof is unavailable, say NOT_VERIFIED with the missing proof and next action.
</do-it-bootstrap>`;
