// Strict versioned offline save codec: never serialize scene objects or workers.
const TYPES=new Set(['pawn','rook','knight','bishop','queen','king']);
const COLORS=new Set(['w','b']);
const PROMOTIONS=new Set(['queen','rook','bishop','knight']);
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
function boardOf(cells){
  if(!Array.isArray(cells)||cells.length!==8)throw Error('board');
  const kings={w:0,b:0};
  const clean=cells.map(row=>{
    if(!Array.isArray(row)||row.length!==8)throw Error('board');
    return row.map(p=>{
      if(p===null)return null;
      if(!p||!TYPES.has(p.type)||!COLORS.has(p.color)||typeof p.hasMoved!=='boolean')throw Error('piece');
      if(p.type==='king')kings[p.color]++;
      return {type:p.type,color:p.color,hasMoved:p.hasMoved};
    });
  });
  if(kings.w!==1||kings.b!==1)throw Error('kings');
  return clean;
}
function snapshotOf(x){
  if(!x||!COLORS.has(x.currentTurn)||typeof x.gameOver!=='boolean'||
    !integer(x.capturedByWhite,0,30)||!integer(x.capturedByBlack,0,30)||
    !integer(x.scriptCursor,0,500)||typeof x.scriptedGameActive!=='boolean'||
    typeof x.scriptDeviated!=='boolean'||x.scriptedGameActive||
    x.scriptCursor!==0||x.scriptDeviated)throw Error('snapshot');
  return {currentTurn:x.currentTurn,gameOver:x.gameOver,
    capturedByWhite:x.capturedByWhite,capturedByBlack:x.capturedByBlack,
    scriptCursor:0,scriptedGameActive:false,scriptDeviated:false,
    cells:boardOf(x.cells)};
}
function historyOf(value){
  if(!Array.isArray(value)||value.length>256)throw Error('history');
  return value.map(entry=>{
    const m=entry?.move;
    if(!m||!COLORS.has(m.color)||!TYPES.has(m.pieceType)||
      ![m.fromR,m.fromC,m.toR,m.toC].every(n=>integer(n,0,7))||
      typeof m.capture!=='boolean'||!PROMOTIONS.has(m.promotion)||
      (m.promotion!=='queen' && (m.pieceType!=='pawn'||m.toR!==(m.color==='w'?0:7))))throw Error('move');
    return {snapshot:snapshotOf(entry.snapshot),move:{
      color:m.color,pieceType:m.pieceType,fromR:m.fromR,fromC:m.fromC,
      toR:m.toR,toC:m.toC,capture:m.capture,promotion:m.promotion}};
  });
}
export function validateSavedGame(x){
  if(!x||x.version!==1||!['single','local'].includes(x.mode)||!['w','b'].includes(x.playerColor)||
    !integer(x.aiLevel,1,6)||typeof x.paused!=='boolean')throw Error('format');
  const reason = x.claimedDrawReason == null ? null : x.claimedDrawReason;
  if (reason !== null && reason !== 'threefold' && reason !== 'fiftyMove') throw Error('claim');
  const snapshot = snapshotOf(x.snapshot);
  if (reason && !snapshot.gameOver) throw Error('claim-state');
  if (x.mode === 'local' && x.autoFlipLocalCamera != null &&
      typeof x.autoFlipLocalCamera !== 'boolean') throw Error('autoFlip');
  return {version:1,mode:x.mode,playerColor:x.playerColor,
    aiLevel:x.aiLevel,paused:x.paused,
    ...(x.mode === 'local' ? {autoFlipLocalCamera: x.autoFlipLocalCamera === true} : {}),
    ...(reason ? {claimedDrawReason:reason} : {}),
    snapshot,history:historyOf(x.history)};
}
export function encodeSavedGame(state){
  const text=JSON.stringify(validateSavedGame(state));
  if(text.length>1000000)throw Error('size');
  return text;
}
export function parseSavedGame(text){
  if(typeof text!=='string'||text.length>1000000)throw Error('size');
  return validateSavedGame(JSON.parse(text));
}
