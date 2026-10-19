import { defineConfig } from 'vite-plus';

// Classic-script build of the engine (global `Moteur`), inlined into combat.html by build.ts.
export default defineConfig({
  pack: {
    entry: ['src/engine-global.ts'],
    format: 'iife',
    globalName: 'Moteur',
    platform: 'browser',
    outDir: 'dist/.engine',
    deps: { alwaysBundle: [/^@forestcard\//] },
    minify: false,
    hash: false,
    dts: false,
  },
});
