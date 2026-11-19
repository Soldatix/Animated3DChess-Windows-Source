import { Chess } from 'chess.js';

const SQUARE = /^[a-h][1-8]$/;
const MOVE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const OTHER = { w: 'b', b: 'w' };
export const ROOM_TTL_MS = { waiting: 60 * 60_000, playing: 48 * 60 * 60_000, finished: 6 * 60 * 60_000 };

export function newRoom(code, hostColor, hostHash, now) {
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code) || !['w', 'b'].includes(hostColor) || !hostHash) throw new Error('invalid-new-room');
  return {
    schema: 1, code, status: 'waiting', whiteHash: hostColor === 'w' ? hostHash : null,
    blackHash: hostColor === 'b' ? hostHash : null, moves: [],
    processed: [], drawOfferedBy: null, result: null,
    revision: 1, createdAt: now, updatedAt: now,
  };
}

export function seatOf(room, tokenHash) {
  if (!room || !tokenHash) return null;
  if (room.whiteHash === tokenHash) return 'w';
  if (room.blackHash === tokenHash) return 'b';
  return null;
}

export function isExpired(room, now) {
  return now - room.updatedAt >= ROOM_TTL_MS[room.status];
}

export function rebuild(room) {
  const chess = new Chess();
  for (const m of room.moves) {
    const result = chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    if (!result) throw new Error('corrupt-history');
  }
  return chess;
}

export function publicRoom(room) {
  const chess = rebuild(room);
  return {
    code: room.code, status: room.status, whiteJoined: Boolean(room.whiteHash),
    blackJoined: Boolean(room.blackHash), turn: chess.turn(), fen: chess.fen(),
    ply: room.moves.length, revision: room.revision,
    lastMove: room.moves.at(-1) || null, moves: room.moves.map(m => m.from + m.to + (m.promotion || '')),
    check: chess.isCheck(), checkmate: chess.isCheckmate(),
    stalemate: chess.isStalemate(),
    // A claimable 3-fold/50-move position is NOT automatically a drawn game.
    draw: room.status === 'finished' && room.result?.winner == null,
    claimableDraw: room.status === 'playing' ? fideDrawState(room, chess).claimable : { threefold: false, fiftyMove: false },
    gameOver: room.status === 'finished', result: room.result,
    drawOfferedBy: room.drawOfferedBy, updatedAt: room.updatedAt,
  };
}

// FIDE 9.2/9.3/9.6: a third repetition or 50 moves is claimable;
// fivefold repetition or 75 moves is automatic. A checkmate takes precedence.
// FEN's raw en-passant field is relevant only if a LEGAL en-passant capture
// exists: otherwise these are equivalent positions under FIDE 9.2.3.
export function fidePositionKey(chess) {
  const fields = chess.fen().split(' ');
  if (fields[3] !== '-' && !chess.moves({ verbose: true }).some(move => move.flags.includes('e')))
    fields[3] = '-';
  return fields.slice(0, 4).join(' ');
}
export function fideRepetitionCount(room, chess = rebuild(room)) {
  const sought = fidePositionKey(chess);
  const replay = new Chess();
  let count = fidePositionKey(replay) === sought ? 1 : 0;
  for (const move of room.moves) {
    replay.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
    if (fidePositionKey(replay) === sought) count++;
  }
  return count;
}
export function evaluateFideDraw({ repetitions, halfMoves, checkmate = false,
  stalemate = false, insufficientMaterial = false }) {
  const claimable = { threefold: repetitions >= 3, fiftyMove: halfMoves >= 100 };
  const automatic = checkmate ? null : stalemate ? 'stalemate' : insufficientMaterial ? 'insufficient-material'
    : repetitions >= 5 ? 'fivefold' : halfMoves >= 150 ? 'seventy-five-move' : null;
  return { claimable, automatic };
}
export function fideDrawState(room, chess = rebuild(room)) {
  const halfMoves = Number(chess.fen().split(' ')[4]);
  const repetitions = fideRepetitionCount(room, chess);
  const result = evaluateFideDraw({ repetitions, halfMoves, checkmate: chess.isCheckmate(),
    stalemate: chess.isStalemate(), insufficientMaterial: chess.isInsufficientMaterial() });
  return { repetitions, halfMoves, ...result };
}

function reject(reason, status = 409) { return { ok: false, reason, status }; }
export function joinRoom(room, guestHash, now) {
  if (!guestHash || seatOf(room, guestHash)) return reject('already-joined');
  if (room.status !== 'waiting') return reject('room-not-joinable');
  const side = room.whiteHash ? 'b' : 'w';
  const next = { ...room, whiteHash: room.whiteHash || guestHash,
    blackHash: room.blackHash || guestHash, status: 'playing',
    revision: room.revision + 1, updatedAt: now };
  return { ok: true, room: next, side };
}

