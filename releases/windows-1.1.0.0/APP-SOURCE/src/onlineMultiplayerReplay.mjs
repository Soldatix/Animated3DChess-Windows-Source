// P2: independently verify complete server snapshots before touching the 3D scene.
import { Chess } from 'chess.js';
const SQUARE = /^[a-h][1-8]$/;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const CODE = /^[A-HJ-NP-Z2-9]{10}$/;
export function squareToBoard(square) {
  if (!SQUARE.test(square)) throw new Error('invalid-square');
  return { r: 8 - Number(square[1]), c: square.charCodeAt(0) - 97 };
}
export function boardToSquare(r, c) {
  if (![r, c].every(n => Number.isInteger(n) && n >= 0 && n <= 7)) throw new Error('invalid-square');
  return String.fromCharCode(97 + c) + (8 - r);
}
export function validateOnlineSnapshot(room) {
  if (!room || typeof room !== 'object' || !CODE.test(room.code || '') ||
      !['waiting', 'playing', 'finished'].includes(room.status) ||
      !Array.isArray(room.moves) ||
      !Number.isInteger(room.ply) || room.ply !== room.moves.length ||
      !Number.isInteger(room.revision) || room.revision < 1 ||
      !['w','b'].includes(room.turn) || typeof room.fen !== 'string' ||
      typeof room.whiteJoined !== 'boolean' || typeof room.blackJoined !== 'boolean') {
    throw new Error('invalid-server-snapshot');
  }
  const game = new Chess();
  const steps = [], fens = [game.fen()];
  for (const uci of room.moves) {
    if (typeof uci !== 'string' || !UCI.test(uci)) throw new Error('invalid-server-move');
    let played;
    try { played = game.move({from:uci.slice(0,2),to:uci.slice(2,4),
      ...(uci.length === 5 ? {promotion:uci[4]} : {})}); }
    catch { throw new Error('illegal-server-history'); }
    if (!played) throw new Error('illegal-server-history');
    steps.push({from:played.from, to:played.to, promotion:played.promotion || null,
      uci, color:played.color, san:played.san});
    fens.push(game.fen());
  }
  if (game.fen() !== room.fen || game.turn() !== room.turn) throw new Error('server-fen-history-mismatch');
  if (room.ply > 0 && (!room.lastMove || room.lastMove.from !== steps.at(-1).from ||
    room.lastMove.to !== steps.at(-1).to ||
    (room.lastMove.promotion || null) !== steps.at(-1).promotion)) {
    throw new Error('last-move-mismatch');
  }
  return {steps, fens, code:room.code, revision:room.revision, ply:room.ply};
}
export function assertOnlinePrefix(appliedMoves, verified) {
  if (!Array.isArray(appliedMoves) || appliedMoves.length > verified.ply) throw new Error('online-state-rewound');
  if (appliedMoves.some((uci, i) => uci !== verified.steps[i].uci)) throw new Error('online-history-fork');
  return true;
}
