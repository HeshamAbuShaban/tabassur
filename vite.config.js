import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext'
  },
  server: {
    port: 3000,
    host: true,
    open: false
  },
  preview: {
    port: 4173,
    host: true
  },
  optimizeDeps: {
    include: ['three']
  }
});
