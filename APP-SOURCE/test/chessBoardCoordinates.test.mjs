import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardCoordinateLabels } from '../src/chessBoardCoordinates.mjs';

const engine = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/P1gCopy.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const labels = boardCoordinateLabels(0.34);
const find = (symbol, edge) => labels.find(x => x.symbol === symbol && x.edge === edge);

test('exactly 32 edge sprites without 64 square overlays', () => {
  assert.equal(labels.length, 32);
  assert.equal(new Set(labels.map(x=>x.symbol)).size, 16);
});
test('files A-H increase left to right from White viewpoint on both edges', () => {
  for(const edge of ['white','black']) {
    const file = labels.filter(x=>x.kind === 'file' && x.edge === edge);
    assert.deepEqual(file.map(x=>x.symbol),'abcdefgh'.split(''));
    assert.ok(file.every((x,i)=>i===0 || x.x>file[i-1].x));
  }
});
test('rank 8 is far/Black side and rank 1 is near/White side', () => {
  for(const edge of ['a','h']) {
    const rank = labels.filter(x=>x.kind === 'rank' && x.edge === edge);
    assert.deepEqual(rank.map(x=>x.symbol),'87654321'.split(''));
    assert.ok(rank.every((x,i)=>i===0 || x.z>rank[i-1].z));
  }
});
test('a8, b7 and h1 are correctly localized in physical board space', () => {
  const size = 0.34;
  const a = find('a','white');
  const b = find('b','white');
  const r8 = find('8','a');
  const r7 = find('7','a');
  const h = find('h','white');
  const r1 = find('1','a');
  assert.equal(a.x,-3.5*size);
  assert.equal(b.x,-2.5*size);
  assert.equal(h.x,3.5*size);
  assert.equal(r8.z,-3.5*size);
  assert.equal(r7.z,-2.5*size);
  assert.equal(r1.z,3.5*size);
});
test('all text sits strictly outside the gold frame edges', () => {
  const halfBoard=4*0.34;
  assert.ok(labels.every(x=>Math.abs(x.x)>halfBoard || Math.abs(x.z)>halfBoard));
});
test('invalid square size fails closed without geometry', () => {
  assert.deepEqual(boardCoordinateLabels(0),[]);
  assert.deepEqual(boardCoordinateLabels(-1),[]);
  assert.deepEqual(boardCoordinateLabels(Infinity),[]);
  assert.deepEqual(boardCoordinateLabels(NaN),[]);
});
test('engine creates reusable world-space Sprite labels on boardGroup', () => {
  assert.match(engine,/import \{ boardCoordinateLabels \} from '\.\/chessBoardCoordinates\.mjs';/);
  assert.match(engine,/boardGroup\.add\(boardCoordinatesGroup\)/);
  assert.match(engine,/const materials = new Map\(\)/);
  assert.match(engine,/for \(const point of boardCoordinateLabels\(BOARD_SQ_SIZE\)\)/);
  assert.match(engine,/new THREE\.Sprite\(material\)/);
  assert.match(engine,/boardCoordinatesGroup\.add\(label\)/);
});
test('preference defaults off, toggles the group and persists safely', () => {
  assert.match(engine,/let boardCoordinatesVisible = false/);
  assert.match(engine,/boardCoordinatesVisible = localStorage\.getItem\(boardCoordinateStorageKey\) === 'true'/);
  assert.match(engine,/boardCoordinatesGroup\.visible = boardCoordinatesVisible/);
  assert.match(engine,/localStorage\.setItem\(boardCoordinateStorageKey, String\(boardCoordinatesVisible\)\)/);
  assert.match(engine,/toggleBoardCoordinates: \(\) => setBoardCoordinatesVisible\(!boardCoordinatesVisible\)/);
});
test('label sprites do not become raycast targets or require rebuild on reset', () => {
  assert.match(engine,/raycaster\.intersectObjects\(\[\.\.\.pieceMeshes, \.\.\.boardSquareMeshes\], true\)/);
  assert.doesNotMatch(engine,/boardSquareMeshes\.push\(label\)/);
  assert.equal(engine.match(/buildBoardCoordinateLabels\(\);/g)?.length,1);
});
test('accessible React toggle and translations exist for all five languages', () => {
  assert.match(app,/id="btn-coordinates"/);
  assert.match(app,/aria-pressed=\{coordinatesVisible\}/);
  assert.match(app,/toggleBoardCoordinates\?\.\(\)/);
  assert.match(css,/#btn-coordinates/);
  assert.equal(copy.split('coordinates:').length-1,5);
  for (const s of ['Board Coordinates','Koordinate ploče','Brettkoordinaten','Coordinate scacchiera','Coordenadas del tablero'])
    assert.ok(copy.includes(s),s);
});
