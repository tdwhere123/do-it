import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A local authorized publication can precede its tag push. Accept only the
// identical immutable artifact, never an unrelated release with the same version.
export function publishPackage(tarball, metadataPath, { run = spawnSync, env = process.env } = {}) {
  const { name, version } = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const spec = `${name}@${version}`;
  const expected = `sha512-${createHash('sha512').update(fs.readFileSync(tarball)).digest('base64')}`;
  const options = { env, encoding: 'utf8' };
  const lookup = run('npm', ['view', spec, 'dist.integrity', '--json'], options);
  if (lookup.status === 0) {
    if (JSON.parse(lookup.stdout) !== expected) {
      throw new Error(`${spec} already exists with different artifact bytes; refusing publication`);
    }
    return `${spec} already published; artifact integrity matches`;
  }
  if (lookup.error || lookup.signal || !/\bcode E404\b/.test(lookup.stderr ?? '')) {
    throw new Error(`Cannot determine registry state for ${spec}; publication not attempted`);
  }
  if (!env.NODE_AUTH_TOKEN) throw new Error('NPM_TOKEN secret is required for a new publication');
  const result = run('npm', ['publish', tarball, '--access', 'public', '--ignore-scripts'], options);
  if (result.status !== 0) throw new Error(`Publication failed for ${spec}: ${result.stderr ?? result.error?.message ?? result.signal}`);
  return result.stdout;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Expected tarball and package.json paths');
    console.log(publishPackage(process.argv[2], process.argv[3]));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
