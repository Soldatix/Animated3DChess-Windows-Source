import path from 'path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // The web baseline uses package.json; the Windows release uses its Tauri PROD overlay.
  // Do not update package.json to 1.1.0 solely for the Windows release.
  const versionFile = mode === 'desktop' ? 'src-tauri/tauri.p3c-prod.conf.json' : 'package.json';
  const releaseVersion = JSON.parse(readFileSync(path.resolve(versionFile), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw Error('Invalid release version');
  return {
    define: { __CHESS_APP_VERSION__: JSON.stringify(releaseVersion) },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  };
});
