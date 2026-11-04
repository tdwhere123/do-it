import fs from "node:fs";
import path from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Child-only fake provider for nicobailon native probes.
 * Copied into an isolated PI_CODING_AGENT_DIR/extensions so the spawned Pi 1.5
 * CLI can register it without the parent SDK session loading it.
 *
 * Handshake is written at the fake-provider execution boundary, before any
 * optional delay. Completion facts are written only if the scripted reply
 * finishes normally.
 */
function writeJson(filePath: string, value: unknown): void {
	const tempPath = `${filePath}.${process.pid}.tmp`;
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
	fs.renameSync(tempPath, filePath);
}

function waitForDelay(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
	if (delayMs <= 0) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const fail = () => {
			clearTimeout(timer);
			const error = new Error("child faux provider aborted");
			error.name = "AbortError";
			reject(error);
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", fail);
			resolve();
		}, delayMs);
		if (signal?.aborted) {
			fail();
			return;
		}
		signal?.addEventListener("abort", fail, { once: true });
	});
}

export default function (pi: ExtensionAPI): void {
	const faux = fauxProvider();
	const readyPath = process.env.DO_IT_NICO_CHILD_READY;
	const factsPath = process.env.DO_IT_NICO_CHILD_FACTS;
	const delayMs = Number(process.env.DO_IT_NICO_CHILD_DELAY_MS || "0");
	faux.setResponses([
		async (context, options) => {
			const handshake = {
				pid: process.pid,
				ppid: process.ppid,
				child: process.env.PI_SUBAGENT_CHILD ?? null,
				agent: process.env.PI_SUBAGENT_CHILD_AGENT ?? null,
				at: Date.now(),
			};
			if (readyPath) writeJson(readyPath, handshake);
			await waitForDelay(delayMs, options?.signal);
			const text = JSON.stringify(context.messages);
			if (factsPath) {
				writeJson(factsPath, {
					...handshake,
					completed: true,
					inheritProject:
						process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT ?? null,
					inheritSkills: process.env.PI_SUBAGENT_INHERIT_SKILLS ?? null,
					toolNames: pi
						.getAllTools()
						.map((tool) => tool.name)
						.sort(),
					hasStance: text.includes("do-it subagent stance"),
					hasRootKernel: text.includes("Preserve the user's goal"),
					hasProjectConstraint: text.includes(
						"NICO_PROJECT_CONSTRAINT_MARKER",
					),
					hasCodeMapper:
						text.includes("do-it.code-mapper") ||
						text.includes("code-mapper"),
					hasChildBoundary: text.includes(
						"You are a child subagent, not the parent orchestrator.",
					),
				});
			}
			return fauxAssistantMessage("NICO_CHILD_OK");
		},
	]);
	pi.registerProvider(faux.provider);
}
