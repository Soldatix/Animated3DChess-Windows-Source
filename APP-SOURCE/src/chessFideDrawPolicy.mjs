// P1N-a: pure FIDE draw policy. chess.js "draw" at 3fold/50-move
// means claimable, not automatic under FIDE Articles 9.2/9.3.
import { createChessRulesGame } from './chessRules.mjs';

function positionKey(game) {
  const parts = game.fen().split(' ');
  if (parts.length < 4) return null;
  // A non-capturable en-passant FEN target does not alter FIDE identity.
  if (parts[3] !== '-' && !game.moves({ verbose:true }).some(m => m.isEnPassant())) {
    parts[3] = '-';
  }
  return parts.slice(0, 4).join(' ');
}

function currentRepetitions(game) {
  try {
    const history = game.history({ verbose:true });
    const startFen = history.length ? history[0].before : game.fen();
    if (typeof startFen !== 'string') return null;
    const replay = createChessRulesGame(startFen);
    const counts = new Map();
    const initial = positionKey(replay);
    if (!initial) return null;
    counts.set(initial, 1);
    for (const move of history) {
      const step = replay.move({
        from: move.from, to: move.to,
        ...(move.promotion ? { promotion:move.promotion } : {})
      });
      if (!step) return null;
      const key = positionKey(replay);
      if (!key) return null;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (replay.fen() !== game.fen()) return null;
    return counts.get(positionKey(game)) || 1;
  } catch { return null; }
}

export function inspectFideDrawPolicy(game) {
  if (!game || typeof game.fen !== 'function' ||
      typeof game.history !== 'function' || typeof game.isCheckmate !== 'function') {
    return null;
  }
  try {
    const checkmate = game.isCheckmate();
    const stalemate = game.isStalemate();
    const insufficient = game.isInsufficientMaterial();
    const halfmoves = Number(game.fen().split(' ')[4]);
    if (!Number.isInteger(halfmoves) || halfmoves < 0) return null;
    const repetitions = currentRepetitions(game);
    if (repetitions === null) return null;
    // Checkmate takes precedence over 75-move / 5fold automatic draws.
    const automatic = checkmate ? null
      : stalemate ? 'stalemate'
      : insufficient ? 'insufficient'
      : repetitions >= 5 ? 'fivefold'
      : halfmoves >= 150 ? 'seventyFive'
      : null;
    const claims = automatic ? [] : [
      ...(repetitions >= 3 ? ['threefold'] : []),
      ...(halfmoves >= 100 ? ['fiftyMove'] : [])
    ];
    return { automatic, claims, repetitions, halfmoves, checkmate, stalemate };
  } catch { return null; }
}
