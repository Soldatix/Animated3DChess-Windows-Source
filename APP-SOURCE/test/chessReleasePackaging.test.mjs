import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const headers=read('public/_headers');
const build=read('scripts/build-pwa.mjs');
const plan=read('docs/RELEASE-V1-PLAYBOOK.md');
test('Cloudflare HTML and SW are not long-lived cached',()=>{
 for(const path of ['/sw.js','/manifest.webmanifest','/index.html']){
  assert.match(headers,new RegExp('\\n'+path.replaceAll('/','\\/')+'\\n  Cache-Control: no-cache, max-age=0, must-revalidate'));
 }
});
test('SW revision hashes shell file content, not only path strings',()=>{
 assert.match(build,/revisionHasher\.update\(p\)/);
 assert.match(build,/revisionHasher\.update\(await readFile\(path\.join\(dist,p\.slice\(1\)\)\)\)/);
 assert.doesNotMatch(build,/createHash\('sha256'\)\.update\(JSON\.stringify\(shell\)\)/);
});
test('Cloudflare header keeps non-hashed model and vendor URLs bounded',()=>{
 assert.match(headers,/\/assets\/glb\/\*/);
 assert.match(headers,/\/vendor\/stockfish-19\.0\.1\/\*/);
 assert.doesNotMatch(headers,/immutable/);
});
test('Release plan stays staging-only and requires a verified HTTPS target',()=>{
 assert.match(plan,/LOCAL SOURCE STAGING/);
 assert.match(plan,/candidate, not verified, not configured/);
 assert.match(plan,/explicit operator approval/);
});
test('Release plan documents JS and no-JS portal integration separately',()=>{
 assert.match(plan,/index\.html/);
 assert.match(plan,/script\.js/);
 assert.match(plan,/wizard-chess-3d\.html/);
});
