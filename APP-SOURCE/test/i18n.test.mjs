import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGE_CODES, LANGUAGE_NAMES, TEXT, getLanguage, setLanguage, t, format, STORAGE_KEY } from '../src/i18n.js';

const ROOT = new URL('../src/', import.meta.url);
const read = name => readFileSync(new URL(name, ROOT), 'utf8');

test('all five translations cover every HUD and engine key', () => {
  assert.deepEqual(LANGUAGE_CODES, ['en','hr','de','it','es']);
  const keys = Object.keys(TEXT.en);
  for (const code of LANGUAGE_CODES) {
    assert.deepEqual(Object.keys(TEXT[code]).sort(), [...keys].sort(), `Missing keys for ${code}`);
    assert.ok(LANGUAGE_NAMES[code]);
    for (const key of keys) assert.ok(typeof TEXT[code][key] === 'string' && TEXT[code][key].length > 0, `${code}.${key}`);
  }
});

test('shared setting persists and supports language change without page reload', () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key,value) => data.set(key,value),
  };
  globalThis.document = { documentElement: { lang:'en' } };
  assert.equal(setLanguage('hr'), true);
  assert.equal(data.get(STORAGE_KEY),'hr');
  assert.equal(getLanguage(), 'hr');
  assert.equal(t('hideUI'),'Sakrij sučelje [H]');
  assert.equal(document.documentElement.lang,'hr');
  assert.equal(setLanguage('xx'), false);
  assert.equal(getLanguage(),'hr');
  assert.equal(format('summoning',{piece:'PAWN'}), 'Priprema figure: PAWN...');
  assert.equal(setLanguage('en'),true);
});

test('blocked storage does not block in-session selection', () => {
  globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(setLanguage('it'), true);
  assert.equal(getLanguage(), 'it');
  assert.equal(t('newGame'), 'Nuova partita');
  setLanguage('en');
});

test('global picker uses inline locally bundled SVG flags for every language', () => {
  const app=read('App.tsx'), picker=read('LanguagePicker.tsx');
  assert.match(app,/className="wc-language-slot"/);
  assert.match(app,/<LanguagePicker language={language} onChange={selectLanguage}/);
  assert.match(picker,/<svg/);
  for(const code of LANGUAGE_CODES) assert.ok(picker.includes(`code === '${code}'`), `No SVG flag ${code}`);
  assert.match(picker,/aria-label/);
});

test('Info dialog uses global props instead of a competing localStorage language', () => {
  const app=read('App.tsx'), info=read('InfoPanel.tsx');
  assert.match(app,/<InfoPanel onClose={closeInfo} language={language} \/>/);
  assert.doesNotMatch(info,/onLanguageChange/);
  assert.doesNotMatch(info,/localStorage\.setItem/);
  assert.doesNotMatch(info, /id=\"wc-info-lang\"/);
});

test('engine re-renders turn, check and checkmate from the chosen language', () => {
  const engine=read('wizardChessEngine.js');
  assert.match(engine,/wizard-chess-language-changed/);
  assert.match(engine,/t\('check'\)/);
  assert.match(engine,/t\('stalemateDraw'\)/);
  assert.match(engine,/t\('showUI'\)/);
  assert.match(engine,/t\('captured'\)/);
  assert.match(engine,/checkmateState\.bannerVisible/);
});
