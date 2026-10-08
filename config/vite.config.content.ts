import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '..'),
  build: {
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, '../src/extension/content/index.ts'),
      name: 'JevXContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'content.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
