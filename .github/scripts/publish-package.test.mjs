import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { publishPackage } from './publish-package.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-publish-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tarball = path.join(dir, 'release.tgz'), metadata = path.join(dir, 'package.json');
  fs.writeFileSync(tarball, 'verified bytes');
  fs.writeFileSync(metadata, JSON.stringify({ name: '@tdwhere/do-it', version: '0.19.0' }));
  const integrity = `sha512-${createHash('sha512').update('verified bytes').digest('base64')}`;
  return { tarball, metadata, integrity };
}

test('an identical release skips publication without a token', t => {
  const f = fixture(t), calls = [];
  const result = publishPackage(f.tarball, f.metadata, { env: {}, run: (...args) => {
    calls.push(args); return { status: 0, stdout: JSON.stringify(f.integrity) };
  } });
  assert.match(result, /integrity matches/); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ['view', '@tdwhere/do-it@0.19.0', 'dist.integrity', '--json']);
});

for (const lookup of [
  { status: 0, stdout: '"sha512-different"' },
  { status: 0, stdout: '{}' },
  { status: 0, stdout: 'bad JSON' },
  { status: 1, stderr: 'npm error code E403' },
  { status: null, signal: 'SIGTERM', stderr: 'npm error code E404' }
]) test(`uncertain or conflicting registry state cannot publish: ${JSON.stringify(lookup)}`, t => {
  const f = fixture(t); let calls = 0;
  assert.throws(() => publishPackage(f.tarball, f.metadata, { env: { NODE_AUTH_TOKEN: 'test-only' },
    run: () => { calls++; return lookup; } }));
  assert.equal(calls, 1);
});

test('only an explicit missing version and token allow one publish', t => {
  const f = fixture(t), calls = [];
  const run = (...args) => { calls.push(args); return calls.length === 1
    ? { status: 1, stderr: 'npm error code E404' } : { status: 0, stdout: 'published' }; };
  assert.equal(publishPackage(f.tarball, f.metadata, { run, env: { NODE_AUTH_TOKEN: 'test-only' } }), 'published');
  assert.deepEqual(calls[1][1], ['publish', f.tarball, '--access', 'public', '--ignore-scripts']);
  assert.throws(() => publishPackage(f.tarball, f.metadata, { env: {},
    run: () => ({ status: 1, stderr: 'npm error code E404' }) }), /NPM_TOKEN/);
});

test('publication errors remain failures', t => {
  const f = fixture(t); let calls = 0;
  assert.throws(() => publishPackage(f.tarball, f.metadata, { env: { NODE_AUTH_TOKEN: 'test-only' },
    run: () => ++calls === 1 ? { status: 1, stderr: 'npm error code E404' }
      : { status: 1, stderr: 'publish refused' } }), /publish refused/);
  assert.equal(calls, 2);
});