export function validateMove(chess, input) {
  if (!input || typeof input !== 'object') return reject('invalid-move', 400);
  const { from, to } = input;
  const promotion = input.promotion == null ? null : input.promotion;
  if (typeof from !== 'string' || typeof to !== 'string' || !SQUARE.test(from) || !SQUARE.test(to) ||
      (promotion != null && !['q', 'r', 'b', 'n'].includes(promotion))) return reject('invalid-move', 400);
  const matches = chess.moves({ verbose: true }).filter(m => m.from === from && m.to === to);
  if (!matches.length) return reject('illegal-move');
  if (matches.some(m => m.promotion) && !promotion) return reject('promotion-required');
  const match = matches.find(m => (m.promotion || null) === promotion);
  if (!match) return reject('invalid-promotion');
  return { ok: true, move: match };
}

export function applyMove(room, side, input, now) {
  if (!['w', 'b'].includes(side)) return reject('unauthorized', 401);
  if (room.status !== 'playing') return reject('game-not-playing');
  if (typeof input?.clientMoveId !== 'string' || !MOVE_ID.test(input.clientMoveId) ||
      !Number.isInteger(input.expectedPly) || input.expectedPly < 0) return reject('invalid-move-request', 400);
  const key = `${side}:${input.clientMoveId}`;
  const content = `${input.from || ''}:${input.to || ''}:${input.promotion || ''}`;
  const prior = room.processed.find(x => x.key === key);
  if (prior) return prior.content === content ? { ok: true, duplicate: true, room } : reject('move-id-conflict');
  if (input.expectedPly !== room.moves.length) return reject('stale-ply');
  const chess = rebuild(room);
  if (chess.turn() !== side) return reject('not-your-turn');
  const validated = validateMove(chess, input);
  if (!validated.ok) return validated;
  const move = validated.move;
  chess.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
  const saved = { from: move.from, to: move.to, promotion: move.promotion || null, san: move.san, color: side };
  const updatedHistory = { ...room, moves: [...room.moves, saved] };
  const drawn = fideDrawState(updatedHistory, chess);
  const result = chess.isCheckmate() ? { type: 'checkmate', winner: side }
    : drawn.automatic ? { type: 'draw-automatic', reason: drawn.automatic, winner: null } : null;
  const next = { ...room, moves: [...room.moves, saved],
    processed: [...room.processed.slice(-127), { key, content }], drawOfferedBy: null,
    status: result ? 'finished' : 'playing', result,
    revision: room.revision + 1, updatedAt: now };
  return { ok: true, duplicate: false, room: next };
}

export function resign(room, side, now) {
  if (!['w', 'b'].includes(side)) return reject('unauthorized', 401);
  if (room.status !== 'playing') return reject('game-not-playing');
  return { ok: true, room: { ...room, status: 'finished', result: { type: 'resignation', winner: OTHER[side] },
    drawOfferedBy: null, revision: room.revision + 1, updatedAt: now } };
}
export function offerDraw(room, side, now) {
  if (!['w', 'b'].includes(side)) return reject('unauthorized', 401);
  if (room.status !== 'playing') return reject('game-not-playing');
  if (room.drawOfferedBy) return reject('draw-offer-pending');
  return { ok: true, room: { ...room, drawOfferedBy: side, revision: room.revision + 1, updatedAt: now } };
}
export function answerDraw(room, side, accept, now) {
  if (!['w', 'b'].includes(side)) return reject('unauthorized', 401);
  if (room.status !== 'playing') return reject('game-not-playing');
  if (!room.drawOfferedBy || room.drawOfferedBy === side) return reject('no-opponent-draw-offer');
  if (typeof accept !== 'boolean') return reject('invalid-draw-answer', 400);
  return { ok: true, room: { ...room, drawOfferedBy: null,
    status: accept ? 'finished' : 'playing', result: accept ? { type: 'draw-agreed', winner: null } : null,
    revision: room.revision + 1, updatedAt: now } };
}

// A draw claim is a unilateral SERVER-VERIFIED action, unlike an offer which
// requires the opponent's acceptance. Optional intendedMove models a pre-move
// claim under FIDE 9.2.1/9.3.1: if valid, the move is not played.
export function claimDraw(room, side, input, now) {
  if (!['w', 'b'].includes(side)) return reject('unauthorized', 401);
  if (room.status !== 'playing') return reject('game-not-playing');
  const chess = rebuild(room);
  if (chess.turn() !== side) return reject('not-your-turn');
  let reviewRoom = room;
  if (input?.intendedMove !== undefined) {
    const selected = validateMove(chess, input.intendedMove);
    if (!selected.ok) return selected;
    const m = selected.move;
    chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    reviewRoom = { ...room, moves: [...room.moves, {
      from: m.from, to: m.to, promotion: m.promotion || null, san: m.san, color: side,
    }] };
  }
  const policy = fideDrawState(reviewRoom, chess);
  const reason = policy.claimable.threefold ? 'threefold' : policy.claimable.fiftyMove ? 'fifty-move' : null;
  if (!reason) return reject('draw-not-claimable');
  return { ok: true, room: { ...room, status: 'finished', result: { type: 'draw-claimed', reason, winner: null },
    drawOfferedBy: null, revision: room.revision + 1, updatedAt: now } };
}
