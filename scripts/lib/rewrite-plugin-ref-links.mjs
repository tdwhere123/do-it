/**
 * After copying skills/do-it/references into a plugin skills/references tree,
 * rewrite repo-root-relative links (../../../…) so they resolve inside the
 * plugin layout (../../hooks/…) or point at the public GitHub tree for docs
 * and install sources that are not shipped in the plugin bundle.
 */

import fs from "node:fs";
import path from "node:path";

const GITHUB_TREE = "https://github.com/tdwhere123/do-it/blob/main";

/**
 * @param {string} text
 * @param {{ hasHooksJson?: boolean }} [opts]
 *   When false (OpenCode), install/hooks.json links go to GitHub instead of a
 *   missing ../../hooks/hooks.json.
 */
export function rewriteReferenceMarkdown(text, opts = {}) {
  const hasHooksJson = opts.hasHooksJson !== false;
  let after = text;
  after = after.replaceAll("../../../hooks/", "../../hooks/");

  if (hasHooksJson) {
    after = after.replaceAll(
      "](../../../install/codex-hooks.json)",
      "](../../hooks/hooks.json)"
    );
    after = after.replaceAll(
      "](../../../install/cursor-hooks.json)",
      "](../../hooks/hooks.json)"
    );
  } else {
    after = after.replaceAll(
      "](../../../install/codex-hooks.json)",
      `](${GITHUB_TREE}/install/codex-hooks.json)`
    );
    after = after.replaceAll(
      "](../../../install/cursor-hooks.json)",
      `](${GITHUB_TREE}/install/cursor-hooks.json)`
    );
    // Source may already have been rewritten to ../../hooks/hooks.json on a
    // prior naive copy — remap to GitHub when the plugin has no hooks.json.
    after = after.replaceAll(
      "](../../hooks/hooks.json)",
      `](${GITHUB_TREE}/hooks/hooks.json)`
    );
  }

  after = after.replace(
    /\]\(\.\.\/\.\.\/\.\.\/docs\/([^)]+)\)/g,
    `](${GITHUB_TREE}/docs/$1)`
  );
  after = after.replace(
    /\]\(\.\.\/\.\.\/\.\.\/install\/([^)]+)\)/g,
    `](${GITHUB_TREE}/install/$1)`
  );
  return after;
}

/**
 * @param {string} refsDir Absolute path to plugin …/skills/references
 * @param {{ hasHooksJson?: boolean }} [opts]
 * @returns {number} Number of files rewritten
 */
export function rewritePluginReferenceLinks(refsDir, opts = {}) {
  if (!fs.existsSync(refsDir)) {
    throw new Error(`plugin references missing: ${refsDir}`);
  }

  let rewritten = 0;
  for (const name of fs.readdirSync(refsDir)) {
    if (!name.endsWith(".md")) continue;
    const filePath = path.join(refsDir, name);
    const before = fs.readFileSync(filePath, "utf8");
    const after = rewriteReferenceMarkdown(before, opts);
    if (after !== before) {
      fs.writeFileSync(filePath, after);
      rewritten += 1;
    }
  }
  return rewritten;
}
