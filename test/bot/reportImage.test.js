import { URL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { composeReportImage } from '../../bot/src/reportImage.js';
const sharp = createRequire(new URL('../../bot/package.json', import.meta.url))('sharp');

test('report image preserves complete map/POD, strips metadata and survives missing or invalid media', async () => {
  const map = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#ff0000' } })
    .composite([{ input: { create: { width: 600, height: 30, channels: 3, background: '#00ff00' } }, top: 270, left: 0 }]).png().toBuffer();
  const pod = await sharp({ create: { width: 300, height: 600, channels: 3, background: '#0000ff' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await composeReportImage({ map, pod });
  assert.ok(result.length < 8 * 1024 * 1024);
  const meta = await sharp(result).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 1000);
  assert.equal(meta.height, 1178, 'EXIF orientation applied before sizing');
  assert.equal(meta.exif, undefined);
  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  let red = 0, green = 0, blue = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) red++;
    if (data[i + 1] > 200 && data[i] < 60 && data[i + 2] < 60) green++;
    if (data[i + 2] > 200 && data[i] < 60 && data[i + 1] < 60) blue++;
  }
  assert.ok(red > 10000 && green > 1000 && blue > 10000, 'both images and map bottom attribution strip must survive');
  for (const input of [{}, { map: Buffer.from('broken'), pod: Buffer.from('broken') }, { pod: Buffer.alloc(8 * 1024 * 1024 + 1) }]) {
    assert.equal((await sharp(await composeReportImage(input)).metadata()).format, 'jpeg');
  }
});
