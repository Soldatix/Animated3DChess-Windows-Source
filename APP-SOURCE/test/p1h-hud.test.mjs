import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const start = css.indexOf('/* P1H RESPONSIVE HUD:');
const end = css.indexOf('/* P1H END RESPONSIVE HUD */');
const p1h = start >= 0 && end > start ? css.slice(start, end) : '';

test('intermediate desktop HUD is scoped to 769-1180 CSS pixels', () => {
  assert.ok(p1h, 'missing P1H CSS block');
  assert.match(p1h, /@media \(min-width: 769px\) and \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 768px\)/);
});

test('left-aligned rail keeps brand, status and language picker in flow', () => {
  for (const selector of ['#hud-top', '#hud-left', '.brand-pill', '.status-pill', '.wc-language-slot']) {
    assert.ok(p1h.includes(selector), 'missing ' + selector);
  }
  assert.match(p1h, /flex-direction:\s*column/);
  assert.match(p1h, /\.wc-language-slot\s*\{[\s\S]*?position:\s*relative/);
});

test('controls remain fully reachable in a vertically scrollable rail', () => {
  assert.match(p1h, /#hud-right\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(p1h, /#hud-right\s*>\s*\.hud-btn/);
  assert.match(p1h, /overscroll-behavior:\s*contain/);
});

test('no gameplay code or mobile bottom-sheet declarations are needed for this change', () => {
  assert.match(css, /#hud-right\.mobile-sheet-open/);
  assert.match(css, /#btn-mobile-controls/);
});
