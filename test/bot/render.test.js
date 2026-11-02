import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { buildParcelEmbed } from '../../bot/src/render.js';

test('the private parcel card renders full recipient details and CAD location', async () => {
  const parcel = {
    query:      '123456789',
    consNumber: '123456789',
    drop:       null,
    arrangedDate: '29/08/2026',
    address: {
      contact: 'Jane Doe', company: 'Example Ltd', mobile: '0871234567',
      email: 'jane@example.test', lines: ['1 Main Street'], town: 'Dublin',
      county: 'Dublin', postCode: 'D01AB12', depot: '22',
    },
    scans: [{
      parcel: '1', type: 'Received', date: '28/08/2026', time: '12:00:00',
      route: 'cad', bay: '32', sequence: '5', signature: 'J DOE',
    }],
  };
  const output = await buildParcelEmbed(parcel, '');
  assert.equal(output.embeds.length, 3);
  assert.equal(output.files.length, 1);
  const placeholder = output.files[0];
  assert.equal(placeholder.name, 'pod-unavailable.png');
  assert.equal(placeholder.attachment, fileURLToPath(new URL('../../bot/assets/pod-unavailable.png', import.meta.url)));
  const image = await readFile(placeholder.attachment);
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const photo = output.embeds[1].toJSON();
  assert.equal(photo.title, 'Delivery photo unavailable');
  assert.equal(photo.image.url, 'attachment://pod-unavailable.png');
  const [main, , history] = output.embeds.map((embed) => embed.toJSON());
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.match(main.fields.find(field => field.name === 'Delivery address').value, /Jane Doe.*Example Ltd/s);
  assert.match(main.fields.find(field => field.name === 'Contact').value, /0871234567/);
  assert.match(main.fields.find(field => field.name === 'Delivery address').value, /D01AB12/);
  assert.match(main.fields.find(field => field.name === 'Delivery address').value, /1 Main Street/);
  assert.match(plain, /28 Aug 12:00:00.*Received.*cad.*Bay:32 Seq:5/);
  assert.doesNotMatch(plain, /B32\/#5/);
});
test('history rows keep each status on one line', async () => {
  const parcel = {
    query: '123456789',
    consNumber: '123456789',
    drop: null,
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: 'Example Ltd', mobile: '0871234567', email: 'jane@example.test', lines: ['1 Main Street'], town: 'Dublin', county: 'Dublin', postCode: 'D01AB12', depot: '22' },
    scans: [
      { parcel: '1', type: 'Nearest Route Assigned', date: '03/09/2026', time: '08:55:20', route: 'NearRoute' },
      { parcel: '1', type: 'CAD scan', date: '03/09/2026', time: '08:34:16', route: 'cad', bay: '11', sequence: '90', signature: 'J DOE' },
    ],
  };

  const { embeds } = await buildParcelEmbed(parcel, '');
  const history = embeds[2].toJSON();
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.equal(history.title, 'History (1)');
  assert.match(plain, /03 Sep 08:34:16.*CAD scan.*cad.*Bay:11 Seq:90/);
});

test('NearRoute is hidden from the operator-facing history log', async () => {
  const parcel = {
    query: '123456789',
    consNumber: '123456789',
    drop: null,
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: 'Example Ltd', mobile: '0871234567', email: 'jane@example.test', lines: ['1 Main Street'], town: 'Dublin', county: 'Dublin', postCode: 'D01AB12', depot: '22' },
    scans: [
      { parcel: '1', type: 'Nearest Route Assigned', date: '03/09/2026', time: '08:55:20', route: 'NearRoute', bay: '11', sequence: '90', signature: 'J DOE' },
      { parcel: '1', type: 'CAD scan', date: '03/09/2026', time: '08:34:16', route: 'cad', bay: '11', sequence: '90', signature: 'J DOE' },
    ],
  };

  const { embeds } = await buildParcelEmbed(parcel, '');
  const history = embeds[2].toJSON();
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.doesNotMatch(plain, /NearRoute/);
  assert.doesNotMatch(plain, /Nearest Route Assigned/);
  assert.match(plain, /03 Sep 08:34:16.*CAD scan.*cad.*Bay:11 Seq:90/);
});

