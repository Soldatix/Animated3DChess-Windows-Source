import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { smoke } from './smoke.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
// Each test gets independent Durable Object storage; rate budgets must not leak
// between Wrangler processes on different localhost ports.
const storage = mkdtempSync(join(tmpdir(), 'Chess-TestISO-8788-'));
const server = spawn(process.execPath, [cli, 'dev', '--local', '--ip', '127.0.0.1', '--port', '8788', '--persist-to', storage], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
let stopped = false;
server.stdout.on('data', data => { logs = (logs + data).slice(-10000); });
server.stderr.on('data', data => { logs = (logs + data).slice(-10000); });
server.on('exit', () => { stopped = true; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (stopped) break;
    try {
      const res = await fetch('http://127.0.0.1:8788/health', { signal: AbortSignal.timeout(700) });
      if (res.ok && (await res.json()).service === 'chess-multiplayer') { ready = true; break; }
    } catch { /* Worker still starting */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready || stopped) throw new Error(`LOCAL_WORKER_START_FAILED\n${logs}`);
  await smoke();
} catch (e) {
  console.error('CHESS_MULTIPLAYER_SMOKE=FAIL');
  console.error(e);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null && server.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true });
    } else server.kill('SIGTERM');
  }
  // Windows may briefly keep Wrangler files locked after taskkill.
  try { rmSync(storage, {recursive: true, force: true}); }
  catch { console.warn('TEMP_TEST_STORAGE_CLEANUP_DEFERRED'); }
}
