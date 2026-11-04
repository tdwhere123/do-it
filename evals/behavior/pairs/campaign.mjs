#!/usr/bin/env node
// One serial campaign: six fixed jobs, one fail-closed 90-request ledger.
// The live CLI requires an explicit opt-in; imported tests inject a fake provider.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGateway, xaiProviderFromCredential } from './gateway.mjs';
import { runSandbox } from './sandbox.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const jobs = [
  ['identity', 'published'], ['identity', 'candidate'],
  ['retirement', 'candidate'], ['retirement', 'published'],
  ['evidence', 'published'], ['evidence', 'candidate']
];
const sha = data => createHash('sha256').update(data).digest('hex');

function tree(root) {
  const result = {};
  function visit(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name, abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs, rel);
      else if (entry.isFile()) result[rel] = sha(fs.readFileSync(abs));
      else throw new Error(`unexpected non-file input: ${rel}`);
    }
  }
  visit(root); return result;
}
function save(file, object) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(object, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const dirfd = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
}
function verifyInputs(runDir, manifestHash) {
  const manifest = fs.readFileSync(path.join(runDir, 'inputs.json'));
  if (sha(manifest) !== manifestHash) throw new Error('frozen input manifest hash mismatch');
  const parsed = JSON.parse(manifest);
  if (parsed.schema !== 'do-it/behavior-pairs-inputs/v1' ||
      parsed.candidate !== '7aa5c2220019ef0dbad654deb4bbb18b487a0324' ||
      parsed.published?.npmIntegrity !== 'sha512-wu+UeJEWGtJNllP26BU6l1WJANqQP2xWV6y16npsFQAxhFv82VBCMV8NAe0xR8Ky8Z6ws99wPEwKs7D6bqXyVg==') {
    throw new Error('unexpected frozen input identity');
  }
  if (JSON.stringify(tree(path.join(runDir, 'inputs'))) !== JSON.stringify(parsed.files)) {
    throw new Error('frozen inputs changed after manifest creation');
  }
}
function engineFacts() {
  const engine = path.join(repo, 'plugins/do-it-pi/node_modules/@earendil-works');
  const versions = {};
  for (const name of ['pi-coding-agent', 'pi-ai', 'pi-agent-core']) {
    const version = JSON.parse(fs.readFileSync(path.join(engine, name, 'package.json'), 'utf8')).version;
    if (version !== '1.5.0') throw new Error(`unexpected ${name} version`);
    versions[name] = version;
  }
  const paths = ['pi-coding-agent/dist/core/sdk.js', 'pi-ai/dist/api/openai-responses.js',
    'pi-agent-core/dist/agent-loop.js'];
  return { node: process.version, versions,
    codeSha256: Object.fromEntries(paths.map(file => [file, sha(fs.readFileSync(path.join(engine, file)))])),
    harnessSha256: Object.fromEntries(['gateway.mjs', 'sandbox.mjs', 'worker.mjs', 'campaign.mjs']
      .map(file => [file, sha(fs.readFileSync(path.join(here, file)))])) };
}

