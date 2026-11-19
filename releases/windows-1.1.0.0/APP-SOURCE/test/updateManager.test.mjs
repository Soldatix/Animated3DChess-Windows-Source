import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {compareVersions,getLatestVersion,evaluateUpdate,parts} from '../src/updateManagerCore.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const latest=JSON.parse(read('public/chess-updates.json'));
test('semantic versions compare numerically',()=>{
 assert.equal(compareVersions('1.10.0','1.9.9'),1);
 assert.equal(compareVersions('1.1.0','1.1.0'),0);
 assert.equal(compareVersions('1.1.0','1.2.0'),-1);
});
test('strict versions reject malformed or pre-release fields',()=>{
 for(const s of ['1.1','1.1.0-beta','1.01.0','Infinity.1.2','1.2.3.4','1.2.9007199254740992'])assert.throws(()=>parts(s));
});
test('manifest validation and per-channel comparison',()=>{
 for(const c of ['web','pwa','microsoft-store'])assert.equal(getLatestVersion(latest,c),'1.0.0');
 assert.equal(evaluateUpdate({latest:'1.1.0',current:'1.0.0'}),true);
 assert.equal(evaluateUpdate({latest:'1.0.0',current:'1.0.0'}),false);
 assert.equal(evaluateUpdate({latest:'1.0.0',current:'1.0.0',waiting:true}),true);
 assert.throws(()=>getLatestVersion({...latest,product:'other'},'web'));
 assert.throws(()=>getLatestVersion(latest,'unknown'));
});
test('no false automatic activation in generated PWA service worker',()=>{
 const b=read('scripts/build-pwa.mjs');
 assert.match(b,/CHESS_APPLY_UPDATE/);
 assert.doesNotMatch(b,/addAll\(SHELL\);await self\.skipWaiting\(\)/);
 assert.match(b,/self\.clients\.claim\(\)/);
});
test('review notice persists after Later; online mode guards apply',()=>{
 const a=read('src/App.tsx'),runtime=read('src/updateManager.mjs');
 assert.match(a,/updateState\.available && !updateState\.dismissed/);
 assert.match(a,/postponeUpdate/);
 assert.match(runtime,/function onlineGameActive/);
 assert.match(runtime,/if\(onlineGameActive\(\)\)/);
 assert.match(runtime,/CHECK_FAILED/);
 assert.match(runtime,/cache:'no-store'/);
 assert.match(runtime,/credentials:'omit'/);
});
test('release version uses existing per-channel versions',()=>{
 const cfg=read('vite.config.ts');
 assert.match(cfg,/tauri\.p3c-prod\.conf\.json/);
 assert.match(cfg,/__CHESS_APP_VERSION__/);
 assert.match(read('src/InfoPanel.tsx'),/CURRENT_VERSION/);
 assert.match(read('src-tauri/src/lib.rs'),/"store" => "https:\/\/apps\.microsoft\.com\/detail\/9mwq5cznlsbd"/);
});
test('five localized labels and manual button',()=>{
 const copy=read('src/updateCopy.mjs'),p=read('src/InfoPanel.tsx');
 for(const code of ['en','hr','de','it','es'])assert.match(copy,new RegExp('^  '+code+':', 'm'));
 assert.match(p,/checkForUpdates\(\{manual:true\}\)/);
 assert.match(p,/onlineMode \|\| update\.busy/);
});
test('desktop CSP permits fixed update manifest host',()=>{
 const j=JSON.parse(read('src-tauri/tauri.p3c-prod.conf.json'));
 assert.match(j.app.security.csp['connect-src'],/https:\/\/chess\.appsandgames\.org/);
});

test('all changed JS sources and generated service worker parse correctly',()=>{
 for(const name of ['scripts/build-pwa.mjs','scripts/desktop-cleanup.mjs','src/pwaInstall.mjs',
   'src/updateCopy.mjs','src/updateManager.mjs','src/updateManagerCore.mjs']){
   const path=new URL('../'+name,import.meta.url);
   const result=spawnSync(process.execPath,['--check',fileURLToPath(path)],{encoding:'utf8'});
   assert.equal(result.status,0,name+': '+result.stderr);
 }
 const b=read('scripts/build-pwa.mjs');
 const token=b.match(/const swTemplate=("[^"\n]*");\nasync function main/s);
 assert.ok(token,'Unable to extract generated service worker template');
 const generated=JSON.parse(token[1]).replace('__VERSION__','testhash').replace('__SHELL__','[]');
 assert.doesNotThrow(()=>new vm.Script(generated));
});
