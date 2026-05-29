import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'data', dest: '.' },
      ],
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
});
