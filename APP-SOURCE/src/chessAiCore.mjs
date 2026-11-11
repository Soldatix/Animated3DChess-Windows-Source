// Wizard Chess offline search engine. Independent of Three.js and React.
// Move legality at the root is always decided by the game's own legal move list.
// Internal search does not claim full FIDE support (e.g. en passant and draw rules).
export const AI_LEVELS = Object.freeze({
  1: { label: 'Learning', depth: 0, timeMs: 0 },
  2: { label: 'Easy', depth: 1, timeMs: 80 },
  3: { label: 'Medium', depth: 2, timeMs: 300 },
  4: { label: 'Hard', depth: 3, timeMs: 700 },
  5: { label: 'Expert', depth: 4, timeMs: 1400 },
});

const VALUE = { pawn: 100, knight: 320, bishop: 335, rook: 500, queen: 900, king: 0 };
const KNIGHT = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const ORTHO = [[-1,0],[1,0],[0,-1],[0,1]];
const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
const WIN = 100000;
const TIMEOUT = Symbol('AI_SEARCH_TIMEOUT');
const QUIESCENCE_MAX_PLY = 8;
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const opponent = (c) => c === 'w' ? 'b' : 'w';

function attacked(board, r, c, byColor) {
  for (let sr = 0; sr < 8; sr++) for (let sc = 0; sc < 8; sc++) {
    const p = board[sr][sc];
    if (!p || p.color !== byColor) continue;
    const dr = r - sr, dc = c - sc;
    if (p.type === 'pawn') { if (dr === (byColor === 'w' ? -1 : 1) && Math.abs(dc) === 1) return true; continue; }
    if (p.type === 'knight') { if ((Math.abs(dr) === 1 && Math.abs(dc) === 2) || (Math.abs(dr) === 2 && Math.abs(dc) === 1)) return true; continue; }
    if (p.type === 'king') { if (Math.max(Math.abs(dr), Math.abs(dc)) === 1) return true; continue; }
    const straight = (dr === 0 && dc !== 0) || (dc === 0 && dr !== 0);
    const diagonal = Math.abs(dr) === Math.abs(dc) && dr !== 0;
    if (!(straight && (p.type === 'rook' || p.type === 'queen')) &&
        !(diagonal && (p.type === 'bishop' || p.type === 'queen'))) continue;
    const stepr = Math.sign(dr), stepc = Math.sign(dc);
    let blocked = false;
    for (let rr = sr + stepr, cc = sc + stepc; rr !== r || cc !== c; rr += stepr, cc += stepc) {
      if (board[rr][cc]) { blocked = true; break; }
    }
    if (!blocked) return true;
  }
  return false;
}

function inCheck(board, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.type === 'king' && p.color === color) return attacked(board, r, c, opponent(color));
  }
  return true;
}

export function makeBoardMove(board, move) {
  const out = board.map(row => row.slice());
  const p = board[move.fromR][move.fromC];
  if (!p) throw new Error('No piece on AI move start square');
  out[move.fromR][move.fromC] = null;
  const promotion = p.type === 'pawn' && (move.toR === 0 || move.toR === 7);
  out[move.toR][move.toC] = { ...p, hasMoved: true, type: promotion ? 'queen' : p.type };
  if (p.type === 'king' && Math.abs(move.toC - move.fromC) === 2) {
    const from = move.toC === 6 ? 7 : 0;
    const to = move.toC === 6 ? 5 : 3;
    if (board[move.fromR][from]?.type === 'rook') {
      out[move.fromR][to] = { ...board[move.fromR][from], hasMoved: true };
      out[move.fromR][from] = null;
    }
  }
  return out;
}

