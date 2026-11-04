// This process runs only inside the isolated worker namespace. The gateway is
// its sole possible generation route; the token and holdout are never mounted.
import fs from 'node:fs';
import http from 'node:http';
import { Readable } from 'node:stream';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '/engine/node_modules/@earendil-works/pi-coding-agent/dist/index.js';

globalThis.fetch = async (url, init = {}) => {
  if (String(url) !== 'https://api.x.ai/v1/responses' || init.method !== 'POST') {
    throw new Error('network boundary rejected request');
  }
  return await new Promise((resolve, reject) => {
    const request = http.request({ socketPath: '/bridge/api.sock', path: '/responses', method: 'POST',
      headers: { 'content-type': 'application/json' } }, response => {
      resolve(new Response(Readable.toWeb(response), { status: response.statusCode, headers: response.headers }));
    });
    request.on('error', reject);
    if (init.signal) {
      if (init.signal.aborted) request.destroy(new Error('aborted'));
      else init.signal.addEventListener('abort', () => request.destroy(new Error('aborted')), { once: true });
    }
    request.end(init.body);
  });
};
const cwd = '/work', agentDir = '/agent';
fs.writeFileSync(`${agentDir}/auth.json`, JSON.stringify({ xai: { type: 'api_key', key: 'proxy-only' } }));
fs.writeFileSync(`${agentDir}/settings.json`, JSON.stringify({
  retry: { enabled: false, provider: { maxRetries: 0 } }, compaction: { enabled: false }, cacheWarming: 'off'
}));
const runtime = await ModelRuntime.create({ authPath: `${agentDir}/auth.json`, modelsPath: null, allowModelNetwork: false });
const model = runtime.getModel('xai', 'grok-4.6');
if (!model || model.provider !== 'xai' || model.id !== 'grok-4.6') throw new Error('fixed model missing');
const settings = SettingsManager.create(cwd, agentDir);
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: settings,
  noContextFiles: true, noExtensions: true, noPromptTemplates: true,
  additionalSkillPaths: ['/skills'], appendSystemPrompt: ['/bridge/bootstrap.txt'] });
await loader.reload();
const errors = loader.getSkills().diagnostics.filter(diagnostic => diagnostic.type === 'error');
if (errors.length) throw new Error(`skill discovery failed: ${JSON.stringify(errors)}`);
const { session } = await createAgentSession({ cwd, agentDir, model, thinkingLevel: 'xhigh',
  modelRuntime: runtime, resourceLoader: loader, settingsManager: settings, sessionManager: SessionManager.inMemory() });
session.subscribe(event => {
  if (['tool_execution_start', 'tool_execution_end', 'message_end'].includes(event.type)) {
    console.log(JSON.stringify({ event }));
  }
});
try {
  await session.prompt(fs.readFileSync('/job/prompt.txt', 'utf8'));
  const assistant = [...session.messages].reverse().find(message => message.role === 'assistant');
  console.log(JSON.stringify({ final: session.messages, thinking: session.thinkingLevel }));
  if (!assistant || ['error', 'aborted', 'length'].includes(assistant.stopReason)) process.exitCode = 1;
} finally { session.dispose(); }
