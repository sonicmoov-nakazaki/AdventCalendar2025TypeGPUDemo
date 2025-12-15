import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu({})],
  base: '/AdventCalendar2025TypeGPUDemo/',
  server: {
    open: true,
  },
  build: {
    outDir: 'dist',
  },
});