export function legalSearchMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.color !== color) continue;
    const candidates = [];
    const add = (nr, nc) => {
      if (!inside(nr, nc)) return false;
      const other = board[nr][nc];
      if (!other) { candidates.push([nr, nc]); return true; }
      if (other.color !== color && other.type !== 'king') candidates.push([nr, nc]);
      return false;
    };
    if (p.type === 'pawn') {
      const dir = color === 'w' ? -1 : 1;
      if (inside(r + dir, c) && !board[r + dir][c]) {
        candidates.push([r + dir, c]);
        if (r === (color === 'w' ? 6 : 1) && !board[r + 2 * dir][c]) candidates.push([r + 2 * dir, c]);
      }
      for (const dc of [-1, 1]) {
        const target = board[r + dir]?.[c + dc];
        if (target && target.color !== color && target.type !== 'king') candidates.push([r + dir, c + dc]);
      }
    } else if (p.type === 'knight' || p.type === 'king') {
      for (const [dr, dc] of p.type === 'king' ? KING : KNIGHT) add(r + dr, c + dc);
      if (p.type === 'king' && !p.hasMoved && c === 4 && r === (color === 'w' ? 7 : 0) && !inCheck(board, color)) {
        for (const [rookC, empty, walk, kingDest] of [
          [7, [5, 6], [5, 6], 6], [0, [1, 2, 3], [3, 2], 2],
        ]) {
          const rook = board[r][rookC];
          if (rook?.type === 'rook' && rook.color === color && !rook.hasMoved &&
              empty.every(cc => !board[r][cc]) && walk.every(cc => !attacked(board, r, cc, opponent(color)))) {
            candidates.push([r, kingDest]);
          }
        }
      }
    } else {
      const dirs = p.type === 'rook' ? ORTHO : p.type === 'bishop' ? DIAG : [...ORTHO, ...DIAG];
      for (const [dr, dc] of dirs) for (let i = 1; i < 8; i++) if (!add(r + dr * i, c + dc * i)) break;
    }
    for (const [toR, toC] of candidates) {
      const move = { fromR: r, fromC: c, toR, toC };
      const next = makeBoardMove(board, move);
      if (!inCheck(next, color)) moves.push(move);
    }
  }
  return moves;
}

function scorePosition(board, color) {
  let score = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p) continue;
    const centre = 3.5 - (Math.abs(3.5-r) + Math.abs(3.5-c)) / 2;
    const pawnPush = p.type === 'pawn' ? (p.color === 'w' ? 6-r : r-1) : 0;
    const value = VALUE[p.type] + centre * (p.type === 'king' ? -2 : 5) + pawnPush * 5;
    score += (p.color === color ? 1 : -1) * value;
  }
  return score;
}

function moveOrder(board, a, b) {
  const victim = m => board[m.toR][m.toC];
  const val = m => {
    const target = victim(m);
    const p = board[m.fromR][m.fromC];
    return (target ? VALUE[target.type] * 10 - VALUE[p.type] : 0) + (p.type === 'pawn' && (m.toR === 0 || m.toR === 7) ? 8000 : 0);
  };
  return val(b) - val(a);
}

