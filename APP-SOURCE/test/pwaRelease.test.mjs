import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const m=JSON.parse(read('public/manifest.webmanifest'));
const p=read('src/pwaInstall.mjs'),b=read('scripts/build-pwa.mjs');
test('manifest standalone and root scope',()=>{
 assert.equal(m.display,'standalone');assert.equal(m.scope,'/');assert.equal(m.start_url,'/');
});
test('PNG 192 and 512 install icons with maskable purpose',()=>{
 for(const n of [192,512])assert.ok(m.icons.some(i=>i.sizes===n+'x'+n&&
 i.type==='image/png'&&i.purpose.includes('maskable')));
});
test('HTML manifest and icon',()=>{
 const h=read('index.html');
 assert.match(h,/rel="manifest" href="\/manifest.webmanifest"/);
 assert.match(h,/rel="icon" href="\/icons\/chess.svg"/);
});
test('Vite entrypoint imports install UI',()=>assert.match(read('src/main.tsx'),/import '\.\/pwaInstall\.mjs'/));
test('native PWA install lifecycle',()=>{
 for(const token of ['beforeinstallprompt','appinstalled','e.prompt()','e.userChoice'])
 assert.ok(p.includes(token),token);
});
test('install=web and standalone detection',()=>{
 assert.match(p,/get\('install'\)==='web'/);
 assert.match(p,/display-mode: standalone/);
});
test('all five languages have localized installation UI',()=>{
 for(const code of ['en','hr','de','it','es'])assert.ok(p.includes(code+':{title:'),code);
});
test('browser fallback exists',()=>{
 for(const token of ['showHelp','ios','fallback','closed=true'])
 assert.ok(p.includes(token),token);
});
test('production-only SW registration, no dev worker',()=>{
 assert.match(p,/import\.meta\.env\.PROD/);
 assert.match(p,/navigator\.serviceWorker\.register\('\/sw\.js'/);
});
test('self-contained PNG generation',()=>{
 assert.match(b,/deflateSync/);assert.match(b,/for\(const size of \[192,512\]\)/);
});
test('versioned UI and essential GLB cache',()=>{
 assert.match(b,/models\.length<7/);
 assert.match(b,/glb\.gz\.b64/);
 assert.match(b,/addAll\(SHELL\)/);
});
test('Stockfish runtime cache and API requests omitted',()=>{
 assert.match(b,/vendor\/stockfish-19\.0\.1/);
 assert.match(b,/u\.origin!==self\.location\.origin/);
 assert.match(b,/pathname\.startsWith\('\/api\/'\)/);
});
test('Windows npm build produces PWA assets',()=>{
 assert.match(JSON.parse(read('package.json')).scripts.build,/vite build && node scripts\/build-pwa\.mjs/);
});
test('install banner can be dismissed',()=>assert.match(read('src/pwaInstall.css'),/\.wc-pwa-panel\[hidden\]/));
