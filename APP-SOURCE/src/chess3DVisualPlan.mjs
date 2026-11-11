// P1J-B2b2: deterministic animation geometry from an authorized chess.js move.
// Pure metadata only; never mutates chess.js, the 3D board, camera or history.
const validCoord = n => Number.isInteger(n) && n >= 0 && n < 8;
const PROMOTIONS = new Set(['q','r','b','n']);
const PIECES = new Set(['pawn','rook','knight','bishop','queen','king']);

export function createChess3DVisualPlan(move) {
  if (!move || typeof move !== 'object' ||
      ![move.fromR,move.fromC,move.toR,move.toC].every(validCoord) ||
      !PIECES.has(move.pieceType) || !['w','b'].includes(move.color) ||
      typeof move.capture !== 'boolean' || typeof move.enPassant !== 'boolean' ||
      (move.castle !== null && move.castle !== 'k' && move.castle !== 'q') ||
      (move.promotion !== null && !PROMOTIONS.has(move.promotion))) return null;

  if (move.enPassant && (move.pieceType !== 'pawn' || !move.capture || move.castle)) return null;
  if (move.castle && (move.pieceType !== 'king' || move.capture || move.promotion)) return null;
  if (move.promotion && (move.pieceType !== 'pawn' || (move.toR !== 0 && move.toR !== 7))) return null;
  if (move.capture) {
    if (![move.captureR,move.captureC].every(validCoord)) return null;
    if (!move.enPassant && (move.captureR !== move.toR || move.captureC !== move.toC)) return null;
    if (move.enPassant &&
        (move.captureR !== move.fromR || move.captureC !== move.toC ||
         Math.abs(move.fromC-move.toC) !== 1 || Math.abs(move.fromR-move.toR) !== 1)) return null;
  }
  if (!move.capture && (move.captureR != null || move.captureC != null)) return null;
  if (move.castle && (move.fromR !== move.toR || move.fromC !== 4 ||
       move.toC !== (move.castle === 'k' ? 6 : 2) ||
       (move.toR !== (move.color === 'w' ? 7 : 0)))) return null;

  const landing = {r:move.toR,c:move.toC};
  const capturedAt = move.capture ? {r:move.captureR,c:move.captureC} : null;
  const rook = move.castle ? {
    fromR:move.fromR,fromC:move.castle === 'k'?7:0,
    toR:move.toR,toC:move.castle === 'k'?5:3
  } : null;

  return {
    from:{r:move.fromR,c:move.fromC},landing,capturedAt,
    attackTarget: capturedAt || landing,
    capture:move.capture,
    enPassant:move.enPassant,
    castle:move.castle,rook,
    color:move.color,pieceType:move.pieceType,
    promotion:move.promotion,
    promotionPieceType:move.promotionPieceType || null,
    specialAnimationRequired: move.enPassant || (move.promotion !== null && move.promotion !== 'q')
  };
}
