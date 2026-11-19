import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { smokeAvailability } from './availability-smoke.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
// Each test gets independent Durable Object storage; rate budgets must not leak
// between Wrangler processes on different localhost ports.
const storage = mkdtempSync(join(tmpdir(), 'Chess-TestISO-8793-'));
const worker = spawn(process.execPath, [cli, 'dev', '--local', '--ip', '127.0.0.1', '--port', '8793', '--persist-to', storage], {
  cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'],
});
let logs = '', stopped = false;
worker.stdout.on('data', value => { logs=(logs+value).slice(-10000); });
worker.stderr.on('data', value => { logs=(logs+value).slice(-10000); });
worker.on('exit', () => { stopped=true; });
try {
  let ready=false;
  for (let i=0; i<100; i++) {
    if(stopped) break;
    try {
      const res = await fetch('http://127.0.0.1:8793/health', { signal: AbortSignal.timeout(600) });
      if (res.ok && (await res.json()).service === 'chess-multiplayer') { ready=true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve,300));
  }
  if (!ready) throw Error('P3B2_WORKER_START_FAILED\n'+logs);
  await smokeAvailability();
} catch(error) {
  console.error('P3B2_AVAILABILITY_SMOKE=FAIL');
  console.error(error);
  console.error('WORKER_LOGS:\n'+logs);
  process.exitCode=1;
} finally {
  if (worker.exitCode===null && worker.pid) {
    if (process.platform==='win32') spawnSync('taskkill',['/PID', String(worker.pid), '/T','/F'],{windowsHide:true});
    else worker.kill('SIGTERM');
  }
  // Windows may briefly keep Wrangler files locked after taskkill.
  try { rmSync(storage, {recursive: true, force: true}); }
  catch { console.warn('TEMP_TEST_STORAGE_CLEANUP_DEFERRED'); }
}
