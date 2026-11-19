import assert from 'node:assert/strict';
const BASE='http://127.0.0.1:8793';
async function api(path, method='GET', body=undefined, token=undefined){
  const response=await fetch(BASE+path,{method,headers:{
    ...(body !== undefined ? {'content-type':'application/json'} : {}),
    ...(token ? {authorization:`Bearer ${token}`} : {}),
  }, ...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
}
async function create(){
  const host=await api('/v1/rooms','POST',{preferredColor:'w'});
  assert.equal(host.status,201);
  const guest=await api(`/v1/rooms/${host.data.code}/join`,'POST');
  assert.equal(guest.status,200);
  return {code:host.data.code,white:host.data.token,black:guest.data.token};
}
async function move(session, ply, uci){
  const token=ply%2===0?session.white:session.black;
  const r=await api(`/v1/rooms/${session.code}/move`,'POST',{
    clientMoveId:'p3b4_'+ply.toString().padStart(8,'0'),expectedPly:ply,
    from:uci.slice(0,2),to:uci.slice(2,4),
  },token);
  assert.equal(r.status,200, `${uci}: ${JSON.stringify(r.data)}`);
  return r.data.room;
}
export async function smoke(){
  const first=await create();
  let room;
  const seq=['g1f3','g8f6','f3g1','f6g8'];
  for(let i=0;i<8;i++)room=await move(first,i,seq[i%4]);
  assert.equal(room.status,'playing');
  assert.equal(room.claimableDraw.threefold,true);
  const wrongSide=await api(`/v1/rooms/${first.code}/claim-draw`,'POST',{},first.black);
  assert.equal(wrongSide.status,409);
  const success=await api(`/v1/rooms/${first.code}/claim-draw`,'POST',{},first.white);
  assert.equal(success.status,200);
  assert.equal(success.data.room.status,'finished');
  assert.equal(success.data.room.result.reason,'threefold');
  assert.equal(success.data.room.ply,8);
  console.log('P3B4_THREEFOLD_CLAIM_HTTP=PASS');

  const second=await create();
  for(let i=0;i<16;i++)room=await move(second,i,seq[i%4]);
  assert.equal(room.status,'finished');
  assert.equal(room.result.reason,'fivefold');
  assert.equal(room.ply,16);
  console.log('P3B4_FIVEFOLD_AUTO_HTTP=PASS');

  const third=await create();
  for(let i=0;i<7;i++)room=await move(third,i,seq[i%4]);
  const intended=await api(`/v1/rooms/${third.code}/claim-draw`,'POST',
    {intendedMove:{from:'f6',to:'g8'}},third.black);
  assert.equal(intended.status,200);
  assert.equal(intended.data.room.result.reason,'threefold');
  assert.equal(intended.data.room.ply,7);
  console.log('P3B4_INTENDED_MOVE_CLAIM_HTTP=PASS');
  console.log('P3B4_DRAW_RULES_SMOKE=PASS');
}
