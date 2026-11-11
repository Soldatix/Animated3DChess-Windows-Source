import { pickMove } from './chessAiCore.mjs';

self.onmessage = ({ data }) => {
  if (!data || typeof data.requestId !== 'number') return;
  try {
    const move = pickMove(data);
    self.postMessage({ requestId: data.requestId, move });
  } catch (error) {
    self.postMessage({ requestId: data.requestId, move: null, error: String(error?.message || error) });
  }
};
