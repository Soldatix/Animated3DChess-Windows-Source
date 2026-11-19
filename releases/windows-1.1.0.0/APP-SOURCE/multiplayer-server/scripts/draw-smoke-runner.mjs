import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { smoke } from './draw-smoke.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const storage = mkdtempSync(join(tmpdir(), 'Chess-P3B4-8793-'));
const worker = spawn(process.execPath,[cli,'dev','--local','--ip','127.0.0.1','--port','8793','--persist-to',storage],{
  cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
});
let logs='', stopped=false;
for(const stream of [worker.stdout,worker.stderr]) stream.on('data',x=>{logs=(logs+x).slice(-12000);});
worker.on('exit',()=>{stopped=true;});
try {
  let ready=false;
  for(let i=0;i<100;i++){
    if(stopped)break;
    try {
      const res=await fetch('http://127.0.0.1:8793/health',{signal:AbortSignal.timeout(700)});
      if(res.ok&&(await res.json()).service==='chess-multiplayer'){ready=true;break;}
    } catch {}
    await new Promise(r=>setTimeout(r,300));
  }
  if(!ready||stopped)throw new Error('P3B4_WORKER_START_FAILED '+logs);
  await smoke();
} catch(e) {
  console.error('P3B4_DRAW_RULES_SMOKE=FAIL',e);
  console.error('WORKER_LOGS:',logs);
  process.exitCode=1;
} finally {
  if(worker.exitCode===null&&worker.pid){
    if(process.platform==='win32')spawnSync('taskkill',['/PID',String(worker.pid),'/T','/F'],{windowsHide:true});
    else worker.kill('SIGTERM');
  }
  try{rmSync(storage,{recursive:true,force:true});}
  catch{console.warn('P3B4_TEMP_TEST_STORAGE_CLEANUP_DEFERRED');}
}