test('parcel card shows scan GPS when dropped Eircode is unavailable', async () => {
  const parcel = {
    query: '123456789', consNumber: '123456789', drop: { type: 'Delivered', lat: 52.037612, lng: -9.994881 },
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: '', mobile: '', email: '', lines: ['1 Main Street'], town: 'Dublin', county: 'Dublin', postCode: 'D01AB12', depot: '22' },
    scans: [{ parcel: '1', type: 'Delivered', date: '03/09/2026', time: '08:55:20', route: 'cad' }],
  };

  const { embeds } = await buildParcelEmbed(parcel, '');
  const main = embeds[0].toJSON();
  assert.match(main.fields.find(field => field.name === 'Recorded location').value, /52\.037612, -9\.994881/);
  assert.match(main.fields.find(field => field.name === 'Recorded location').value, /Open scan location/);
  assert.doesNotMatch(JSON.stringify(main), /dropped ≈ —/);
});

test('parcel card includes the POD image attachment', async () => {
  const parcel = {
    query: '123456789', consNumber: '123456789', drop: null,
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: '', mobile: '', email: '', lines: [], town: '', county: '', postCode: '', depot: '' },
    scans: [{ parcel: '1', type: 'Delivered', date: '03/09/2026', time: '08:55:20', route: 'V17' }],
    pod: { mime: 'image/jpeg', body: '/9j/4AAQ' },
  };

  const { embeds, files } = await buildParcelEmbed(parcel, '');
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'pod.jpg');
  assert.equal(embeds[1].toJSON().title, 'POD photo');
  assert.equal(embeds[1].toJSON().image.url, 'attachment://pod.jpg');
});

