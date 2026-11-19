import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE_LIMITS, SOCKET_LIMITS, consumeSocketBudget, evaluateRateWindow } from '../src/securityPolicy.mjs';

test('remaining public room HTTP routes share a bounded 120/min budget', () => {
  const rule = RATE_LIMITS.room;
  assert.equal(rule.max, 120);
  let state;
  for (let i = 0; i < rule.max; i++) {
    const result = evaluateRateWindow(state, 1000, rule);
    assert.equal(result.allowed, true);
    state = result.state;
  }
  const denied = evaluateRateWindow(state, 1000, rule);
  assert.equal(denied.allowed, false);
  const retry = evaluateRateWindow(denied.state, 1000, rule);
  assert.deepEqual(retry.state, denied.state, 'saturated state remains unchanged');
  assert.equal(evaluateRateWindow(state, 61000, rule).allowed, true, 'window resets');
});

test('each socket has strict all-message budget', () => {
  const rule = SOCKET_LIMITS.messages;
  let state;
  for (let i = 0; i < rule.max; i++) {
    const result = consumeSocketBudget(state, 2000, rule);
    assert.equal(result.allowed, true);
    state = result.state;
  }
  const blocked = consumeSocketBudget(state, 2000, rule);
  assert.equal(blocked.allowed, false);
  assert.equal(consumeSocketBudget(blocked.state, 12001, rule).allowed, true);
});

test('expensive sync has a separate stricter budget', () => {
  const rule = SOCKET_LIMITS.sync;
  let state;
  for (let i = 0; i < rule.max; i++) {
    const result = consumeSocketBudget(state, 3000, rule);
    assert.equal(result.allowed, true);
    state = result.state;
  }
  assert.equal(consumeSocketBudget(state, 3000, rule).allowed, false);
});

test('invalid socket counter input cannot open an unlimited window', () => {
  const rule = SOCKET_LIMITS.sync;
  for (const old of [null, {}, { resetAt: 'bad', hits: -1 }, { resetAt: 4000, hits: NaN }]) {
    const result = consumeSocketBudget(old, 3000, rule);
    assert.equal(result.allowed, true);
    assert.equal(result.state.hits, 1);
  }
  assert.throws(() => consumeSocketBudget(null, NaN, rule), /invalid-socket-budget/);
});
