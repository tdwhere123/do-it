#!/usr/bin/env node
// Offline only: freeze real source excerpts, prompts, held-out rubric, and the
// two unmodified canonical skill trees. Never starts a model or reads auth.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const integrity = 'c2ef947891161ad24d9653f6e8153a97558900da903f6c5657acb5ea7a6c150031845bfcd95042315f0d01ed3147c2b2f19eb0b3df703c4c0ab3b0fa6ea5f256';
const source = {
  identity: { commit: '48a0f47e06398c2442542e5c34e5fb391a684339', paths: ['hooks', 'plugins/do-it-pi/extensions'] },
  retirement: { commit: '41b58afbcd86164072daa45663d86839fc8dfc47', paths: [
    'install', 'agents', 'manifest.json', 'scripts/lib/manifest-extras.mjs', 'scripts/lib/user-home.mjs',
    'scripts/lib/cursor-user-hooks.mjs', 'scripts/lib/cursor-plugin-fs.mjs', 'scripts/register-cursor-plugin.mjs'
  ] },
  evidence: { commit: '3d192261c100ecbc967b6863391dec18e2cd8d3f', paths: [
    'evals/behavior/judge.mjs', 'evals/behavior/validate.mjs', 'evals/behavior/hosts/trajectory.mjs'
  ] }
};
const candidate = '7aa5c2220019ef0dbad654deb4bbb18b487a0324';
const hash = (algorithm, data) => createHash(algorithm).update(data).digest('hex');

function command(program, args, options = {}) {
  const run = spawnSync(program, args, { cwd: repo, maxBuffer: 64 * 1024 * 1024, ...options });
  if (run.status !== 0) throw new Error(`${program} failed: ${run.stderr?.toString('utf8')}`);
  return run.stdout;
}
function archive(commit, paths, destination) {
  const tar = command('git', ['archive', commit, ...paths]);
  fs.mkdirSync(destination, { recursive: true });
  command('tar', ['-x', '-C', destination], { input: tar });
}
function files(root) {
  const result = {};
  function visit(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name, abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs, rel);
      else if (entry.isFile()) result[rel] = hash('sha256', fs.readFileSync(abs));
      else throw new Error(`unexpected non-file input: ${rel}`);
    }
  }
  visit(root); return result;
}

export function prepare(runDir, tarball) {
  const bytes = fs.readFileSync(tarball);
  if (hash('sha512', bytes) !== integrity) throw new Error('published tarball integrity mismatch');
  fs.mkdirSync(runDir); // refuses to overwrite historical or partial evidence
  const artifacts = path.join(runDir, 'inputs');
  fs.mkdirSync(artifacts);
  const published = path.join(artifacts, 'published');
  fs.mkdirSync(published);
  command('tar', ['-xzf', path.resolve(tarball), '-C', published, 'package/skills/do-it', 'package/package.json']);
  const pkg = JSON.parse(fs.readFileSync(path.join(published, 'package/package.json'), 'utf8'));
  if (pkg.name !== '@tdwhere/do-it' || pkg.version !== '0.18.1') throw new Error('published package identity mismatch');
  const candidateDir = path.join(artifacts, 'candidate');
  archive(candidate, ['skills/do-it'], candidateDir);
  const cases = path.join(artifacts, 'cases');
  for (const [name, spec] of Object.entries(source)) {
    const root = path.join(cases, name);
    archive(spec.commit, spec.paths, root);
    if (name === 'retirement') {
      // Hide a release identifier that could reveal a prompt condition. This
      // read-only task does not execute the installer; all other bytes survive.
      const file = path.join(root, 'manifest.json');
      const original = fs.readFileSync(file, 'utf8');
      if ((original.match(/0\.18\.1/g) ?? []).length !== 2) throw new Error('unexpected manifest release references');
      const replaced = original.replaceAll('0.18.1', 'snapshot');
      fs.writeFileSync(file, replaced);
    }
  }
  fs.cpSync(path.join(here, 'prompts'), path.join(artifacts, 'prompts'), { recursive: true });
  fs.copyFileSync(path.join(here, 'rubric.md'), path.join(artifacts, 'rubric.md'));
  fs.writeFileSync(path.join(artifacts, 'bootstrap.txt'), command('git', ['show', `${candidate}:hooks/data/core-context.txt`]));
  // The package manifest is evidence only, not part of worker inputs.
  const inputHashes = files(artifacts);
  for (const file of Object.keys(inputHashes)) {
    if (file.startsWith('cases/') && /(?:^|\/)(?:AGENTS\.md|expected|rubrics?)(?:\/|$)/i.test(file)) {
      throw new Error(`forbidden case input: ${file}`);
    }
  }
  const record = { schema: 'do-it/behavior-pairs-inputs/v1', created: new Date().toISOString(),
    candidate, source, published: { name: pkg.name, version: pkg.version,
      tarball: 'https://registry.npmjs.org/@tdwhere/do-it/-/do-it-0.18.1.tgz', sha512: integrity,
      npmIntegrity: 'sha512-wu+UeJEWGtJNllP26BU6l1WJANqQP2xWV6y16npsFQAxhFv82VBCMV8NAe0xR8Ky8Z6ws99wPEwKs7D6bqXyVg==' },
    transformation: 'two retirement manifest release references replaced with snapshot; read-only source study',
    files: inputHashes };
  const recordPath = path.join(runDir, 'inputs.json');
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return { fileCount: Object.keys(inputHashes).length, inputManifestSha256: hash('sha256', fs.readFileSync(recordPath)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('usage: node prepare.mjs NEW_RUN_DIR PUBLISHED_TARBALL');
  console.log(JSON.stringify(prepare(path.resolve(process.argv[2]), path.resolve(process.argv[3]))));
}
