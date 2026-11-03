import { formatWhatsAppCaption } from '../../shared/whatsappCaption.js';
/** Standalone local export. Customer values enter escaped text/data only. */
const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function buildWhatsAppPage({ image, caption }) {
  if (!Buffer.isBuffer(image) || image.length > 3 * 1024 * 1024
      || typeof caption !== 'string' || Buffer.byteLength(caption) > 64000) throw new Error('Export size limit');
  caption = formatWhatsAppCaption(caption);
  const mime = image.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'image/jpeg'
    : image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : null;
  if (!mime) throw new Error('Unsupported export image');
  const html = `<!doctype html>
<html lang="uk">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Report for WhatsApp</title>
<style>body{font:18px system-ui;max-width:1000px;margin:32px auto;padding:20px;background:#202132;color:#f4f4f5}img{width:100%;height:auto;border-radius:10px}button{font:inherit;padding:14px 20px;margin:6px 8px 6px 0;border:0;border-radius:8px;background:#c60038;color:white;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#2d2e40;padding:18px;border-radius:8px;font:inherit}#status{min-height:3em}small{display:block;margin-top:24px;color:#c5c6d2}</style>
<h1>Report for WhatsApp</h1>
<p>1. Скопіюй і встав картинку у WhatsApp. 2. Повернись, скопіюй підпис і встав його в поле під картинкою.</p>
<button id="copy-image">1. Копіювати картинку</button>
<button id="copy-caption">2. Копіювати підпис</button>
<p id="status" role="status">Спочатку встав картинку; друга кнопка замінює вміст буфера.</p>
<img id="preview" alt="Карта та фото доставки" src="data:${mime};base64,${image.toString('base64')}">
<pre id="caption">${escapeText(caption)}</pre>
<small>Файл працює локально й нічого не надсилає автоматично. Він містить дані доставки: видалення повідомлення у Discord не видаляє завантажений файл.</small>
<script>
const image = document.getElementById('preview');
const caption = document.getElementById('caption').textContent;
const status = document.getElementById('status');
document.getElementById('copy-image').addEventListener('click', async () => {
 if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
  status.textContent='Браузер не дозволяє копіювання. Відкрий завантажений файл у Chrome.';return;
 }
 try {
  const png = (async () => {
   await image.decode();
   const canvas = document.createElement('canvas');
   canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   canvas.getContext('2d').drawImage(image,0,0);
   return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image unavailable')), 'image/png'));
  })();
  void png.catch(() => {});
  await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
  status.textContent='Картинку скопійовано. Ctrl+V у WhatsApp, потім повернись за підписом.';
 } catch { status.textContent='Не вдалося скопіювати картинку. Перевір дозвіл браузера; нічого не надіслано.'; }
});
document.getElementById('copy-caption').addEventListener('click', async () => {
 try {
  if (!window.isSecureContext || !navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(caption);
  status.textContent='Підпис скопійовано. Натисни поле підпису під картинкою у WhatsApp та Ctrl+V.';
 } catch { status.textContent='Не вдалося скопіювати підпис. Відкрий файл у Chrome та перевір дозвіл браузера.'; }
});
</script>
</html>`;
  const result = Buffer.from(html);
  // Include the separately attached image and optional long-text fallback in the budget.
  if (result.length + image.length + Buffer.byteLength(caption) > 8 * 1024 * 1024) throw new Error('Export size limit');
  return result;
}
