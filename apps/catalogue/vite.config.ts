import { defineConfig } from 'vite-plus';

// Effect descriptions as a classic script (global `CatalogueDescribe`), inlined into catalogue.html by build.ts.
export default defineConfig({
  pack: {
    entry: ['src/describe.ts'],
    format: 'iife',
    globalName: 'CatalogueDescribe',
    platform: 'browser',
    outDir: 'dist/.describe',
    deps: { alwaysBundle: [/^@forestcard\//] },
    minify: false,
    hash: false,
    dts: false,
  },
});
