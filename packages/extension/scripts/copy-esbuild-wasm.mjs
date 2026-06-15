// Copies the esbuild-wasm binary into public/ so WXT ships it at the
// extension root, where the sandbox page loads it via `./esbuild.wasm`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const src = require.resolve('esbuild-wasm/esbuild.wasm');
const destDir = join(here, '..', 'public');
const dest = join(destDir, 'esbuild.wasm');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`copied esbuild.wasm -> ${dest}`);
