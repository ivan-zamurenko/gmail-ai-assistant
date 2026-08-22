/**
 * build.js
 * ========
 * Bundles the extension into dist/ using esbuild.
 *
 * Why a bundler is needed:
 *   Chrome cannot resolve bare module specifiers (`import x from 'pkg'`).
 *   esbuild inlines npm dependencies so the browser only ever sees real files.
 *
 * Directory layout is preserved (outbase: '.'), so src/background/background.js
 * lands at dist/src/background/background.js — meaning manifest.json paths stay
 * valid and can be copied verbatim.
 *
 * Usage:
 *   npm run build        one-off build
 *   npm run watch        rebuild on file change
 *
 * Load the extension in Chrome from the dist/ folder, not the repo root.
 * The "key" field in manifest.json pins the extension ID, so OAuth keeps working.
 */

import * as esbuild from 'esbuild';
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

// Every JS execution context Chrome loads independently needs its own entry point.
const ENTRY_POINTS = [
  'src/background/background.js',
  'src/popup/popup.js',
];

// Copied as-is — not JavaScript, nothing to bundle.
const STATIC_FILES = [
  'assets',
  'src/popup/popup.html',
  'src/popup/popup.css',
];

// The repo root is a loadable extension too, and loading it by mistake kills the
// popup silently on the first bare import. Only the built copy gets the real name.
const SOURCE_MARKER = ' (SOURCE — load dist/ instead)';

async function copyStatic() {
  for (const path of STATIC_FILES) {
    await cp(path, `dist/${path}`, { recursive: true });
  }

  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  manifest.name = manifest.name.replace(SOURCE_MARKER, '');
  await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));
}

const config = {
  entryPoints: ENTRY_POINTS,
  outbase:  '.',
  outdir:   'dist',
  bundle:   true,
  format:   'esm',
  target:   'chrome120',
  platform: 'browser',
  sourcemap: watch ? 'inline' : false,
  minify:    !watch,
  logLevel:  'info',
};

// Console helpers are pasted by hand, so they must not be minified or use
// `export` — the console rejects both.
const consoleConfig = {
  ...config,
  entryPoints: ['src/depot/lookupConsole.js', 'src/depot/futureDateConsole.js'],
  outdir:      'dist/console',
  outbase:     'src/depot',
  format:      'iife',
  minify:      false,
  sourcemap:   false,
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

if (watch) {
  const ctx = await esbuild.context({
    ...config,
    plugins: [{
      name: 'copy-static',
      setup: (b) => b.onEnd(copyStatic),
    }],
  });
  await ctx.watch();
  console.log('watching for changes… (Ctrl+C to stop)');
} else {
  await esbuild.build(config);
  await esbuild.build(consoleConfig);
  await copyStatic();
  console.log('build complete → dist/');
}
