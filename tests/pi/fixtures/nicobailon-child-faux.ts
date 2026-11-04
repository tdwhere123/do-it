import fs from "node:fs";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Child-only fake provider for nicobailon native probes.
 * Copied into an isolated PI_CODING_AGENT_DIR/extensions so the spawned Pi 1.5
 * CLI can register it without the parent SDK session loading it.
 */
export default function (pi: ExtensionAPI): void {
	const faux = fauxProvider();
	const factsPath = process.env.DO_IT_NICO_CHILD_FACTS;
	const delayMs = Number(process.env.DO_IT_NICO_CHILD_DELAY_MS || "0");
	faux.setResponses([
		async (context) => {
			if (delayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
			const text = JSON.stringify(context.messages);
			if (factsPath) {
				fs.writeFileSync(
					factsPath,
					`${JSON.stringify(
						{
							child: process.env.PI_SUBAGENT_CHILD ?? null,
							agent: process.env.PI_SUBAGENT_CHILD_AGENT ?? null,
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
						},
						null,
						2,
					)}\n`,
				);
			}
			return fauxAssistantMessage("NICO_CHILD_OK");
		},
	]);
	pi.registerProvider(faux.provider);
}
