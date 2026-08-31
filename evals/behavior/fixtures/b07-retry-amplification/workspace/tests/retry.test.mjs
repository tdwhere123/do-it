import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { attempts } from "../src/post.mjs";
import { sdkPost } from "../src/sdk.mjs";

function readSrc(name) {
  return fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), `../src/${name}`),
    "utf8"
  );
}

test("one identity is one attempt", () => {
  attempts.length = 0;
  sdkPost("E");
  sdkPost("E");
  assert.equal(attempts.length, 1);
});

test("client and sdk do not multiply retries", () => {
  assert.equal([...readSrc("client.mjs").matchAll(/\bpost\(/g)].length, 1);
  assert.equal([...readSrc("sdk.mjs").matchAll(/\bclientPost\(/g)].length, 1);
  assert.match(readSrc("post.mjs"), /seen|identity/);
});
