import { defineConfig } from 'vite-plus';

// Effect descriptions as a classic script (global `SiteDescribe`), inlined into index.html by build.ts.
export default defineConfig({
  pack: {
    entry: ['src/describe.ts'],
    format: 'iife',
    globalName: 'SiteDescribe',
    platform: 'browser',
    outDir: 'dist/.describe',
    deps: { alwaysBundle: [/^@forestcard\//] },
    minify: false,
    hash: false,
    dts: false,
  },
});
