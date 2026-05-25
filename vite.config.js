import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// map.js replaced by src/main.js (ES modules, T-1.3). Remaining scripts are
// still plain globals and must be copied verbatim for the build.
const legacyScripts = [
  'formats.js', 'db.js', 'venue.js', 'venue-worker.js', 'tilt-toggle.js',
];

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
        ...legacyScripts.map(f => ({ src: f, dest: '.' })),
        { src: 'data',  dest: '.' },
      ],
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
});
