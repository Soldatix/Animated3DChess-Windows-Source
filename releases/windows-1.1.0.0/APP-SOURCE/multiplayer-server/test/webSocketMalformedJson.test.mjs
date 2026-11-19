// P3-C11F F1 regression: invoke the REAL ChessRoom.webSocketMessage method.
// Load the unmodified handler source with Cloudflare's DurableObject base and
// unrelated game helpers stubbed only for this isolated socket test.
// The real securityPolicy module and socket-budget logic remain in use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverUrl = new URL('../src/index.mjs', import.meta.url);
let serverSource = readFileSync(serverUrl, 'utf8');
const cloudflareImport = "import { DurableObject } from 'cloudflare:workers';";
assert.equal(serverSource.includes(cloudflareImport), true, 'known DurableObject import required');
serverSource = serverSource.replace(cloudflareImport, 'class DurableObject {}');

const gameImport = /import \{\s*ROOM_TTL_MS,[\s\S]*?\}\s*from '\.\/game\.mjs';/;
const gameMatch = serverSource.match(gameImport);
assert.ok(gameMatch, 'known game import required');
const gameNames = [...gameMatch[0].matchAll(/\b([A-Za-z_][A-Za-z_0-9]*)\b/g)]
  .map(m => m[1]);
const helpers = [
  'ROOM_TTL_MS', 'newRoom', 'joinRoom', 'publicRoom', 'seatOf', 'isExpired',
  'applyMove', 'resign', 'offerDraw', 'answerDraw', 'claimDraw',
];
for (const name of helpers) assert.ok(gameNames.includes(name), `missing game helper ${name}`);
const stubs = 'const ROOM_TTL_MS = {};' + helpers.filter(n => n !== 'ROOM_TTL_MS')
  .map(n => `\nconst ${n} = () => { throw Error('unexpected-game-call:${n}'); };`).join('');
serverSource = serverSource.replace(gameImport, stubs);

const policyImport = "from './securityPolicy.mjs';";
assert.equal(serverSource.includes(policyImport), true, 'known real policy import required');
serverSource = serverSource.replace(policyImport,
  `from '${new URL('../src/securityPolicy.mjs', import.meta.url).href}';`);

const { ChessRoom } = await import('data:text/javascript;base64,' +
  Buffer.from(serverSource, 'utf8').toString('base64'));

function makeSocket(attachment) {
  return {
    readyState: 1,
    attachment: { ...attachment },
    sent: [],
    closes: [],
    deserializeAttachment() { return this.attachment; },
    serializeAttachment(next) { this.attachment = next; },
    send(text) { this.sent.push(text); },
    close(code, reason) { this.closes.push({ code, reason }); this.readyState = 3; },
  };
}
const makeRoom = () => Object.create(ChessRoom.prototype);

test('F1: authenticated malformed JSON closes immediately, sends no error flood', async () => {
  const socket = makeSocket({ side: 'w' });
  await makeRoom().webSocketMessage(socket, '{');
  assert.deepEqual(socket.closes, [{ code: 1008, reason: 'invalid-json' }]);
  assert.equal(socket.sent.length, 0);
});

test('F1: unauthenticated malformed JSON closes immediately', async () => {
  const socket = makeSocket({ side: null, authDeadline: Date.now() + 10000 });
  await makeRoom().webSocketMessage(socket, '{');
  assert.deepEqual(socket.closes, [{ code: 1008, reason: 'invalid-json' }]);
  assert.equal(socket.sent.length, 0);
});

test('F1: 1000 malformed frames cannot cause 1000 responses per socket', async () => {
  const handler = makeRoom();
  for (const side of ['w', null]) {
    const socket = makeSocket({ side, authDeadline: Date.now() + 10000 });
    let delivered = 0;
    for (let i = 0; i < 1000 && socket.readyState === 1; i++) {
      delivered++;
      await handler.webSocketMessage(socket, '{');
    }
    assert.equal(delivered, 1);
    assert.equal(socket.closes.length, 1);
    assert.equal(socket.sent.length, 0);
  }
});

test('F1: valid authenticated ping keeps original 40-per-window budget', async () => {
  const socket = makeSocket({ side: 'b' });
  const handler = makeRoom();
  for (let i = 0; i < 40; i++) {
    await handler.webSocketMessage(socket, '{"type":"ping"}');
    assert.equal(socket.readyState, 1, `ping ${i + 1}`);
  }
  assert.equal(socket.attachment.messageBudget.hits, 40);
  await handler.webSocketMessage(socket, '{"type":"ping"}');
  assert.deepEqual(socket.closes, [{code:1008,reason:'message-rate-limit'}]);
});

test('F1: malformed JSON following valid pings still closes immediately', async () => {
  const socket = makeSocket({ side: 'w' });
  const handler = makeRoom();
  await handler.webSocketMessage(socket, '{"type":"ping"}');
  assert.equal(socket.attachment.messageBudget.hits, 1);
  await handler.webSocketMessage(socket, 'not json');
  assert.deepEqual(socket.closes, [{code:1008,reason:'invalid-json'}]);
  assert.equal(socket.sent.length, 0);
});

test('F1: non-text and oversize frames still fail closed', async () => {
  const handler = makeRoom();
  for (const frame of [new Uint8Array([1, 2, 3]), 'a'.repeat(4097)]) {
    const socket = makeSocket({side:'w'});
    await handler.webSocketMessage(socket, frame);
    assert.deepEqual(socket.closes, [{code:1008,reason:'invalid-message'}]);
    assert.equal(socket.sent.length, 0);
  }
});
