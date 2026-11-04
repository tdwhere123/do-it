// A single-process, fail-closed generation gateway. No provider request may be
// made by a worker except through this socket; the sandbox has no network.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha256 = data => createHash('sha256').update(data).digest('hex');

function durableWrite(file, data) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const dirfd = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
}

function appendLedger(file, row) {
  const fd = fs.openSync(file, 'a', 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(row)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

/** `provider` receives only a validated request body, never client headers. */
export async function createGateway({ socket, dir, limit, provider }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 90) throw new Error('invalid budget');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ledger = path.join(dir, 'ledger.jsonl');
  // Never restart an experiment: a reserved but unfinished request is unknown.
  durableWrite(ledger, '');
  let count = 0, failure = null, inflight = 0;
  const fail = reason => { failure ??= reason; };
  const server = http.createServer(async (req, res) => {
    let reserved = 0, active = false;
    try {
      if (failure) throw new Error('gateway stopped');
      if (req.method !== 'POST' || req.url !== '/responses') throw new Error('invalid gateway route');
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw new Error('request too large');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const parsed = JSON.parse(body.toString('utf8'));
      if (parsed.model !== 'grok-4.6' || parsed.reasoning?.effort !== 'xhigh' || parsed.stream !== true) {
        throw new Error('unexpected model, effort, or stream setting');
      }
      if (inflight !== 0) throw new Error('concurrent provider calls are disabled');
      if (count >= limit) throw new Error('generation budget exhausted');
      // Everything needed to reconstruct the request is durable before dispatch.
      reserved = ++count;
      const stem = String(reserved).padStart(3, '0');
      durableWrite(path.join(dir, `${stem}.request.json`), body);
      appendLedger(ledger, { event: 'reserved', request: reserved, sha256: sha256(body), at: new Date().toISOString() });
      inflight++; active = true;
      const upstream = await provider(body);
      if (!Number.isInteger(upstream.status) || !upstream.body) throw new Error('invalid upstream response');
      const responseFile = fs.openSync(path.join(dir, `${stem}.response`), 'wx', 0o600);
      const hash = createHash('sha256');
      let bytes = 0;
      try {
        res.writeHead(upstream.status, { 'content-type': upstream.contentType ?? 'text/event-stream' });
        for await (const chunk of upstream.body) {
          const data = Buffer.from(chunk);
          fs.writeFileSync(responseFile, data);
          hash.update(data); bytes += data.length;
          if (!res.write(data)) await new Promise((resolve, reject) => {
            const done = () => { res.off('close', closed); resolve(); };
            const closed = () => { res.off('drain', done); reject(new Error('worker connection closed')); };
            res.once('drain', done); res.once('close', closed);
          });
        }
        fs.fsyncSync(responseFile);
      } finally { fs.closeSync(responseFile); }
      const ok = upstream.status >= 200 && upstream.status < 300;
      appendLedger(ledger, { event: ok ? 'completed' : 'failed', request: reserved, status: upstream.status,
        sha256: hash.digest('hex'), bytes, at: new Date().toISOString() });
      if (!ok) fail(`provider HTTP ${upstream.status}`);
      res.end();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      fail(reason);
      if (reserved) {
        try { appendLedger(ledger, { event: 'unknown', request: reserved, reason, at: new Date().toISOString() }); }
        catch { /* Failure remains latched; no later dispatch is allowed. */ }
      }
      if (!res.headersSent) res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('generation gateway stopped');
    } finally { if (active) inflight--; }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
  return {
    status: () => ({ count, failure, inflight }),
    stop: reason => fail(reason),
    async close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  };
}

// Explicit token validity only; no refresh or write to the host's auth store.
export function xaiProviderFromCredential(credential, requestImpl = https.request) {
  return async body => {
    if (credential?.type !== 'oauth' || !credential.access || !Number.isFinite(credential.expires) || credential.expires <= Date.now()) {
      throw new Error('xai OAuth access token unavailable or expired; refresh is not authorized here');
    }
    // Native https.request neither retries nor follows redirects. A POST is
    // therefore exactly one possible generation per durable reservation.
    return await new Promise((resolve, reject) => {
      const req = requestImpl('https://api.x.ai/v1/responses', {
        method: 'POST', agent: false, signal: AbortSignal.timeout(15 * 60 * 1000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${credential.access}` }
      }, response => resolve({ status: response.statusCode, contentType: response.headers['content-type'], body: response }));
      req.once('error', reject);
      req.end(body);
    });
  };
}
