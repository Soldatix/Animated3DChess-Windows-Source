// Local Stockfish.js 19.0.1 Lite Single UCI transport. Not connected to gameplay yet.
import { boardToFen, bestmoveToLegalMove } from './stockfishPosition.mjs';

export const STOCKFISH_WORKER_URL = '/vendor/stockfish-19.0.1/stockfish-19-lite-single.js';
const clamp = (x, fallback, lo, hi) => Number.isFinite(x)
  ? Math.min(hi, Math.max(lo, Math.round(x))) : fallback;

// Returns a game-approved move or null. Caller MUST revalidate on the CURRENT board.
export function requestStockfishMove({
  cells, color, legalMoves, ply = 0, halfmoveClock = 0,
  moveTimeMs = 1800, timeoutMs = 12000, signal,
  workerFactory = (url) => new Worker(url),
} = {}) {
  if (!Array.isArray(legalMoves) || legalMoves.length === 0 || signal?.aborted) {
    return Promise.resolve(null);
  }
  const fen = boardToFen(cells, color, ply, halfmoveClock);
  const budget = clamp(moveTimeMs, 1800, 200, 5000);
  const deadline = Math.max(budget + 500, clamp(timeoutMs, 12000, 500, 30000));
  return new Promise(resolve => {
    let worker, timeout, done = false, phase = 'startup';
    function finish(move = null) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        try { worker.terminate(); } catch { /* already terminated */ }
      }
      resolve(move);
    }
    function abort() { finish(null); }
    if (signal?.aborted) return finish(null);
    try {
      worker = workerFactory(STOCKFISH_WORKER_URL);
      if (!worker || typeof worker.postMessage !== 'function' ||
          typeof worker.terminate !== 'function') return finish(null);
      worker.onmessage = event => {
        if (done || typeof event?.data !== 'string') return;
        for (const raw of event.data.split(/\r?\n/)) {
          if (done) break;
          const line = raw.trim();
          if (phase === 'startup' && line === 'uciok') {
            phase = 'ready-wait';
            worker.postMessage('isready');
          } else if (phase === 'ready-wait' && line === 'readyok') {
            phase = 'search';
            worker.postMessage('position fen ' + fen);
            worker.postMessage('go movetime ' + budget);
          } else if (phase === 'search' && /^bestmove(?:\s|$)/.test(line)) {
            finish(bestmoveToLegalMove(line, legalMoves, cells));
          }
        }
      };
      worker.onerror = () => finish(null);
      worker.onmessageerror = () => finish(null);
      signal?.addEventListener?.('abort', abort, { once: true });
      if (signal?.aborted) return finish(null);
      timeout = setTimeout(() => finish(null), deadline);
      worker.postMessage('uci');
    } catch { finish(null); }
  });
}
