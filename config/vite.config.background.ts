import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '..'),
  build: {
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, '../src/extension/background/index.ts'),
      name: 'JevXBackground',
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
});
