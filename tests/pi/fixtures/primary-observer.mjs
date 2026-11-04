// Test-only observer and cancellation barrier. Never supplies runtime identity.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = process.env.DO_IT_PI_PROBE_DIR;
const trace = path.join(directory, "trace.jsonl");
const append = (record) => fs.appendFileSync(trace, `${JSON.stringify(record)}\n`);
const text = (messages) => JSON.stringify(messages);
const identity = (pi) => {
	let value = null;
	pi.events.emit("subagents:session-context", { reply: (context) => { value = context; } });
	return value;
};

async function until(check, signal) {
	const deadline = Date.now() + 15_000;
	while (!check()) {
		if (signal?.aborted) throw new Error("fixture wait aborted");
		if (Date.now() > deadline) throw new Error("fixture barrier timed out");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

export default function (pi) {
	const instance = randomUUID();
	const log = (record) => append({ instance, ...record });
	let sessionId;
	let prompt;
	const agents = new Map();
	pi.events.on("subagents:started", (record) => agents.set(record.description, record.id));
	pi.on("session_start", (event, ctx) => {
		sessionId = ctx.sessionManager.getSessionId();
		log({ type: "start", sessionId, reason: event.reason, parent: ctx.sessionManager.getHeader()?.parentSession ?? null,
			file: ctx.sessionManager.getSessionFile() ?? null });
	});
	pi.on("before_agent_start", (event, ctx) => {
		prompt = event.prompt;
		log({ type: "before", sessionId, prompt: event.prompt, identity: identity(pi), tools: pi.getAllTools().map((t) => t.name),
			processChildFlag: process.env.PI_SUBAGENT_CHILD ?? null, parent: ctx.sessionManager.getHeader()?.parentSession ?? null });
	});
	pi.on("context_with_system", (event) => {
		const serialized = text(event.messages);
		log({ type: "context", sessionId, prompt, identity: identity(pi),
			owned: event.messages.filter((message) => message.role === "custom" && message.customType === "do-it"),
			userQuote: event.messages.some((message) => message.role === "user" && text(message.content).includes("USER_QUOTE_DO_NOT_FILTER")),
			stance: (serialized.match(/do-it subagent stance:/g) ?? []).length,
			core: serialized.includes("Do-it: Preserve the user's goal"),
		});
	});
	pi.on("tool_result", (event) => log({ type: "tool", sessionId, prompt, name: event.toolName, input: event.input,
		identity: identity(pi), error: event.isError, content: event.content, agentId: event.details?.agentId }));
	pi.on("agent_settled", (_event, ctx) => {
		const stateFile = path.join(process.env.PI_CODING_AGENT_DIR, "do-it-data/sessions", sessionId, "state.json");
		log({ type: "settled", sessionId, prompt, identity: identity(pi),
			owned: ctx.sessionManager.buildSessionProjection().messages.filter((message) => message.role === "custom" && message.customType === "do-it"),
			state: fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null });
	});
	pi.on("session_shutdown", (event) => log({ type: "shutdown", sessionId, reason: event.reason }));

	pi.registerTool({
		name: "probe_wait", label: "Fixture barrier", description: "Wait for the local fixture controller",
		parameters: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
		execute: async (_id, { label }, signal) => {
			fs.writeFileSync(path.join(directory, `${label}.ready`), sessionId);
			try {
				await until(() => fs.existsSync(path.join(directory, `${label}.release`)), signal);
				return { content: [{ type: "text", text: "barrier released" }] };
			} finally { log({ type: "barrier", sessionId, label, aborted: signal?.aborted === true, identity: identity(pi) }); }
		},
	});
	pi.registerTool({
		name: "probe_control", label: "Fixture controller", description: "Cancel one native child and release its sibling",
		parameters: { type: "object", properties: {} },
		execute: async (_id, _args, signal) => {
			await until(() => ["cancelled", "survivor"].every((name) => fs.existsSync(path.join(directory, `${name}.ready`))), signal);
			const agentId = agents.get("probe-cancelled");
			if (!agentId) throw new Error("native lifecycle did not report the cancelled agent");
			const requestId = "fixture-stop";
			let reply;
			const off = pi.events.on(`subagents:rpc:stop:reply:${requestId}`, (value) => { reply = value; });
			try {
				pi.events.emit("subagents:rpc:stop", { requestId, agentId });
				await until(() => reply !== undefined, signal);
				if (!reply.success) throw new Error(JSON.stringify(reply));
			} finally { off(); }
			fs.writeFileSync(path.join(directory, "survivor.release"), "release");
			log({ type: "control", sessionId, stopped: agentId, identity: identity(pi) });
			return { content: [{ type: "text", text: "one child cancelled; sibling released" }] };
		},
	});
}
