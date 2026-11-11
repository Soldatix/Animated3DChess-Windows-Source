// Pure policy for the visible Undo action. No board mutations here.
export function countUndoPlies(history, playerColor, aiAutoPlay = true) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  const last = history[history.length - 1]?.move?.color;
  if (last !== 'w' && last !== 'b') return 0;
  if (!aiAutoPlay) return 1;
  if (playerColor !== 'w' && playerColor !== 'b') return 0;
  if (last === playerColor) return 1; // Undo while AI reply is pending.
  const previous = history[history.length - 2]?.move?.color;
  return previous === playerColor ? 2 : 0; // Keep the initial AI opening if player chose Black.
}
