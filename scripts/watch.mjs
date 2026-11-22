import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Rebuilds blackout.js when a source module or CSV changes.
// Generated files are ignored so a build never retriggers itself.
const root = fileURLToPath(new URL('../', import.meta.url));
const generated = new Set(['blackout.js', 'level-data.js', 'weapon-data.js', 'enemy-data.js', 'audio/sound-data.js']);
const watched = /\.(js|mjs|csv)$/;
const ignoredDirs = /(^|[\\/])(node_modules|\.git|tests)([\\/]|$)/;
let timer = null, running = false, pending = false;

function build() {
  if (running) { pending = true; return; }
  running = true;
  const child = spawn(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
  child.on('close', code => {
    running = false;
    if (code !== 0) console.error(`Build failed (exit ${code}); waiting for changes.`);
    if (pending) { pending = false; build(); }
  });
}

watch(root, { recursive: true }, (_event, file) => {
  if (!file) return;
  const name = file.replaceAll('\\', '/');
  if (ignoredDirs.test(name) || generated.has(name) || !watched.test(name)) return;
  clearTimeout(timer);
  timer = setTimeout(() => { console.log(`Changed: ${name}`); build(); }, 100);
});

console.log('Watching for changes. Press Ctrl+C to stop.');
build();
