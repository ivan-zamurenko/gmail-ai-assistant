/**
 * tools/barcodeTest/build.js
 * ==========================
 * Builds a throwaway page that runs the real barcode reader over every photo
 * in labels_example/.
 *
 * The photos are inlined as data URLs: a canvas fed from a file:// image is
 * tainted and getImageData throws, which would look like a decoding failure.
 *
 *   node tools/barcodeTest/build.js
 */

import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const LABELS = 'labels_example';
const OUT    = path.join(process.env.TMPDIR || '/tmp', 'barcode-test');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

fs.mkdirSync(OUT, { recursive: true });

await esbuild.build({
  entryPoints: ['tools/barcodeTest/main.js'],
  outfile: path.join(OUT, 'bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
});

const images = fs.readdirSync(LABELS)
  .filter((name) => MIME[path.extname(name).toLowerCase()])
  .sort()
  .map((name) => ({
    name,
    date: fs.statSync(path.join(LABELS, name)).mtime.toISOString().slice(0, 10),
    src: `data:${MIME[path.extname(name).toLowerCase()]};base64,${fs.readFileSync(path.join(LABELS, name)).toString('base64')}`,
  }));

fs.writeFileSync(path.join(OUT, 'images.js'), `window.LABELS = ${JSON.stringify(images)};`);
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  '<!doctype html><meta charset=utf-8><title>barcode test</title>'
  + '<script src="images.js"></script><script src="bundle.js"></script>',
);

console.log(`${images.length} labels → ${OUT}/index.html`);
