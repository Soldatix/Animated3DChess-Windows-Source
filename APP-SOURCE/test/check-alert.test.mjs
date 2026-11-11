import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCheckAlertController } from '../src/checkAlert.mjs';
import { TEXT } from '../src/i18n.js';

function fake() {
  const toasts = [], rings = [], callbacks = new Map();
  let number = 0, lang = 'en';
  const ctrl = createCheckAlertController({
    onToast: (message, visible) => toasts.push({message, visible}),
    onKingRing: color => rings.push(color),
    getMessage: () => TEXT[lang].check,
    schedule: (f, duration) => { assert.equal(duration, 3000); callbacks.set(++number, f); return number; },
    cancel: id => callbacks.delete(id)
  });
  return {ctrl, toasts, rings, callbacks, lang: next => {lang=next;}};
}
const state = (color,inCheck,gameOver=false) => ({ color, inCheck, gameOver });

test('new check shows a translated transient toast and marks checked king', () => {
  const t = fake();
  t.lang('hr'); t.ctrl.update(state('w',true));
  assert.deepEqual(t.toasts.at(-1),{message:'Šah!',visible:true});
  assert.equal(t.rings.at(-1),'w');
  assert.equal(t.callbacks.size,1);
});

test('same checked position and language change never restart the countdown', () => {
  const t = fake(); t.ctrl.update(state('w',true));
  t.lang('de'); t.ctrl.update(state('w',true));
  assert.equal(t.toasts.at(-1).message,'Schach!');
  assert.equal(t.callbacks.size,1);
  const cb=[...t.callbacks.values()][0];cb();
  assert.deepEqual(t.toasts.at(-1),{message:'',visible:false});
  t.ctrl.update(state('w',true));
  assert.equal(t.callbacks.size,1); // callback retained in fake scheduler to emulate expired id
  assert.equal(t.toasts.at(-1).visible,false);
});

test('resolving check and new later check alerts again for either side', () => {
  const t=fake(); t.ctrl.update(state('w',true));t.ctrl.update(state('w',false));
  assert.equal(t.rings.at(-1),null);
  assert.equal(t.toasts.at(-1).visible,false);
  t.ctrl.update(state('b',true));
  assert.equal(t.rings.at(-1),'b');
  assert.equal(t.toasts.at(-1).visible,true);
  t.ctrl.update(state('b',false));
  t.ctrl.update(state('w',true));
  assert.equal(t.toasts.at(-1).visible,true);
});

test('reset and checkmate clear timers and hide both notice and highlight', () => {
  const t=fake(); t.ctrl.update(state('w',true));
  t.ctrl.reset();
  assert.equal(t.callbacks.size,0);
  assert.equal(t.rings.at(-1),null);
  assert.equal(t.toasts.at(-1).visible,false);
  t.ctrl.update(state('b',true));
  t.ctrl.update(state('b',true,true));
  assert.equal(t.callbacks.size,0);
  assert.equal(t.rings.at(-1),null);
});

test('rules modal and check UI integrate without changing chess rules', () => {
  const src = name => readFileSync(new URL(name, import.meta.url),'utf8');
  const app=src('../src/App.tsx'), rules=src('../src/RulesPanel.tsx');
  const info=src('../src/InfoPanel.tsx'), engine=src('../src/wizardChessEngine.js');
  assert.match(app, /ANIMATED 3D CHESS/);
  assert.match(app, /id="btn-rules"/);
  assert.match(app, /id="wc-check-notice"[^>]*className="wc-check-notice" role="status"/);
  assert.match(rules, /role="dialog"/);
  assert.match(rules, /aria-modal="true"/);
  assert.match(rules, /event.key === 'Escape'/);
  assert.doesNotMatch(info, /id="wc-info-lang"/);
  assert.match(engine, /checkAlertController.update\(/);
  assert.match(engine, /kingCheckRing.visible/);
  for (const code of ['en','hr','de','it','es']) {
    assert.match(rules,new RegExp(`"${code}": \\{`));
    assert.ok(TEXT[code].rules && TEXT[code].rulesTitle);
    assert.ok(TEXT[code].check);
  }
});