const plainText = output => output.embeds.map(embed => JSON.stringify(embed.toJSON())).join('\n').replaceAll('\\u001b', '').replace(/\[[0-9;]*m/g, '');

test('cards sort scans explicitly, count physical parcels and disclose capped history', async () => {
  const scans = Array.from({ length: 14 }, (_, i) => ({ parcel: i === 13 ? '2' : '1', type: i === 13 ? 'Delivered' : 'Received', date: `${String(i + 1).padStart(2, '0')}/10/2026`, time: '10:00:00', route: 'R1' }));
  scans.push({ parcel: '0', type: 'Received', date: '30/10/2026', time: '12:00:00' });
  const output = await buildParcelEmbed({ consNumber: '123456789', address: {}, scans: [scans[13], ...scans.slice(0, 13), scans[14]] }, '');
  const [main, , history] = output.embeds.map(embed => embed.toJSON());
  assert.match(main.title, /Delivered \(1\/2\)/);
  const body = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.match(body, /14 Oct/);
  assert.ok(body.indexOf('14 Oct') < body.indexOf('13 Oct'));
  assert.match(body, /\+2 earlier/);
  assert.doesNotMatch(body, /01 Oct|02 Oct|P0/);
  assert.doesNotMatch(main.fields.find(field => field.name === 'Parcels').value, /Parcel 0/);
});

test('malformed and oversized card values remain honest, bounded and cannot inject Discord formatting', async () => {
  for (const parcel of [{}, { scans: [] }, { scans: [{ parcel: '1', type: 'Delivered', date: '31/02/2026', time: '10:00:00' }] }, { scans: [{ parcel: '', type: 'Received', date: '01/11/2026', time: '' }] }]) {
    const result = await buildParcelEmbed(parcel, '');
    assert.match(plainText(result), /unknown|unconfirmed|no scan/i);
    assert.doesNotMatch(plainText(result), /31 Feb|Parcel 1/);
  }
  const clippedAddress = await buildParcelEmbed({ address: { lines: ['1 Main Street'], truncated: true },
    drop: { type: 'Delivered', lat: 53, lng: -6 }, scans: [{ parcel: '1', type: 'Received', date: '01/11/2026', time: '12:00:00' }],
  }, '');
  assert.doesNotMatch(plainText(clippedAddress), /maps\/dir|destination=/);
  const unassigned = await buildParcelEmbed({ scans: [
    { parcel: '1', type: 'Delivered', date: '01/11/2026', time: '12:00:00' },
    { parcel: '', type: 'Redirected', date: '01/11/2026', time: '13:00:00' },
  ] }, '');
  assert.match(unassigned.embeds[0].toJSON().title, /Latest status unconfirmed/);
  assert.match(plainText(unassigned), /Unassigned.*Redirected/);
  const hostile = '``` @everyone <@123> \u001b[31m ** [click](https://evil.test)'.repeat(300);
  const output = await buildParcelEmbed({ consNumber: hostile, query: hostile,
    address: { contact: hostile, company: hostile, lines: Array(20).fill(hostile), mobile: hostile, email: hostile, depot: hostile, postCode: hostile },
    arrangedDate: hostile,
    scans: Array.from({ length: 40 }, (_, i) => ({ parcel: String(i + 1), type: hostile, signature: hostile, date: '01/11/2026', time: '12:00:00', route: hostile, bay: hostile, sequence: hostile, onwardBc: hostile })),
  }, '');
  assert.deepEqual(output.allowedMentions, { parse: [] });
  let total = 0;
  for (const embed of output.embeds.map(item => item.toJSON())) {
    assert.ok((embed.title?.length ?? 0) <= 256);
    assert.ok((embed.description?.length ?? 0) <= 4096);
    total += (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0);
    for (const field of embed.fields ?? []) { assert.ok(field.value.length <= 1024); total += field.name.length + field.value.length; }
  }
  assert.ok(total <= 6000);
  assert.doesNotMatch(JSON.stringify(output.embeds.map(item => item.toJSON())), /@everyone|<@123>|\\u001b\[31m|\[click\]\(/);
  for (const embed of output.embeds.map(item => item.toJSON())) {
    for (const value of [embed.description, ...(embed.fields ?? []).map(field => field.value)]) {
      if (value?.startsWith('```ansi')) assert.equal((value.match(/```/g) ?? []).length, 2);
    }
  }
  const emailCard = await buildParcelEmbed({ address: { email: 'a_b@example.test' }, scans: [] }, '');
  assert.match(plainText(emailCard), /a_b@example\.test/);
  const unicode = '𠮷'.repeat(100);
  const unicodeCard = await buildParcelEmbed({ address: { lines: Array(5).fill(unicode), town: unicode, county: unicode },
    scans: Array.from({ length: 6 }, (_, i) => ({ parcel: String(i + 1), type: unicode, date: '01/11/2026', time: '12:00:00' })),
  }, '');
  assert.ok(unicodeCard.embeds.every(embed => (embed.toJSON().fields ?? []).every(field => field.value.length <= 1024)));
  const undelivered = await buildParcelEmbed({ address: {}, scans: [{ parcel: '1', type: 'Undelivered', date: '01/11/2026', time: '12:00:00' }] }, '');
  assert.notEqual(undelivered.embeds[0].toJSON().color, 0x2ecc71);
  const mixed = await buildParcelEmbed({ address: {}, scans: [{ parcel: '1', type: 'Received', date: '01/11/2026', time: '12:00:00' }, { parcel: '1', type: 'Delivered', date: 'invalid', time: '12:00:00' }] }, '');
  assert.match(mixed.embeds[0].toJSON().title, /unknown|unconfirmed/i);
  const badDate = await buildParcelEmbed({ scans: Array(15).fill({ type: 'Delivered', date: '01/11/2026junk', time: '12:00:00junk' }) }, '');
  assert.match(plainText(badDate), /Unknown time/);
  assert.match(plainText(badDate), /3 not shown/);
  assert.doesNotMatch(plainText(badDate), /01 Nov|earlier/);
  const invalidParcel = await buildParcelEmbed({ scans: [
    { parcel: '1234567', type: 'Delivered', date: '01/11/2026', time: '12:00:00' },
    { parcel: '2', type: 'Received', date: '01/11/2026', time: '11:00:00' },
  ] }, '');
  assert.doesNotMatch(invalidParcel.embeds[0].toJSON().title, /\(1\/2\)/);
  for (const lines of [[], ['𠮷'.repeat(400)], ['bad' + String.fromCharCode(0xd800)]]) {
    const map = await buildParcelEmbed({ address: { lines }, drop: { type: 'Delivered', lat: 53, lng: -6 }, scans: [] }, '');
    assert.doesNotMatch(plainText(map), /destination=/);
    assert.match(plainText(map), /Open scan location/);
  }
});


test('find overview leads with facts, groups details and only maps delivery or attempted-delivery scans', async () => {
  const parcel = { query: '123456789', consNumber: '123456789', address: { contact: 'Example Recipient', lines: ['1 Example Road'], town: 'Dublin', county: 'Dublin', postCode: 'D02AF30', mobile: '000000000', email: 'example@example.invalid' },
    scans: [{ parcel: '1', type: 'Delivered', date: '02/11/2026', time: '12:34:56', route: '123', signature: 'Example signer' }],
    drop: { type: 'Delivered', lat: 53, lng: -6 } };
  const result = await buildParcelEmbed(parcel, '');
  const main = result.embeds[0].toJSON();
  assert.deepEqual(main.fields.map(field => field.name), ['Latest event', 'Delivery address', 'Contact', 'Recorded location']);
  assert.match(main.fields[0].value, /02 Nov 12:34:56/);
  assert.match(main.fields[0].value, /Route 123/);
  assert.match(main.fields[0].value, /Signed for by: Example signer/);
  assert.equal((main.fields[1].value.match(/Dublin/g) ?? []).length, 1);
  assert.match(main.footer.text, /Photo and location may refer to different parcels or events/);
  assert.doesNotMatch(main.footer.text, /searched as/i);
  assert.doesNotMatch(JSON.stringify(result.embeds.map(embed => embed.toJSON())), /\\u001b|```|searched as|->|off target/);
  for (const type of ['Goods Held', undefined]) {
    const excluded = await buildParcelEmbed({ ...parcel, drop: { ...parcel.drop, type } }, '');
    assert.doesNotMatch(plainText(excluded), /Recorded location|maps\/|53\.000000/);
  }
  const longTarget = await buildParcelEmbed({ ...parcel, address: { lines: ['A'.repeat(790)] } }, '');
  assert.ok(longTarget.embeds[0].toJSON().fields.every(field => field.value.length <= 1024));
  assert.doesNotMatch(plainText(longTarget), /maps\/dir|destination=/);
  const fullAddress = await buildParcelEmbed({ ...parcel, address: {
    contact: 'A'.repeat(100), company: 'B'.repeat(100), lines: ['C', 'D', 'E', 'F', 'G'].map(letter => letter.repeat(100)),
    town: 'H'.repeat(100), county: 'I'.repeat(100), postCode: 'J'.repeat(100),
  } }, '');
  assert.ok(fullAddress.embeds[0].toJSON().fields.every(field => field.value.length <= 1024));
  const attempted = await buildParcelEmbed({ ...parcel, drop: { ...parcel.drop, type: 'Carded' } }, '');
  assert.match(plainText(attempted), /Attempted delivery/);
  assert.doesNotMatch(plainText(attempted), /maps\/dir|dropped|off target/);
});
