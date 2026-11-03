import { URL } from 'node:url';
/** Local image adapter. No network, persistence, customer text or generated evidence. */
import { readFile } from 'node:fs/promises';

const WIDTH = 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const BACKGROUND = '#ffffff';
const placeholder = new URL('../assets/pod-unavailable.png', import.meta.url);

export async function composeReportImage({ map, pod } = {}) {
  // Lazy load: missing native support must not stop the bot from starting.
  const { default: sharp } = await import('sharp');
  async function prepare(input, maxHeight) {
    if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES) return null;
    try {
      const image = sharp(input, { limitInputPixels: 20_000_000, failOn: 'warning' });
      const meta = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages ?? 1) !== 1) return null;
      return await image.rotate().resize(WIDTH, maxHeight, { fit: 'inside' })
        .flatten({ background: BACKGROUND }).png().timeout({ seconds: 2 }).toBuffer({ resolveWithObject: true });
    } catch { console.warn('[report] IMAGE_INPUT_UNAVAILABLE'); return null; }
  }
  const mapImage = await prepare(map, 650);
  let podImage = await prepare(pod, 950);
  if (!podImage) podImage = await prepare(await readFile(placeholder), 650);
  const layers = [];
  let top = 0;
  function label(text, { legend = false, height = 68 } = {}) {
    // Text is internal static copy only, never customer/provider strings.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}"><rect width="1000" height="${height}" fill="#f4f4f5"/><text x="28" y="42" font-family="sans-serif" font-size="27" font-weight="600" fill="#262626">${text}</text>${legend ? '<circle cx="30" cy="79" r="8" fill="#ea4335"/><text x="48" y="86" font-family="sans-serif" font-size="22">Recorded point</text><circle cx="300" cy="79" r="8" fill="#4285f4"/><text x="318" y="86" font-family="sans-serif" font-size="22">Delivery address</text>' : ''}</svg>`;
    layers.push({ input: Buffer.from(svg), top, left: 0 });
    top += height;
  }
  function panel(image) {
    if (!image) return;
    layers.push({ input: image.data, top, left: Math.floor((WIDTH - image.info.width) / 2) });
    top += image.info.height;
  }
  label(mapImage ? 'Delivery map — overview' : 'Map unavailable — use the navigation links', { legend: !!mapImage, height: mapImage ? 110 : 68 });
  panel(mapImage);
  label('Delivery photo');
  panel(podImage);
  const output = await sharp({ create: { width: WIDTH, height: top, channels: 3, background: BACKGROUND } })
    .composite(layers).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).timeout({ seconds: 3 }).toBuffer();
  if (output.length > MAX_BYTES) throw new Error('Report image exceeds size limit');
  return output;
}
