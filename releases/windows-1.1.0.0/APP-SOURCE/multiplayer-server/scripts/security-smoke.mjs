import assert from 'node:assert/strict';
// Raw protocol-level verification: Node 24's built-in WebSocket client may
// remain in CLOSING while the server has already sent a valid CLOSE frame.
// This verifies the actual frame sent by the local Wrangler Worker instead.
import net from 'node:net';
import {randomBytes, createHash} from 'node:crypto';

async function expectUnauthenticatedCloseFrame(baseUrl, code) {
  const target = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) {
    throw Error('SECURITY_SMOKE_RAW_WS_LOOPBACK_ONLY');
  }
  const port = Number(target.port || '80');
  return new Promise((resolve, reject) => {
    const wsKey = randomBytes(16).toString('base64');
    const accept = createHash('sha1')
      .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    const socket = net.createConnection({host:target.hostname,port});
    let buffer=Buffer.alloc(0), upgraded=false, settled=false, upgradedAt=0;
    const deadline=setTimeout(()=>finish(Error('unauthenticated-close-frame-timeout')),17000);

    function finish(error, result) {
      if (settled) return;
      settled=true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    }
    function maskedControlFrame(opcode, payload) {
      // All client-to-server WebSocket frames must be masked (RFC 6455).
      if (payload.length>125) throw Error('unexpected-large-control-frame');
      const mask=randomBytes(4);
      const frame=Buffer.alloc(6+payload.length);
      frame[0]=0x80|opcode; frame[1]=0x80|payload.length;
      mask.copy(frame,2);
      for(let i=0;i<payload.length;i++)frame[6+i]=payload[i]^mask[i%4];
      return frame;
    }
    socket.on('connect',()=>{
      socket.write([
        `GET /v1/rooms/${code}/connect HTTP/1.1`,
        `Host: ${target.hostname}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 13',
        `Sec-WebSocket-Key: ${wsKey}`,
        '\r\n',
      ].join('\r\n'));
    });
    socket.on('data',chunk=>{
      if(settled)return;
      buffer=Buffer.concat([buffer,chunk]);
      if(!upgraded){
        const end=buffer.indexOf('\r\n\r\n');
        if(end===-1){
          if(buffer.length>16384)finish(Error('raw-upgrade-header-too-large'));
          return;
        }
        const headers=buffer.subarray(0,end).toString('utf8');
        const match=headers.match(/^HTTP\/1\.1 (\d{3})/);
        const answer=headers.match(/^Sec-WebSocket-Accept:\s*(.+)\r?$/im);
        if(match?.[1]!=='101' || answer?.[1]?.trim()!==accept){
          finish(Error('raw-upgrade-101-or-accept-mismatch')); return;
        }
        upgraded=true;upgradedAt=Date.now();
        buffer=buffer.subarray(end+4);
      }
      while(!settled && buffer.length>=2){
        const b0=buffer[0], b1=buffer[1];
        const opcode=b0&15, serverMasked=Boolean(b1&0x80);
        let size=b1&127, offset=2;
        if(size===126){if(buffer.length<4)return;size=buffer.readUInt16BE(2);offset=4;}
        else if(size===127){
          if(buffer.length<10)return;
          const value=buffer.readBigUInt64BE(2);
          if(value>65536n){finish(Error('raw-frame-size-too-large'));return;}
          size=Number(value);offset=10;
        }
        if(serverMasked){finish(Error('raw-server-sent-masked-frame'));return;}
        if(size>65536){finish(Error('raw-frame-size-too-large'));return;}
        if(buffer.length<offset+size)return;
        const payload=buffer.subarray(offset,offset+size);
        buffer=buffer.subarray(offset+size);
        if(opcode===9){ // respond to server ping while waiting
          socket.write(maskedControlFrame(10,payload));
        }else if(opcode===8){
          const closeCode=payload.length>=2?payload.readUInt16BE(0):null;
          const reason=payload.length>2?payload.subarray(2).toString('utf8'):'';
          const elapsedMs=Date.now()-upgradedAt;
          // Send a protocol-compliant masked close acknowledgement.
          try {socket.write(maskedControlFrame(8,payload));}catch{}
          if(closeCode!==1008 || reason!=='auth-timeout'){
            finish(Error(`unexpected-raw-close-code=${closeCode},reason=${reason}`));
          }else if(elapsedMs<8500 || elapsedMs>16000){
            finish(Error(`unexpected-raw-close-timing=${elapsedMs}ms`));
          }else {
            finish(null,{closeCode,reason,elapsedMs});
          }
          return;
        }
      }
    });
    socket.on('error',err=>finish(err));
    socket.on('end',()=>finish(Error('raw-socket-ended-without-close-frame')));
    socket.on('close',()=>finish(Error('raw-socket-closed-without-close-frame')));
  });
}


const BASE = process.env.CHESS_TEST_URL || 'http://127.0.0.1:8789';
async function req(path, method='GET', payload, token) {
  const res = await fetch(BASE + path, {method, headers:{
    ...(payload ? {'content-type':'application/json'} : {}),
    ...(token ? {authorization:'Bearer '+token} : {}),
  }, ...(payload ? {body:JSON.stringify(payload)} : {})});
  return {status:res.status, body:res.status===204 ? null : await res.json(), headers:res.headers};
}

export async function securitySmoke() {
  assert.equal((await req('/health')).status, 200);
  const first = await req('/v1/rooms', 'POST', {preferredColor:'w'});
  assert.equal(first.status, 201, 'create room must still work');
  const {code,token:whiteToken}=first.body;
  const guest = await req(`/v1/rooms/${code}/join`, 'POST');
  assert.equal(guest.status, 200, 'guest must still join');
  assert.notEqual(guest.body.token, whiteToken);

  // After more than the configured capacity, creation is rejected with 429.
  let denied=0;
  for (let n=0;n<12;n++) {
    const r=await req('/v1/rooms','POST',{preferredColor:'b'});
    if(r.status===429) {
      denied++;
      assert.equal(r.body.error,'rate-limited');
      assert.ok(Number(r.headers.get('retry-after'))>=1);
    } else assert.equal(r.status,201, 'unexpected creation error');
  }
  assert.ok(denied>0,'rate limit did not engage');

  // Authenticated connection must stay open after the deadline.
  const authWs = new WebSocket(BASE.replace(/^http/,'ws')+`/v1/rooms/${code}/connect`);
  const authenticated = new Promise((resolve,reject) => {
    const timeout = setTimeout(()=>reject(Error('authenticated-websocket-timeout')),7000);
    authWs.addEventListener('open',()=>authWs.send(JSON.stringify({type:'auth',token:whiteToken})),{once:true});
    authWs.addEventListener('message',event=>{
      try { if(JSON.parse(event.data).type==='authenticated') {clearTimeout(timeout);resolve();} }catch{}
    });
    authWs.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('authenticated-websocket-error'));},{once:true});
  });
  await authenticated;
  // Probe with a raw local TCP WebSocket client. Node 24 built-in WebSocket
  // may remain CLOSING and omit the close event even after a valid wire CLOSE.
  const observedClose = await expectUnauthenticatedCloseFrame(BASE,code);
  assert.equal(observedClose.closeCode,1008);
  console.log(`P3A_RAW_CLOSE_FRAME=PASS code=${observedClose.closeCode} reason=${observedClose.reason} elapsed_ms=${observedClose.elapsedMs}`);
  assert.equal(authWs.readyState, WebSocket.OPEN, 'authenticated WebSocket must stay open');
  authWs.close(1000, 'smoke-done');
  assert.equal((await req(`/v1/rooms/${code}/state`, 'GET', null, whiteToken)).status,200);
  console.log('P3A_RATE_LIMIT_AND_AUTH_TIMEOUT_SMOKE=PASS');
  console.log('POST_CREATE_JOIN_AND_EXISTING_SEAT_STILL_WORK=PASS');
}
