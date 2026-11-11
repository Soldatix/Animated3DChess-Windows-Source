import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'
);

for (const name of [
  'sw.js',
  'manifest.webmanifest',
  'chess-adsterra-loader.js'
]) {
  await rm(path.join(root, name), { force: true });
}
console.log('DESKTOP_ASSET_CLEANUP=PASS');

// CHESS_V4_CATHEDRAL_EXCLUDE: desktop-only, leave the Web project untouched.
{
  const { existsSync, unlinkSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const obsolete = resolve(process.cwd(), 'dist', 'assets', 'glb', 'option8_cathedral.glb.gz.b64');
  if (existsSync(obsolete)) {
    unlinkSync(obsolete);
    console.log('CHESS_V4_CATHEDRAL_DIST=EXCLUDED');
  } else {
    console.log('CHESS_V4_CATHEDRAL_DIST=ALREADY_ABSENT');
  }
}
