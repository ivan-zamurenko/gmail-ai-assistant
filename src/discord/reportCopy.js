/** Read only an explicitly clicked, visible report. No Discord API/session access. */
export function attachmentUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
        || url.port || url.username || url.password || url.hash
        || !/^\/(?:ephemeral-attachments|attachments)\/\d{1,20}\/\d{1,20}\/driver-report\.jpg$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

// Discord renders Unicode emoji as images; innerText alone drops their alt text.
function reportText(node) {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (node.tagName === 'BR') return '\n';
  if (node.tagName === 'IMG') return node.getAttribute('alt') ?? '';
  if (node.tagName === 'A') {
    try {
      const url = new URL(node.href);
      if (url.origin === 'https://www.google.com' && url.pathname.startsWith('/maps/')) return url.href;
    } catch { /* Keep ordinary visible text. */ }
  }
  if (!node.childNodes) return node.innerText ?? node.textContent ?? '';
  return [...node.childNodes].map(reportText).join('') + (['DIV','P'].includes(node.tagName) ? '\n' : '');
}

export function readReport(row) {
  if (!row.isConnected) return null;
  const contents = row.querySelectorAll('[id^="message-content-"]');
  if (contents.length !== 1) return null;
  const content = contents[0];
  let caption = reportText(content);
  caption = caption.trim();
  if (caption.length > 1900 || !/^Parcel recovery & redelivery\s+Consignment: (?:\d{14}|\d{9}) · Parcel \S+/.test(caption)
      || !caption.includes('https://www.google.com/maps/dir/')) return null;
  const urls = [...new Set([...row.querySelectorAll('a[href]')].map(link => attachmentUrl(link.href)).filter(Boolean))];
  return urls.length === 1 ? { caption, url: urls[0] } : null;
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Unsupported image');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 2; i + 4 <= bytes.length;) {
    if (bytes[i++] !== 255) throw new Error('Invalid image');
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 217 || marker === 218) break;
    const length = view.getUint16(i);
    if (length < 2 || i + length > bytes.length) throw new Error('Invalid image');
    if ([192,193,194].includes(marker)) {
      if (length < 7) break;
      const height = view.getUint16(i + 3), width = view.getUint16(i + 5);
      if (!width || !height || width > 2000 || height > 2000) break;
      return { width, height };
    }
    i += length;
  }
  throw new Error('Image dimensions unavailable or too large');
}

export async function imagePng(value, { fetchImage = fetch,
  decode = blob => globalThis.createImageBitmap(blob), canvas = () => document.createElement('canvas') } = {}) {
  const url = attachmentUrl(value);
  if (!url) throw new Error('Unsupported attachment');
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let reader;
  try {
    const response = await fetchImage(url, { credentials: 'omit', redirect: 'error', signal: controller.signal, cache: 'no-store' });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg'
        || Number(response.headers.get('content-length')) > 8 * 1024 * 1024 || !response.body) throw new Error('Image unavailable');
    reader = response.body.getReader();
    const parts = []; let size = 0;
    while (true) {
      const { done, value: part } = await reader.read();
      if (done) break;
      size += part.length;
      if (size > 8 * 1024 * 1024) throw new Error('Image too large');
      parts.push(part);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    const dimensions = jpegDimensions(bytes);
    const bitmap = await decode(new Blob([bytes], { type: 'image/jpeg' }));
    try {
      if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height) throw new Error('Image dimensions changed');
      const target = canvas(); target.width = bitmap.width; target.height = bitmap.height;
      target.getContext('2d').drawImage(bitmap, 0, 0);
      return await new Promise((resolve, reject) => target.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image conversion failed')), 'image/png'));
    } finally { bitmap.close(); }
  } finally {
    clearTimeout(timeout); controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}
