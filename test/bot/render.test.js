import test from 'node:test';
import assert from 'node:assert/strict';

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
  assert.equal(output.embeds.length, 2);
  assert.equal(output.files.length, 0);
  const [main, history] = output.embeds.map((embed) => embed.toJSON());
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.equal(main.fields.find((field) => field.name === 'Recipient').value, 'Jane Doe, Example Ltd');
  assert.equal(main.fields.find((field) => field.name === 'Mobile').value, '0871234567');
  assert.equal(main.fields.find((field) => field.name === 'Eircode').value, 'D01AB12');
  assert.match(main.fields.find((field) => field.name === 'Address').value, /1 Main Street/);
  assert.match(plain, /Received\s{2}28 Aug 12:00:00\s{2}cad\s{2}Bay:32 Seq:5/);
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
  const history = embeds[1].toJSON();
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.equal(history.title, 'History (1)');
  assert.match(plain, /CAD scan\s{2}03 Sep 08:34:16\s{2}cad\s{2}Bay:11 Seq:90/);
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
  const history = embeds[1].toJSON();
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.doesNotMatch(plain, /NearRoute/);
  assert.doesNotMatch(plain, /Nearest Route Assigned/);
  assert.match(plain, /CAD scan\s{2}03 Sep 08:34:16\s{2}cad\s{2}Bay:11 Seq:90/);
});

test('parcel card shows scan GPS when dropped Eircode is unavailable', async () => {
  const parcel = {
    query: '123456789', consNumber: '123456789', drop: { lat: 52.037612, lng: -9.994881 },
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: '', mobile: '', email: '', lines: ['1 Main Street'], town: 'Dublin', county: 'Dublin', postCode: 'D01AB12', depot: '22' },
    scans: [{ parcel: '1', type: 'Delivered', date: '03/09/2026', time: '08:55:20', route: 'cad' }],
  };

  const { embeds } = await buildParcelEmbed(parcel, '');
  const main = embeds[0].toJSON();
  assert.match(main.description, /🔴 S: 52\.037612, -9\.994881/);
  assert.match(main.description, /Open scan location in Google Maps/);
  assert.doesNotMatch(main.description, /dropped ≈ —/);
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
  assert.equal(embeds[2].toJSON().title, 'POD photo');
  assert.equal(embeds[2].toJSON().image.url, 'attachment://pod.jpg');
});
