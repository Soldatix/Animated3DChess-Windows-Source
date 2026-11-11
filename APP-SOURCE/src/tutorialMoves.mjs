// Legal destinations on the tutorial's otherwise empty demo board.
// Pawn has enemy demo pawns at both forward diagonals, allowing capture markers.
// This illustrates piece geometry, not check, pins, castling or en passant.
export function getTutorialSquares(index, row, col) {
  if (!Number.isInteger(index) || index < 0 || index > 5 ||
      !Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || row > 7 || col < 0 || col > 7) {
    throw new RangeError('Invalid tutorial square or piece');
  }
  const moves = [];
  const captures = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const dr = r - row, dc = c - col;
    const ar = Math.abs(dr), ac = Math.abs(dc);
    if (ar === 0 && ac === 0) continue;
    switch (index) {
      case 0: // pawn from white home rank
        if (dc === 0 && (dr === -1 || (row === 6 && dr === -2))) moves.push([r, c]);
        if (dr === -1 && ac === 1) captures.push([r, c]);
        break;
      case 1: // rook
        if (dr === 0 || dc === 0) moves.push([r, c]);
        break;
      case 2: // knight
        if (ar === 1 && ac === 2 || ar === 2 && ac === 1) moves.push([r, c]);
        break;
      case 3: // bishop
        if (ar === ac) moves.push([r, c]);
        break;
      case 4: // queen
        if (ar === ac || dr === 0 || dc === 0) moves.push([r, c]);
        break;
      case 5: // king
        if (Math.max(ar, ac) === 1) moves.push([r, c]);
        break;
    }
  }
  return {moves, captures};
}
