import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createGateway, xaiProviderFromCredential } from '../evals/behavior/pairs/gateway.mjs';
import { runSandbox } from '../evals/behavior/pairs/sandbox.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'plugins/do-it-pi/node_modules');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-pair-check-'));
const valid = JSON.stringify({ model: 'grok-4.6', reasoning: { effort: 'xhigh' }, stream: true });
function post(socket, body = valid) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: socket, path: '/responses', method: 'POST' }, async res => {
      let text = ''; for await (const part of res) text += part;
      resolve({ status: res.statusCode, text });
    });
    req.on('error', reject); req.end(body);
  });
}
function rows(dir) { return fs.readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); }
function asStream(text) { return (async function* () { yield Buffer.from(text); })(); }

test('reservation is durable before dispatch, limit and failed requests close the gate', async () => {
  for (const failure of [false, true]) {
    const dir = temp(), socket = path.join(dir, 'api.sock'), records = path.join(dir, 'records');
    let dispatched = 0;
    const gate = await createGateway({ socket, dir: records, limit: 2, provider: async body => {
      dispatched++;
      assert.equal(rows(records).at(-1).event, 'reserved');
      assert.deepEqual(fs.readFileSync(path.join(records, `${String(dispatched).padStart(3, '0')}.request.json`)), body);
      return { status: failure ? 500 : 200, body: asStream('response') };
    } });
    try {
      assert.equal((await post(socket)).status, failure ? 500 : 200);
      assert.equal((await post(socket)).status, failure ? 503 : 200);
      assert.equal((await post(socket)).status, 503);
      assert.equal(dispatched, failure ? 1 : 2);
      assert.equal(gate.status().count, dispatched);
      assert.ok(gate.status().failure);
      assert.deepEqual(rows(records).map(row => row.event), failure
        ? ['reserved', 'failed'] : ['reserved', 'completed', 'reserved', 'completed']);
    } finally { await gate.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('native upstream is a single non-redirecting HTTPS POST with no credential refresh', async () => {
  let calls = 0;
  const request = (url, options, receive) => {
    calls++;
    assert.equal(url, 'https://api.x.ai/v1/responses');
    assert.equal(options.method, 'POST'); assert.equal(options.agent, false);
    assert.equal(options.headers.authorization, 'Bearer fixture-token');
    const req = new EventEmitter();
    req.end = body => { assert.equal(body.toString(), valid); receive({ statusCode: 307, headers: {}, ...asStream('redirect') }); };
    return req;
  };
  const provider = xaiProviderFromCredential({ type: 'oauth', access: 'fixture-token', expires: Date.now() + 60_000 }, request);
  assert.equal((await provider(Buffer.from(valid))).status, 307);
  assert.equal(calls, 1);
  const expired = xaiProviderFromCredential({ type: 'oauth', access: 'fixture-token', expires: 1 }, request);
  await assert.rejects(expired(Buffer.from(valid)), /expired/);
  assert.equal(calls, 1);
});

test('invalid and uncertain requests cannot silently consume more generations', async () => {
  for (const invalid of [true, false]) {
    const dir = temp(), socket = path.join(dir, 'api.sock'), records = path.join(dir, 'records');
    let dispatched = 0;
    const gate = await createGateway({ socket, dir: records, limit: 2, provider: async () => {
      dispatched++; throw new Error('controlled network loss');
    } });
    try {
      assert.equal((await post(socket, invalid ? '{}' : valid)).status, 503);
      assert.equal((await post(socket)).status, 503);
      assert.equal(dispatched, invalid ? 0 : 1);
      assert.deepEqual(rows(records).map(row => row.event), invalid ? [] : ['reserved', 'unknown']);
    } finally { await gate.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

function scriptedSse(item, index) {
  const events = [
    { type: 'response.output_item.added', output_index: 0,
      item: { ...item, ...(item.type === 'function_call' ? { arguments: '' } : { content: [] }) } },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: `resp-${index}`, status: 'completed', output: [item],
      usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } } }
  ];
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
}
function call(id, name, args) {
  return { type: 'function_call', id: `f${id}`, call_id: `c${id}`, name, arguments: JSON.stringify(args) };
}

test('native Pi worker, Bash and read tools stay inside the holdout boundary', { timeout: 30_000 }, async () => {
  const dir = temp(), slot = path.join(dir, 'slot'), work = path.join(slot, 'work'), job = path.join(slot, 'job');
  fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(job, { recursive: true });
  fs.writeFileSync(path.join(job, 'prompt.txt'), 'Inspect the workspace.');
  const secret = path.join(dir, 'holdout.txt'), marker = 'SENTINEL-NEVER-EXPOSE-6e4b7b8b';
  fs.writeFileSync(secret, marker);
  const socket = path.join(dir, 'api.sock'), records = path.join(dir, 'records');
  let hostConnections = 0;
  const network = http.createServer((req, res) => { hostConnections++; res.end('host'); });
  await new Promise(resolve => network.listen(0, '127.0.0.1', resolve));
  const port = network.address().port;
  const commands = [
    call(1, 'read', { path: secret }),
    call(2, 'bash', { command: `test ! -e '${secret}' && test ! -e /home/tdwhere/.pi/agent/auth.json && ` +
      `! /tools/node -e "fetch('http://127.0.0.1:${port}').then(()=>process.exit(0),()=>process.exit(1))" && ` +
      `! touch /work/mutation-attempt 2>/dev/null && ! unshare -Ur true 2>/dev/null && ` +
      `! tr '\\0' ' ' </proc/1/cmdline | grep -q bwrap && printf 'ISOLATED\\n'` }),
    call(3, 'read', { path: '/skills/do-it-code-quality/SKILL.md' }),
    { type: 'message', id: 'm4', role: 'assistant', content: [{ type: 'output_text', text: 'Offline probe complete.', annotations: [] }] }
  ];
  let dispatched = 0;
  const gate = await createGateway({ socket, dir: records, limit: 5, provider: async body => {
    assert.doesNotMatch(body.toString('utf8'), new RegExp(marker));
    return { status: 200, body: asStream(scriptedSse(commands[dispatched], ++dispatched)) };
  } });
  try {
    const result = await runSandbox({ engine, node: process.execPath, work, job,
      skills: path.join(root, 'skills/do-it'), socket, bootstrap: path.join(root, 'hooks/data/core-context.txt'),
      stdout: path.join(dir, 'stdout'), stderr: path.join(dir, 'stderr'), timeoutMs: 20_000 });
    const stdout = fs.readFileSync(path.join(dir, 'stdout'), 'utf8');
    const stderr = fs.readFileSync(path.join(dir, 'stderr'), 'utf8');
    assert.deepEqual(result, { code: 0, signal: null, timedOut: false }, stderr);
    assert.equal(dispatched, 4); assert.equal(hostConnections, 0);
    assert.match(stdout, /ISOLATED/); assert.match(stdout, /Trace the live behavior/);
    assert.match(stdout, /Offline probe complete/); assert.doesNotMatch(stdout, new RegExp(marker));
    const events = stdout.trim().split('\n').map(JSON.parse).flatMap(row => row.event ? [row.event] : []);
    const denied = events.find(event => event.type === 'tool_execution_end' && event.toolCallId === 'c1|f1');
    assert.equal(denied?.isError, true, 'real read tool must reject the host holdout path');
    assert.deepEqual(rows(records).map(row => row.event), Array.from({ length: 4 }, () => ['reserved', 'completed']).flat());
  } finally {
    await gate.close(); await new Promise(resolve => network.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
