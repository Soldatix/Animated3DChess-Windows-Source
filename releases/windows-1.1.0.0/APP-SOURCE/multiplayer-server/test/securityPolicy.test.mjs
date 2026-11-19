import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE_LIMITS, AUTH_WINDOW_MS, evaluateRateWindow, socketDeadline, nextSocketAlarm } from '../src/securityPolicy.mjs';

test('strict rate window permits exactly max requests, returns retry-after, resets', () => {
  const rule = RATE_LIMITS.create;
  let state = null;
  for (let n = 1; n <= rule.max; n++) {
    const checked = evaluateRateWindow(state, 1000 + n, rule);
    assert.equal(checked.allowed, true, `request ${n}`);
    state = checked.state;
  }
  const blocked = evaluateRateWindow(state, 1100, rule);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter > 0, true);
  assert.equal(evaluateRateWindow(blocked.state, 1200, rule).state.hits, rule.max + 1);
  const reset = evaluateRateWindow(blocked.state, state.reset_at, rule);
  assert.equal(reset.allowed, true);
  assert.equal(reset.state.hits, 1);
});

test('limits for create, join and connect are separate', () => {
  assert.equal(RATE_LIMITS.create.max < RATE_LIMITS.join.max, true);
  assert.equal(RATE_LIMITS.join.max < RATE_LIMITS.connect.max, true);
  for (const rule of Object.values(RATE_LIMITS)) {
    assert.ok(rule.max > 0 && rule.windowMs >= 1000);
  }
});

test('missing or invalid counters do not grant unlimited requests', () => {
  const rule = RATE_LIMITS.create;
  assert.equal(evaluateRateWindow(null, 1_000, rule).state.hits, 1);
  assert.equal(evaluateRateWindow({reset_at: NaN,hits: 200}, 1_000, rule).state.hits, 1);
  assert.throws(() => evaluateRateWindow(null, NaN, rule), /invalid-rate-window/);
});

test('unauthenticated websocket deadline triggers an alarm and authenticated peers do not', () => {
  const now = 5000;
  const deadline = socketDeadline(now);
  assert.equal(deadline, now + AUTH_WINDOW_MS);
  const sockets = [
    {readyState:1,deserializeAttachment:()=>({side:null,authDeadline:deadline})},
    {readyState:1,deserializeAttachment:()=>({side:'w'})},
    {readyState:2,deserializeAttachment:()=>({side:null,authDeadline:now-1})},
  ];
  assert.equal(nextSocketAlarm(now + 100000, sockets), deadline);
  assert.equal(nextSocketAlarm(now + 100000, sockets.slice(1)), now+100000);
  assert.equal(nextSocketAlarm(now + 100000, [
    {readyState:0,deserializeAttachment:()=>({side:null,authDeadline:deadline})}
  ]), deadline, 'upgrade-in-progress must not skip the auth deadline');
});
