import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest: manifest as any })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Keep output stable/small; crxjs handles entry wiring from the manifest.
    },
  },
});
