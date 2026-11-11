// P1I Stockfish UCI adapter. Existing game-approved legal moves remain authoritative.
// En passant is not implemented in the current 3D game; never advertise it in FEN.
const LETTER=Object.freeze({pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q',king:'k'});
const validInt=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;

export function boardToFen(cells,color,ply=0,halfmoveClock=0) {
  if(!Array.isArray(cells)||cells.length!==8||!['w','b'].includes(color)||
    !validInt(ply,0,100000)||!validInt(halfmoveClock,0,100000))throw Error('fen-input');
  const kings={w:0,b:0};
  const rows=cells.map(row=>{
    if(!Array.isArray(row)||row.length!==8)throw Error('fen-row');
    let blanks=0,output='';
    for(const p of row){
      if(p==null){blanks++;continue;}
      if(!p||!Object.hasOwn(LETTER,p.type)||!['w','b'].includes(p.color)||
        typeof p.hasMoved!=='boolean')throw Error('fen-piece');
      if(blanks){output+=blanks;blanks=0;}
      if(p.type==='king')kings[p.color]++;
      const code=LETTER[p.type];
      output+=p.color==='w'?code.toUpperCase():code;
    }
    if(blanks)output+=blanks;
    return output;
  });
  if(kings.w!==1||kings.b!==1)throw Error('fen-kings');
  const canCastle=(row,color,side)=>{
    const king=cells[row][4],rook=cells[row][side?7:0];
    return king?.type==='king'&&king.color===color&&!king.hasMoved&&
      rook?.type==='rook'&&rook.color===color&&!rook.hasMoved;
  };
  let rights='';
  if(canCastle(7,'w',true))rights+='K';
  if(canCastle(7,'w',false))rights+='Q';
  if(canCastle(0,'b',true))rights+='k';
  if(canCastle(0,'b',false))rights+='q';
  return rows.join('/')+' '+color+' '+(rights||'-')+' - '+halfmoveClock+' '+(Math.floor(ply/2)+1);
}

export function halfmoveClockFromHistory(history) {
  if(!Array.isArray(history))throw Error('history');
  let count=0;
  for(let i=history.length-1;i>=0;i--){
    const move=history[i]?.move;
    if(!move||typeof move.pieceType!=='string'||typeof move.capture!=='boolean')throw Error('history-move');
    if(move.pieceType==='pawn'||move.capture)break;
    count++;
  }
  return count;
}

// Never accept a UCI move unless it is present in the game's legal root list.
// Existing 3D gameplay promotes only to queen: reject underpromotions.
export function bestmoveToLegalMove(line,approvedMoves,cells) {
  if(typeof line!=='string'||!Array.isArray(approvedMoves)||!Array.isArray(cells))return null;
  const m=/^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?(?:\s|$)/i.exec(line.trim());
  if(!m)return null;
  const fromC=m[1].toLowerCase().charCodeAt(0)-97,fromR=8-Number(m[1][1]);
  const toC=m[2].toLowerCase().charCodeAt(0)-97,toR=8-Number(m[2][1]);
  const piece=cells[fromR]?.[fromC];
  if(!piece)return null;
  const promotes=piece.type==='pawn'&&(toR===0||toR===7);
  if(promotes&&m[3]?.toLowerCase()!=='q')return null;
  if(!promotes&&m[3])return null;
  return approvedMoves.find(x=>x.fromR===fromR&&x.fromC===fromC&&x.toR===toR&&x.toC===toC)||null;
}

export function isUciLine(line,kind){return typeof line==='string'&&line.trim()===kind;}
