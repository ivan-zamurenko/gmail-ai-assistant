import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import vm from 'node:vm';
import { buildWhatsAppPage } from '../../bot/src/whatsappExport.js';

test('offline export escapes caption, copies separate image/text and bounds duplicate payload', async () => {
  const image = Buffer.from([255,216,255,224,0,1]);
  const caption = 'Parcel recovery & redelivery\n📦 Delivery recorded\n\n🏠 Deliver to\nExample <script>alert(1)</script> & "recipient"\nhttps://www.google.com/maps/';
  const html = buildWhatsAppPage({ image, caption }).toString();
  assert.ok(html.includes('*Parcel recovery &amp; redelivery*'));
  assert.ok(html.includes('📦 *Delivery recorded*'));
  assert.ok(html.includes('\n\n🏠 *Deliver to*'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp;'));
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.match(html, /connect-src 'none'/);
  assert.ok(html.includes('data:image/jpeg;base64,' + image.toString('base64')));
  assert.throws(() => buildWhatsAppPage({ image: Buffer.alloc(4 * 1024 * 1024), caption }));
  assert.throws(() => buildWhatsAppPage({ image, caption: 'x'.repeat(65000) }));
  const expected = caption.replace('Parcel recovery & redelivery','*Parcel recovery & redelivery*').replace('📦 Delivery recorded','📦 *Delivery recorded*').replace('🏠 Deliver to','🏠 *Deliver to*');
  const callbacks = {}, nodes = {}, writes = [];
  const context = { Blob: globalThis.Blob, window: { isSecureContext: true },
    navigator: { clipboard: { write: async x => writes.push(x), writeText: async x => writes.push(x) } },
    ClipboardItem: class { constructor(data) { this.data = data; } },
    document: {
      getElementById(id) { return nodes[id] ??= { textContent: id === 'caption' ? expected : '', naturalWidth: 10, naturalHeight: 10, decode: async () => {}, addEventListener: (_, fn) => { callbacks[id] = fn; } }; },
      createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: fn => fn(new globalThis.Blob(['pixels'], { type: 'image/png' })) }),
    } };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  await callbacks['copy-image']();
  assert.deepEqual(Object.keys(writes[0][0].data), ['image/png']);
  assert.equal((await writes[0][0].data['image/png']).type, 'image/png');
  await callbacks['copy-caption'](); assert.equal(writes[1], expected);
  context.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  await callbacks['copy-caption'](); assert.match(nodes.status.textContent, /Не вдалося/);
});
