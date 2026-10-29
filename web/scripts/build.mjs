import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = fileURLToPath(new URL('../dist', import.meta.url));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  build({
    absWorkingDir: root,
    entryPoints: ['src/main.ts'],
    outfile: `${dist}/app.js`,
    bundle: true,
    format: 'iife',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  }),
  build({
    absWorkingDir: root,
    entryPoints: ['src/styles.css'],
    outfile: `${dist}/app.css`,
    bundle: true,
    minify: true,
    legalComments: 'none',
    logLevel: 'info',
  }),
]);

await copyFile(`${root}/src/index.html`, `${dist}/index.html`);
console.log('Build complete: dist/index.html, dist/app.js, dist/app.css');
