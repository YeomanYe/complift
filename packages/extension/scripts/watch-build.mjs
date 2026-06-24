/**
 * Re-run the production build (`pnpm run build` → .output/chrome-mv3) whenever a
 * source file changes. Dependency-free (node:fs.watch).
 *
 * Use this when you load the production build dir (.output/chrome-mv3) and want
 * auto-rebuild without WXT's dev server. For the best DX (auto-rebuild AND
 * auto-reload of the extension in Chrome), prefer `pnpm dev` (the WXT dev
 * server) instead — it outputs to .output/chrome-mv3-dev.
 *
 * After each rebuild you still reload the extension manually in
 * chrome://extensions (the production build has no live-reload hook).
 */
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// NB: do not watch public/ — the build's copy-wasm step writes
// public/esbuild.wasm, which would retrigger the watcher in an infinite loop.
const WATCH_DIRS = ['entrypoints', 'src'];
const WATCH_FILES = ['wxt.config.ts'];
// Skip generated output, deps, and test files — they don't affect the build.
const IGNORE = /(^|[/\\])(node_modules|\.output|\.wxt)([/\\]|$)|\.test\.[cm]?[jt]sx?$/;

let building = false;
let queued = false;
let timer = null;

function build() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  console.log(`\n[watch-build] ${new Date().toLocaleTimeString()} building…`);
  const child = spawn('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => {
    building = false;
    console.log(
      `[watch-build] done (exit ${code}) — reload the extension at chrome://extensions`,
    );
    if (queued) {
      queued = false;
      schedule();
    }
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(build, 200);
}

for (const dir of WATCH_DIRS) {
  try {
    watch(resolve(root, dir), { recursive: true }, (_event, file) => {
      if (file && IGNORE.test(file)) return;
      schedule();
    });
  } catch {
    // Directory may not exist (e.g. no public/) — skip it.
  }
}
for (const file of WATCH_FILES) {
  try {
    watch(resolve(root, file), () => schedule());
  } catch {
    // Missing file — skip.
  }
}

console.log('[watch-build] watching entrypoints/, src/, wxt.config.ts (Ctrl-C to stop)');
build(); // initial build
