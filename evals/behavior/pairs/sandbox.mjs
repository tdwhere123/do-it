import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Stage paths are opaque and equally shaped for both prompt bodies. Only the
// socket, common bootstrap, SDK dependencies, one skill tree, and one task
// workspace are visible; /proc, /tmp, HOME, and networking are private.
export function sandboxArgs({ engine, node, work, job, skills, socket, bootstrap }) {
  return [
    '--unshare-all', '--unshare-user', '--disable-userns', '--as-pid-1', '--die-with-parent', '--new-session',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
    '--dir', '/tools', '--ro-bind', node, '/tools/node',
    '--ro-bind', engine, '/engine/node_modules',
    '--ro-bind', path.join(here, 'worker.mjs'), '/engine/worker.mjs',
    '--ro-bind', skills, '/skills', '--ro-bind', job, '/job', '--ro-bind', work, '/work',
    '--dir', '/bridge', '--ro-bind', socket, '/bridge/api.sock',
    '--ro-bind', bootstrap, '/bridge/bootstrap.txt',
    '--tmpfs', '/agent', '--tmpfs', '/tmp', '--proc', '/proc', '--dev', '/dev',
    '--clearenv', '--setenv', 'HOME', '/agent', '--setenv', 'PATH', '/tools:/usr/bin:/bin',
    '--setenv', 'PI_CODING_AGENT_DIR', '/agent', '--setenv', 'PI_OFFLINE', '1',
    '--chdir', '/work', '/tools/node', '/engine/worker.mjs'
  ];
}

export async function runSandbox(options) {
  const out = fs.openSync(options.stdout, 'wx', 0o600);
  const err = fs.openSync(options.stderr, 'wx', 0o600);
  const child = spawn('bwrap', sandboxArgs(options), { stdio: ['ignore', out, err] });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeoutMs ?? 30 * 60 * 1000);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal, timedOut }));
    });
    fs.fsyncSync(out); fs.fsyncSync(err);
    return result;
  } finally { clearTimeout(timer); fs.closeSync(out); fs.closeSync(err); }
}