/** Injectable provider is for the provider-free boundary test, not the live CLI. */
export async function runCampaign({ runDir, outputDir, manifestHash, provider, limit = 90, signal, onStart, timeoutMs }) {
  if (typeof provider !== 'function') throw new Error('explicit provider required');
  verifyInputs(runDir, manifestHash);
  if (!Number.isInteger(limit) || limit < 1 || limit > 90) throw new Error('invalid campaign budget');
  const engine = engineFacts();
  fs.mkdirSync(outputDir); // never repeat or overwrite a partial campaign
  const requestDir = path.join(outputDir, 'requests'), jobsDir = path.join(outputDir, 'jobs');
  fs.mkdirSync(jobsDir);
  save(path.join(outputDir, 'campaign.json'), { schema: 'do-it/behavior-pairs/v1', manifestHash,
    provider: 'xai', model: 'grok-4.6', thinking: 'xhigh', budget: limit, engine,
    concurrency: 1, jobs: jobs.map(([task, condition], index) => ({ id: String(index + 1).padStart(2, '0'), task, condition })) });
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-'));
  const socket = path.join(socketDir, 'api.sock');
  let gateway;
  const results = [];
  try {
    gateway = await createGateway({ socket, dir: requestDir, limit, provider });
    for (const [index, [task, condition]] of jobs.entries()) {
      const id = String(index + 1).padStart(2, '0');
      const jobDir = path.join(jobsDir, id); fs.mkdirSync(jobDir);
      if (signal?.aborted || gateway.status().failure) {
        const skipped = { id, task, condition, status: 'SKIPPED', reason: gateway.status().failure ?? 'interrupted' };
        save(path.join(jobDir, 'result.json'), skipped); results.push(skipped); continue;
      }
      let slot;
      try {
        slot = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-'));
        const work = path.join(slot, 'work'), job = path.join(slot, 'job'), skills = path.join(slot, 'skills');
        fs.mkdirSync(job);
        const inputs = path.join(runDir, 'inputs');
        const source = path.join(inputs, 'cases', task);
        const skillSource = condition === 'published'
          ? path.join(inputs, 'published/package/skills/do-it') : path.join(inputs, 'candidate/skills/do-it');
        fs.cpSync(source, work, { recursive: true });
        fs.cpSync(skillSource, skills, { recursive: true });
        fs.copyFileSync(path.join(inputs, 'prompts', `${task}.txt`), path.join(job, 'prompt.txt'));
        fs.copyFileSync(path.join(inputs, 'bootstrap.txt'), path.join(slot, 'bootstrap.txt'));
        fs.copyFileSync(path.join(here, 'worker.mjs'), path.join(slot, 'runtime.mjs'));
        const original = tree(work), initialSkillHashes = tree(skills);
        if (JSON.stringify(original) !== JSON.stringify(tree(source)) ||
            JSON.stringify(initialSkillHashes) !== JSON.stringify(tree(skillSource))) throw new Error('staging mismatch');
        const firstRequest = gateway.status().count + 1;
        save(path.join(jobDir, 'start.json'), { id, task, condition, startRequest: firstRequest,
          workspace: original, skills: initialSkillHashes, promptSha256: sha(fs.readFileSync(path.join(job, 'prompt.txt'))),
          bootstrapSha256: sha(fs.readFileSync(path.join(slot, 'bootstrap.txt'))) });
        onStart?.({ id, task, condition, requestCount: gateway.status().count });
        const outcome = await runSandbox({ engine: path.join(repo, 'plugins/do-it-pi/node_modules'), node: process.execPath,
          work, job, skills, socket, bootstrap: path.join(slot, 'bootstrap.txt'), worker: path.join(slot, 'runtime.mjs'),
          stdout: path.join(jobDir, 'events.jsonl'), stderr: path.join(jobDir, 'stderr.txt'), timeoutMs, signal });
        if (outcome.code !== 0) gateway.stop(`worker ${id} failed or was interrupted`);
        await gateway.idle(); // account every dispatched request before continuing
        const final = tree(work);
        if (JSON.stringify(final) !== JSON.stringify(original)) gateway.stop(`workspace ${id} unexpectedly changed`);
        if (gateway.status().count < firstRequest) gateway.stop(`worker ${id} made no generation request`);
        const current = gateway.status();
        const result = { id, task, condition, status: outcome.code === 0 && !current.failure ? 'COMPLETED' : 'FAILED',
          outcome, firstRequest, lastRequest: current.count, gatewayFailure: current.failure, finalWorkspace: final };
        save(path.join(jobDir, 'result.json'), result); results.push(result);
      } catch (error) {
        gateway.stop(`worker ${id} boundary error`);
        await gateway.idle();
        const result = { id, task, condition, status: 'FAILED', reason: error.message, requests: gateway.status().count };
        save(path.join(jobDir, 'result.json'), result); results.push(result);
      } finally { if (slot) fs.rmSync(slot, { recursive: true, force: true }); }
    }
    await gateway.idle();
    const status = gateway.status();
    save(path.join(outputDir, 'result.json'), { results, requestsReserved: status.count, failure: status.failure,
      inflight: status.inflight, pending: status.pending });
    return { results, ...status };
  } finally {
    if (gateway) { gateway.stop('campaign finished'); await gateway.idle(); await gateway.close(); }
    fs.rmSync(socketDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.length !== 5 || process.env.DO_IT_PAIRS_LIVE !== '1') {
    throw new Error('live opt-in required: DO_IT_PAIRS_LIVE=1 node campaign.mjs FROZEN_DIR NEW_OUTPUT_DIR INPUT_MANIFEST_SHA256');
  }
  const [runDir, outputDir, manifestHash] = process.argv.slice(2).map((value, index) => index < 2 ? path.resolve(value) : value);
  verifyInputs(runDir, manifestHash);
  const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), '.pi/agent');
  const credential = JSON.parse(fs.readFileSync(path.join(agentDir, 'auth.json'), 'utf8')).xai;
  if (credential?.type !== 'oauth' || !credential.access || !Number.isFinite(credential.expires) || credential.expires <= Date.now()) {
    throw new Error('xai access unavailable or expired; no refresh attempted');
  }
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const result = await runCampaign({ runDir, outputDir, manifestHash, provider: xaiProviderFromCredential(credential),
      signal: abort.signal, onStart: ({ id, requestCount }) => console.log(`Starting job ${id}; ${requestCount} requests reserved so far.`) });
    console.log(JSON.stringify({ requestsReserved: result.count, failure: result.failure,
      statuses: result.results.map(row => row.status) }));
    if (result.failure || result.results.some(row => row.status !== 'COMPLETED')) process.exitCode = 1;
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
