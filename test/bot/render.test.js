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
  assert.equal(main.fields.find((field) => field.name === 'Recipient').value, 'Jane Doe, Example Ltd');
  assert.equal(main.fields.find((field) => field.name === 'Mobile').value, '0871234567');
  assert.equal(main.fields.find((field) => field.name === 'Eircode').value, 'D01AB12');
  assert.match(main.fields.find((field) => field.name === 'Address').value, /1 Main Street/);
  assert.match(history.description, /12:00:00.*cad.*Bay:32 Seq:5/);
  assert.doesNotMatch(history.description, /B32\/#5/);
});
