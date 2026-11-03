import { URL } from 'node:url';
/** Local image adapter. No network, persistence, customer text or generated evidence. */
import { readFile } from 'node:fs/promises';

const WIDTH = 1600;
const PANEL = 792;
const HEADER = 72;
const MAX_BYTES = 8 * 1024 * 1024;
const BACKGROUND = '#202132';
const placeholder = new URL('../assets/pod-unavailable.png', import.meta.url);

export async function composeReportImage({ map, pod } = {}) {
  // Lazy load: missing native support must not stop the bot from starting.
  const { default: sharp } = await import('sharp');
  async function prepare(input) {
    if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES) return null;
    try {
      const image = sharp(input, { limitInputPixels: 20_000_000, failOn: 'warning' });
      const meta = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages ?? 1) !== 1) return null;
      return await image.rotate().resize(PANEL, PANEL, { fit: 'inside' })
        .flatten({ background: BACKGROUND }).png().timeout({ seconds: 2 }).toBuffer({ resolveWithObject: true });
    } catch { console.warn('[report] IMAGE_INPUT_UNAVAILABLE'); return null; }
  }
  const mapImage = await prepare(map);
  let podImage = await prepare(pod);
  if (!podImage) podImage = await prepare(await readFile(placeholder));
  // Static legend only; no customer/provider text is interpolated into SVG.
  const legend = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="72"><circle cx="30" cy="36" r="14" fill="#ea4335"/><text x="56" y="47" font-family="sans-serif" font-size="32" fill="#f4f4f5">scanned point ·</text><circle cx="316" cy="36" r="14" fill="#4285f4"/><text x="342" y="47" font-family="sans-serif" font-size="32" fill="#f4f4f5">delivery address.</text></svg>`);
  const layers = [{ input: legend, top: 0, left: 0 }];
  function panel(image, left) {
    if (!image) return;
    layers.push({ input: image.data, top: HEADER + Math.floor((PANEL - image.info.height) / 2),
      left: left + Math.floor((PANEL - image.info.width) / 2) });
  }
  panel(mapImage, 0);
  panel(podImage, PANEL + 16);
  if (!mapImage) layers.push({ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="792" height="792"><text x="396" y="370" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#f4f4f5">Map unavailable</text><text x="396" y="418" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#f4f4f5">Use the navigation links</text></svg>'), top: HEADER, left: 0 });
  const output = await sharp({ create: { width: WIDTH, height: HEADER + PANEL, channels: 3, background: BACKGROUND } })
    .composite(layers).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).timeout({ seconds: 3 }).toBuffer();
  if (output.length > MAX_BYTES) throw new Error('Report image exceeds size limit');
  return output;
}
