// Pure, deterministic edge labels for the physical Three.js chessboard.
// Engine r=0 is rank 8, r=7 is rank 1; c=0 is file a, c=7 is h.
// Keep labels OUTSIDE the playable 8x8 squares (the gold frame ends at 4*size).
export function boardCoordinateLabels(squareSize) {
  if (!Number.isFinite(squareSize) || squareSize <= 0) return [];
  const files = 'abcdefgh';
  const edge = 4 * squareSize + 0.16;
  const labels = [];
  for (let c = 0; c < 8; c++) {
    const x = (c - 3.5) * squareSize;
    labels.push({ symbol: files[c], x, z: -edge, kind: 'file', edge: 'black' });
    labels.push({ symbol: files[c], x, z: edge, kind: 'file', edge: 'white' });
  }
  for (let r = 0; r < 8; r++) {
    const z = (r - 3.5) * squareSize;
    labels.push({ symbol: String(8 - r), x: -edge, z, kind: 'rank', edge: 'a' });
    labels.push({ symbol: String(8 - r), x: edge, z, kind: 'rank', edge: 'h' });
  }
  return labels;
}
