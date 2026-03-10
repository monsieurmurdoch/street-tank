import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  root: 'client',
  envDir: '..', // Look for .env in project root, not client folder
  cacheDir: '/tmp/vite-cache',
  server: {
    port: 5179,
    host: '0.0.0.0',
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
