// P1J-B2b1: fail-closed legality admission before ordinary 3D move side-effects.
// Does not implement animations, change AI or mutate game/snapshots.
import { getChessRulesMoves } from './chessRules.mjs';
import { rebuildChessRulesFromHistory } from './chessRulesReplay.mjs';

const validCoord = x => Number.isInteger(x) && x >= 0 && x < 8;
const deny = reason => ({ ok: false, reason });

export function inspectChessMoveAdmission(history, snapshot, proposed) {
  if (!proposed || ![proposed.fromR, proposed.fromC, proposed.toR, proposed.toC].every(validCoord)) {
    return deny('invalid-coordinates');
  }
  // Map human-readable 3D pieces to chess.js promotion codes.
  // An omitted choice is queen, preserving existing AI/script compatibility.
  const promotionCodes = { queen:'q', rook:'r', bishop:'b', knight:'n', q:'q', r:'r', b:'b', n:'n' };
  const requestedPromotion = proposed.promotion == null ? 'q' : promotionCodes[proposed.promotion];
  if (!requestedPromotion) return deny('promotion-animation-pending');
  const game = rebuildChessRulesFromHistory(history, snapshot);
  if (!game) return deny('out-of-sync');
  const matches = getChessRulesMoves(game).filter(m =>
    m.fromR === proposed.fromR && m.fromC === proposed.fromC &&
    m.toR === proposed.toR && m.toC === proposed.toC &&
    (!m.promotion || m.promotion === requestedPromotion)
  );
  if (matches.length !== 1) return deny('illegal');
  const move = matches[0];
  if (!move.promotion && proposed.promotion != null && requestedPromotion !== 'q') {
    return deny('promotion-animation-pending');
  }
  // P1K: allow chess.js-legal en passant. The live engine validates the
  // adjacent victim and uses the authoritative side-square capture plan.
  return { ok: true, reason: null, move };
}
