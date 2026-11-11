// Build-only, dependency-free PNG + offline service-worker generator. Never runs in Vite dev.
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {readdir,readFile,stat,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
function png(size){
 const stride=1+4*size,raw=Buffer.alloc(stride*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const X=x/size,Y=y/size;
   const outer=X>.09&&X<.91&&Y>.09&&Y<.91;
   const rook=(X>.26&&X<.74&&Y>.69&&Y<.77)||(X>.31&&X<.69&&Y>.61&&Y<.70)||
    (X>.35&&X<.65&&Y>.33&&Y<.62)||
    ((X>.30&&X<.41||X>.45&&X<.55||X>.59&&X<.70)&&Y>.24&&Y<.37);
   const window=X>.477&&X<.523&&Y>.44&&Y<.58;
   const color=rook&&!window?[245,209,126]:outer?[29,43,56]:[16,23,32];
   const at=y*stride+1+x*4;
   raw[at]=color[0];raw[at+1]=color[1];raw[at+2]=color[2];raw[at+3]=255;
 }
 const crc32=b=>{let c=0xFFFFFFFF;for(const v of b){c^=v;
   for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xEDB88320:0);}return (c^0xFFFFFFFF)>>>0;};
 const chunk=(name,data)=>{const t=Buffer.from(name),len=Buffer.alloc(4),crc=Buffer.alloc(4);
   len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));
   return Buffer.concat([len,t,data,crc]);};
 const ih=Buffer.alloc(13);ih.writeUInt32BE(size);ih.writeUInt32BE(size,4);ih[8]=8;ih[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),
   chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
async function walk(dir,base=''){
 const out=[];for(const e of await readdir(dir,{withFileTypes:true})){
   const n=path.posix.join(base,e.name);
   if(e.isDirectory())out.push(...await walk(path.join(dir,e.name),n));
   else if(e.isFile())out.push(n);
 }return out;
}
const swTemplate="// Generated after each production Vite build. Never cache remote/API requests.\nconst VERSION='__VERSION__',SHELL=__SHELL__;\nconst CORE='wizard-chess-shell-'+VERSION,RUNTIME='wizard-chess-runtime-'+VERSION;\nself.addEventListener('install',event=>{\n event.waitUntil((async()=>{await (await caches.open(CORE)).addAll(SHELL);await self.skipWaiting();})());\n});\nself.addEventListener('activate',event=>{\n event.waitUntil((async()=>{\n   const keys=await caches.keys();\n   await Promise.all(keys.filter(k=>k.startsWith('wizard-chess-')&&k!==CORE&&k!==RUNTIME).map(k=>caches.delete(k)));\n   await self.clients.claim();\n })());\n});\nasync function cacheFirst(request,event){\n const core=await caches.open(CORE),fromCore=await core.match(request);\n if(fromCore)return fromCore;\n const cache=await caches.open(RUNTIME),existing=await cache.match(request);\n if(existing)return existing;\n const response=await fetch(request);\n if(response.ok)event.waitUntil(cache.put(request,response.clone()).catch(()=>{}));\n return response;\n}\nself.addEventListener('fetch',event=>{\n const r=event.request;if(r.method!=='GET')return;\n const u=new URL(r.url);\n if(u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;\n if(r.mode==='navigate'){\n   event.respondWith(fetch(r).catch(async()=>{\n   const cached=await (await caches.open(CORE)).match('/index.html');\n   if(!cached)return Response.error();\n   // Cloudflare Pages may redirect /index.html to /; redirected cache responses are unsafe for navigate requests.\n   return cached.redirected?new Response(await cached.blob(),{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}}):cached;\n }));\n   return;\n }\n const p=u.pathname;\n if(SHELL.includes(p)||p.startsWith('/assets/glb/')||p.startsWith('/vendor/stockfish-19.0.1/'))\n   event.respondWith(cacheFirst(r,event));\n});\n";
async function main(){
 await readFile(path.join(dist,'index.html'));
 const iconDir=path.join(dist,'icons');await mkdir(iconDir,{recursive:true});
 for(const size of [192,512])await writeFile(path.join(iconDir,'chess-'+size+'.png'),png(size));
 const assets=(await walk(path.join(dist,'assets'))).filter(x=>/\.(js|css|woff2?)$/.test(x))
  .map(x=>'/assets/'+x);
 const models=(await walk(path.join(dist,'assets','glb'))).filter(x=>x.endsWith('.glb.gz.b64'))
  .map(x=>'/assets/glb/'+x);
 if(models.length<7)throw Error('PWA offline release blocked: missing essential chess 3D models');
 const modelStats=await Promise.all(models.map(p=>stat(path.join(dist,p.slice(1)))));
 const modelBytes=modelStats.reduce((n,s)=>n+s.size,0);
 if(modelBytes>90*1048576)throw Error('PWA model budget exceeded (90MiB); optimize before release');
 const shell=['/index.html','/manifest.webmanifest','/icons/chess-192.png','/icons/chess-512.png',
   ...assets,...models];
 for(const p of shell)await stat(path.join(dist,p.slice(1)));
 const revisionHasher=createHash('sha256');
 for(const p of shell){
   revisionHasher.update(p);
   revisionHasher.update(await readFile(path.join(dist,p.slice(1))));
 }
 const revision=revisionHasher.digest('hex').slice(0,16);
 const sw=swTemplate.replace('__VERSION__',revision).replace('__SHELL__',JSON.stringify(shell));
 await writeFile(path.join(dist,'sw.js'),sw);
 console.log('PWA_BUILD=PASS; core models='+models.length+'; modelMiB='+
  (modelBytes/1048576).toFixed(2)+'; Stockfish runtime-cache only; revision='+revision);
}
main().catch(e=>{console.error('PWA_BUILD=FAIL',e);process.exitCode=1;});
