import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();

test('Simplified Single-Player HUD in src/App.tsx excludes speed sliders, notation script bar, and multiplayer lobby', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');

  // Must include simplified game & camera controls
  for (const requiredId of [
    'btn-side-toggle',
    'btn-ai-move',
    'btn-reset',
    'btn-cam-player',
    'btn-cam-top',
    'btn-cam-side',
    'btn-cam-wide',
    'btn-hide-ui',
    'controls-hint',
    'captured-tray'
  ]) {
    assert.ok(appTsx.includes(`id="${requiredId}"`), `Missing required HUD control #${requiredId}`);
  }

  // Must NOT include camera speed sliders, script mode bar, or multiplayer lobby
  for (const forbiddenId of [
    'cam-speed-wrap',
    'input-cam-speed',
    'rot-speed-wrap',
    'input-rot-speed',
    'script-bar',
    'btn-script-modal',
    'btn-script-prev',
    'btn-script-next',
    'btn-lobby',
    'lobby-modal',
    'room-pill',
    'btn-checkmate-stepback'
  ]) {
    assert.ok(!appTsx.includes(forbiddenId), `Forbidden UI element #${forbiddenId} found in App.tsx`);
  }
});


test('Table Edition framing and controls do not use the obsolete Cathedral UI', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const engine = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  assert.ok(app.includes('copy.tableView'), 'Wide camera should have a localized Table View label');
  assert.ok(!app.includes('Wide Cathedral View'), 'Old Cathedral button tooltip must be removed');
  assert.ok(engine.includes('camera.position.set(0, 3.3, 5.4)'), 'Initial camera should show the board');
  assert.ok(engine.includes('const desiredPos = new THREE.Vector3(0, 3.3, zSign * 5.4)'), 'Player camera flip should use the wide framing');
  assert.ok(engine.includes('new THREE.CanvasTexture(grainCanvas)'), 'Tabletop should have lightweight procedural grain');
  assert.ok(engine.includes('const borderOffset = 1.50'), 'Tabletop should have decorative inlay');
});

test('All 6 animated piece assets decode and gunzip to valid glTF 2.0 binary models', () => {
  const expectedModels = [
    'pawn_white',
    'rook_white',
    'knight_white',
    'bishop_white',
    'queen_white',
    'king_white'
  ];

  const engineSource = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  assert.ok(!engineSource.includes("loadGltfModel('option8_cathedral')"), 'Cathedral GLB must not load at runtime');
  assert.ok(engineSource.includes('buildTableStage();'), 'Procedural table should be present');

  for (const name of expectedModels) {
    const b64Path = path.join(ROOT, 'public/assets/glb', `${name}.glb.gz.b64`);
    assert.ok(fs.existsSync(b64Path), `Missing 3D asset ${b64Path}`);
    const b64Text = fs.readFileSync(b64Path, 'utf-8').trim();
    assert.ok(b64Text.length > 1000, `Asset ${name}.glb.gz.b64 is unexpectedly small`);

    const gzBuf = Buffer.from(b64Text, 'base64');
    const glbBuf = zlib.gunzipSync(gzBuf);

    const magic = glbBuf.toString('ascii', 0, 4);
    const version = glbBuf.readUInt32LE(4);
    const totalLen = glbBuf.readUInt32LE(8);
    assert.equal(magic, 'glTF', `Invalid glTF magic header for ${name}`);
    assert.equal(version, 2, `Invalid glTF version for ${name}`);
    assert.equal(totalLen, glbBuf.length, `Mismatched glTF byte length for ${name}`);
  }
});


test('Apps & Games Info panel has mobile/desktop entry, five languages and required support sections', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  const info = fs.readFileSync(path.join(ROOT, 'src/InfoPanel.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/info-panel.css'), 'utf8');
  assert.ok(app.includes('id="btn-info"'), 'Info button missing');
  assert.ok(app.includes('<InfoPanel onClose={closeInfo} language={language} />'), 'Info dialog must share the global language');
  assert.ok(info.includes('role="dialog"') && info.includes('aria-modal="true"'), 'Accessible dialog markers missing');
  assert.ok(info.includes("event.key === 'Escape'") && info.includes("event.key !== 'Tab'"), 'Keyboard close/trap missing');
  for (const code of ['en', 'hr', 'de', 'it', 'es']) {
    assert.match(info, new RegExp('\\b' + code + ': \\{'), 'No Info translation for ' + code);
  }
  for (const marker of ['https://appsandgames.org/#info', 'mailto:info@appsandgames.org', 'PayPal', 'Stripe']) {
    assert.ok(info.includes(marker), 'Missing Info/Support marker: ' + marker);
  }
  assert.ok(css.includes('max-height: min(760px, 94dvh)'), 'Info dialog must stay within viewport');
});
