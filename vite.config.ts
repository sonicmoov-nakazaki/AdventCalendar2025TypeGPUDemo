import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [typegpu({})],
  base: '/AdventCalendar2025TypeGPUDemo/',
  server: {
    open: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        triangle: resolve(__dirname, 'triangle.html'),
        particle: resolve(__dirname, 'particle.html'),
        snowdome: resolve(__dirname, 'snowdome.html'),
      },
    },
  },
});
