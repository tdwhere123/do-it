import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runCampaign } from '../evals/behavior/pairs/campaign.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = data => createHash('sha256').update(data).digest('hex');
const integrity = 'sha512-wu+UeJEWGtJNllP26BU6l1WJANqQP2xWV6y16npsFQAxhFv82VBCMV8NAe0xR8Ky8Z6ws99wPEwKs7D6bqXyVg==';
function files(root) {
  const result = {};
  function walk(dir, prefix = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name, abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, rel); else result[rel] = sha(fs.readFileSync(abs));
    }
  }
  walk(root); return result;
}
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-campaign-')), input = path.join(dir, 'inputs');
  fs.mkdirSync(input);
  for (const folder of ['published/package/skills', 'candidate/skills']) {
    fs.mkdirSync(path.join(input, folder), { recursive: true });
    fs.cpSync(path.join(root, 'skills/do-it'), path.join(input, folder, 'do-it'), { recursive: true });
  }
  fs.mkdirSync(path.join(input, 'prompts'));
  for (const task of ['identity', 'retirement', 'evidence']) {
    fs.mkdirSync(path.join(input, 'cases', task), { recursive: true });
    fs.writeFileSync(path.join(input, 'cases', task, 'source.txt'), 'Task source.\n');
    fs.writeFileSync(path.join(input, 'prompts', `${task}.txt`), 'Inspect the workspace.\n');
  }
  fs.writeFileSync(path.join(input, 'rubric.md'), 'HOLDOUT-SENTINEL-NOT-FOR-WORKERS');
  fs.copyFileSync(path.join(root, 'hooks/data/core-context.txt'), path.join(input, 'bootstrap.txt'));
  const manifest = { schema: 'do-it/behavior-pairs-inputs/v1', candidate: '7aa5c2220019ef0dbad654deb4bbb18b487a0324',
    published: { npmIntegrity: integrity }, files: files(input) };
  fs.writeFileSync(path.join(dir, 'inputs.json'), JSON.stringify(manifest));
  return { dir, manifestHash: sha(fs.readFileSync(path.join(dir, 'inputs.json'))) };
}
function sse(item, n) {
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { ...item,
      ...(item.type === 'function_call' ? { arguments: '' } : { content: [] }) } },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: `r${n}`, status: 'completed', output: [item],
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } } }
  ];
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
}
function response(text, status = 200) { return { status, body: (async function* () { yield Buffer.from(text); })() }; }
function message(n) { return { type: 'message', id: `m${n}`, role: 'assistant',
  content: [{ type: 'output_text', text: 'Offline result.', annotations: [] }] }; }

test('actual six-job entrypoint, discovery and budget operate with a controlled provider', { timeout: 60_000 }, async () => {
  const { dir, manifestHash } = fixture(); let n = 0;
  try {
    const result = await runCampaign({ runDir: dir, outputDir: path.join(dir, 'out'), manifestHash, provider: async body => {
      n++; const request = body.toString('utf8');
      assert.doesNotMatch(request, /HOLDOUT-SENTINEL-NOT-FOR-WORKERS/);
      const item = n % 2 ? { type: 'function_call', id: `f${n}`, call_id: `c${n}`, name: 'read',
        arguments: JSON.stringify({ path: '/skills/do-it-code-quality/SKILL.md' }) } : message(n);
      return response(sse(item, n));
    } });
    assert.equal(n, 12); assert.equal(result.count, 12); assert.equal(result.failure, null);
    assert.deepEqual(result.results.map(row => row.status), Array(6).fill('COMPLETED'));
    for (let index = 1; index <= 6; index++) {
      const job = path.join(dir, 'out/jobs', String(index).padStart(2, '0'));
      assert.match(fs.readFileSync(path.join(job, 'events.jsonl'), 'utf8'), /Trace the live behavior/);
      const saved = JSON.parse(fs.readFileSync(path.join(job, 'result.json'), 'utf8'));
      assert.equal(saved.firstRequest, index * 2 - 1); assert.equal(saved.lastRequest, index * 2);
    }
    const ledger = fs.readFileSync(path.join(dir, 'out/requests/ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(ledger.map(row => row.event), Array.from({ length: 12 }, () => ['reserved', 'completed']).flat());
    await assert.rejects(runCampaign({ runDir: dir, outputDir: path.join(dir, 'out'), manifestHash, provider: async () => {} }), /EEXIST/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('campaign stops after a provider failure and records all remaining jobs skipped', { timeout: 30_000 }, async () => {
  const { dir, manifestHash } = fixture(); let n = 0;
  try {
    const result = await runCampaign({ runDir: dir, outputDir: path.join(dir, 'out'), manifestHash, provider: async () => {
      n++; return n === 1 ? response(sse(message(n), n)) : response('controlled failure', 500);
    } });
    assert.equal(n, 2); assert.equal(result.count, 2);
    assert.deepEqual(result.results.map(row => row.status), ['COMPLETED', 'FAILED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED']);
    assert.match(result.failure, /HTTP 500/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('changed input manifest prevents any provider dispatch', async () => {
  const { dir, manifestHash } = fixture(); let dispatched = false;
  try {
    fs.writeFileSync(path.join(dir, 'inputs/rubric.md'), 'changed after freeze');
    await assert.rejects(runCampaign({ runDir: dir, outputDir: path.join(dir, 'out'), manifestHash,
      provider: async () => { dispatched = true; } }), /frozen inputs changed/);
    assert.equal(dispatched, false); assert.equal(fs.existsSync(path.join(dir, 'out')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
