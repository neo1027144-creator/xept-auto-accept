import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const isWatch = process.argv.includes('--watch');

/** Copy webview assets (CSS/JS) to dist/webview/ for VSIX packaging */
function copyWebviewAssets() {
  const src = 'src/panel/webview';
  const dest = 'dist/webview';
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
  console.log('[esbuild] Webview assets copied to dist/webview/');
}

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: ['vscode'],
};

// Main extension entry
const extensionBuild = esbuild.context({
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
});

// CDP Worker Thread entry (separate bundle, no vscode dependency)
const workerBuild = esbuild.context({
  ...shared,
  entryPoints: ['src/core/cdp-worker.ts'],
  outfile: 'dist/cdp-worker.js',
  external: [], // Worker has no vscode dependency
});

async function main() {
  const [ext, worker] = await Promise.all([extensionBuild, workerBuild]);

  if (isWatch) {
    console.log('[esbuild] Watching for changes...');
    await Promise.all([ext.watch(), worker.watch()]);
  } else {
    await Promise.all([ext.rebuild(), worker.rebuild()]);
    copyWebviewAssets();
    await Promise.all([ext.dispose(), worker.dispose()]);
    console.log('[esbuild] Build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
