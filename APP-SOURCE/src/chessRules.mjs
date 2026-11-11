// P1J-A: rules-only adapter. It does not control meshes, AI, UI, or persistence.
// chess.js v1.4.0 is authoritative for legal moves and move state.
import { Chess } from 'chess.js';

const FILES = 'abcdefgh';
const TYPES = Object.freeze({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' });
const PROMOTIONS = Object.freeze({ q: 'q', r: 'r', b: 'b', n: 'n', queen: 'q', rook: 'r', bishop: 'b', knight: 'n' });

function requireGame(game) {
  if (!(game instanceof Chess)) throw new TypeError('chess-rules-game');
}
function rowOf(square) { return 8 - Number(square[1]); }
function colOf(square) { return FILES.indexOf(square[0]); }
function squareOf(row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 7 || col < 0 || col > 7) return null;
  return FILES[col] + String(8 - row);
}
function describe(move) {
  const ep = move.isEnPassant();
  const capture = Boolean(move.captured) || ep;
  const fromR = rowOf(move.from), fromC = colOf(move.from);
  const toR = rowOf(move.to), toC = colOf(move.to);
  return {
    from: move.from, to: move.to, fromR, fromC, toR, toC,
    color: move.color, pieceType: TYPES[move.piece],
    capture, capturedType: move.captured ? TYPES[move.captured] : null,
    captureR: capture ? (ep ? fromR : toR) : null,
    captureC: capture ? toC : null,
    enPassant: ep,
    castle: move.isKingsideCastle() ? 'k' : move.isQueensideCastle() ? 'q' : null,
    promotion: move.promotion || null,
    promotionPieceType: move.promotion ? TYPES[move.promotion] : null,
    uci: move.from + move.to + (move.promotion || ''),
    san: move.san
  };
}
export function createChessRulesGame(fen) {
  return fen === undefined ? new Chess() : new Chess(fen);
}
export function getChessRulesMoves(game) {
  requireGame(game);
  return game.moves({ verbose: true }).map(describe);
}
export function getChessRulesBoard(game) {
  requireGame(game);
  return game.board().map(row => row.map(p => p ? {type: TYPES[p.type], color: p.color} : null));
}
export function getChessRulesStatus(game) {
  requireGame(game);
  return {
    fen: game.fen(), turn: game.turn(),
    check: game.isCheck(), checkmate: game.isCheckmate(),
    stalemate: game.isStalemate(),
    insufficientMaterial: game.isInsufficientMaterial(),
    threefoldRepetition: game.isThreefoldRepetition(),
    fiftyMoveRule: game.isDrawByFiftyMoves(),
    draw: game.isDraw(), gameOver: game.isGameOver()
  };
}
// Apply only a game-approved legal move. Promotion choice must be explicit.
// Invalid and stale input must never mutate the chess.js state.
export function tryChessRulesMove(game, candidate) {
  requireGame(game);
  if (!candidate || typeof candidate !== 'object') return null;
  const from = squareOf(candidate.fromR, candidate.fromC);
  const to = squareOf(candidate.toR, candidate.toC);
  if (!from || !to) return null;
  const requested = candidate.promotion;
  const promotion = requested == null ? null : PROMOTIONS[requested];
  if (requested != null && !promotion) return null;
  const matches = getChessRulesMoves(game).filter(m => m.from === from && m.to === to && m.promotion === promotion);
  if (matches.length !== 1) return null;
  try {
    const actual = game.move({ from, to, ...(promotion ? {promotion} : {}) });
    return { ...describe(actual), fen: game.fen(), status: getChessRulesStatus(game) };
  } catch { return null; }
}
export function undoChessRulesMove(game) {
  requireGame(game);
  const undone = game.undo();
  return undone ? { ...describe(undone), fen: game.fen(), status: getChessRulesStatus(game) } : null;
}