// Tactical extension for Hard/Expert only. Checked sides must search all evasions.
// The bound avoids endless captures/checks, while a checked node at the cap still
// evaluates every legal escape (one nonrecursive child). Used by leaf tests too.
export function quiescence(board, color, alpha, beta, ply, qPly, ctx) {
  ctx.nodes += 1;
  if (ctx.nodes > ctx.maxNodes || (ctx.nodes % 16 === 0 && Date.now() >= ctx.deadline)) throw TIMEOUT;
  const checked = inCheck(board, color);
  const allMoves = legalSearchMoves(board, color);
  if (!allMoves.length) return checked ? -WIN + ply : 0;

  const standPat = scorePosition(board, color);
  if (!checked) {
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
  }

  // Checked leaf at the hard ply cap: evaluate every escape, no further recursion.
  if (qPly >= QUIESCENCE_MAX_PLY) {
    if (!checked) return standPat;
    let best = -Infinity;
    for (const move of allMoves.sort((a, b) => moveOrder(board, a, b))) {
      const next = makeBoardMove(board, move);
      const nextColor = opponent(color);
      const replies = legalSearchMoves(next, nextColor);
      const score = replies.length ? scorePosition(next, color) :
        inCheck(next, nextColor) ? WIN - ply - 1 : 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  const tactical = checked ? allMoves : allMoves.filter(move => {
    const piece = board[move.fromR][move.fromC];
    return Boolean(board[move.toR][move.toC]) ||
      (piece?.type === 'pawn' && (move.toR === 0 || move.toR === 7));
  });
  if (!tactical.length) return standPat;

  tactical.sort((a, b) => moveOrder(board, a, b));
  let best = checked ? -Infinity : standPat;
  for (const move of tactical) {
    const score = -quiescence(makeBoardMove(board, move), opponent(color),
      -beta, -alpha, ply + 1, qPly + 1, ctx);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(board, color, depth, alpha, beta, ply, ctx) {
  if (++ctx.nodes > ctx.maxNodes || (ctx.nodes % 32 === 0 && Date.now() >= ctx.deadline)) throw TIMEOUT;
  if (depth <= 0) return ctx.useQuiescence ?
    quiescence(board, color, alpha, beta, ply, 0, ctx) : scorePosition(board, color);
  const moves = legalSearchMoves(board, color);
  if (!moves.length) return inCheck(board, color) ? -WIN + ply : 0;
  moves.sort((a, b) => moveOrder(board, a, b));
  let best = -Infinity;
  for (const move of moves) {
    const score = -negamax(makeBoardMove(board, move), opponent(color), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

// Returns only a move from the given ROOT legal list. Never returns an invented move.
export function pickMove({ cells, color, legalMoves, level = 3, random = Math.random, maxTimeMs } = {}) {
  if (!Array.isArray(legalMoves) || !legalMoves.length) return null;
  if (!Array.isArray(cells) || cells.length !== 8 || !['w','b'].includes(color)) return legalMoves[0];
  const strength = AI_LEVELS[level] ? Number(level) : 3;
  if (strength === 1) return legalMoves[Math.min(legalMoves.length-1, Math.floor(random() * legalMoves.length))];
  const board = cells.map(row => row.map(p => p ? { type: p.type, color: p.color, hasMoved: !!p.hasMoved } : null));
  const candidates = legalMoves.slice().sort((a, b) => moveOrder(board, a, b));
  const budget = maxTimeMs ?? AI_LEVELS[strength].timeMs;
  const ctx = {
    deadline: Date.now() + Math.max(1, budget),
    nodes: 0,
    maxNodes: strength === 5 ? 100000 : strength === 4 ? 40000 : Number.POSITIVE_INFINITY,
    useQuiescence: strength >= 4,
  };
  let answer = candidates[0];
  const maxDepth = AI_LEVELS[strength].depth;
  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestScore = -Infinity, bestAtDepth = null;
    try {
      for (const move of candidates) {
        if (Date.now() >= ctx.deadline && depth > 1) throw TIMEOUT;
        const child = makeBoardMove(board, move);
        let score = -negamax(child, opponent(color), depth - 1, -Infinity, Infinity, 1, ctx);
        if (inCheck(child, opponent(color))) score += 25;
        if (score > bestScore) { bestScore = score; bestAtDepth = move; }
      }
      if (bestAtDepth) answer = bestAtDepth;
    } catch (err) {
      if (err !== TIMEOUT) throw err;
      break;
    }
  }
  if (strength === 2) {
    const scored = candidates.map(move => ({ move, score: scorePosition(makeBoardMove(board, move), color) }));
    scored.sort((a,b) => b.score - a.score);
    const slice = scored.slice(0, Math.min(5, scored.length));
    return slice[Math.min(slice.length - 1, Math.floor(random() * slice.length))].move;
  }
  return answer;
}
