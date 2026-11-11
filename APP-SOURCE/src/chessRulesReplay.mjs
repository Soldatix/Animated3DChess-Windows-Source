// P1J-B1: Read-only migration bridge from existing saved move history.
// No UI, 3D assets, gameplay engine or localStorage changes.
import { createChessRulesGame, getChessRulesBoard, tryChessRulesMove } from './chessRules.mjs';

const TYPES = new Set(['pawn', 'rook', 'knight', 'bishop', 'queen', 'king']);
const PROMOTIONS = new Set(['queen', 'rook', 'bishop', 'knight']);

export function matchesChessRulesSnapshot(game, snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.currentTurn !== game.turn() ||
      !Array.isArray(snapshot.cells) || snapshot.cells.length !== 8) return false;
  const actual = getChessRulesBoard(game);
  for (let r = 0; r < 8; r++) {
    if (!Array.isArray(snapshot.cells[r]) || snapshot.cells[r].length !== 8) return false;
    for (let c = 0; c < 8; c++) {
      const expected = snapshot.cells[r][c];
      const piece = actual[r][c];
      if (expected == null && piece == null) continue;
      if (!expected || !piece || expected.type !== piece.type || expected.color !== piece.color) return false;
    }
  }
  return true;
}

// Return fresh authoritative rules state, or null on ANY mismatch.
// Historic v1 saves set promotion:'queen' on every ordinary move; ignore it
// unless a pawn is actually promoting. Never mutate supplied history/snapshots.
export function rebuildChessRulesFromHistory(history, finalSnapshot = null) {
  if (!Array.isArray(history) || history.length > 256) return null;
  const game = createChessRulesGame();
  for (const entry of history) {
    if (!entry || !matchesChessRulesSnapshot(game, entry.snapshot)) return null;
    const m = entry.move;
    if (!m || !TYPES.has(m.pieceType) || !['w', 'b'].includes(m.color) ||
        ![m.fromR, m.fromC, m.toR, m.toC].every(x => Number.isInteger(x) && x >= 0 && x <= 7) ||
        typeof m.capture !== 'boolean') return null;
    const promoting = m.pieceType === 'pawn' && (m.toR === 0 || m.toR === 7);
    if (promoting && !PROMOTIONS.has(m.promotion)) return null;
    const result = tryChessRulesMove(game, {
      fromR: m.fromR, fromC: m.fromC, toR: m.toR, toC: m.toC,
      ...(promoting ? { promotion: m.promotion } : {})
    });
    if (!result || result.color !== m.color || result.pieceType !== m.pieceType ||
        result.capture !== m.capture) return null;
  }
  if (finalSnapshot !== null && !matchesChessRulesSnapshot(game, finalSnapshot)) return null;
  return game;
}
