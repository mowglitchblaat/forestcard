import { defineConfig } from 'vite-plus';

// One page, served at the site's root as combat-3d.html (tools/pages/assemble.ts): relative URLs, its
// scripts in their own folder (overlay-3d/) so they never meet the React site's assets/.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'overlay-3d',
    emptyOutDir: true,
  },
});
