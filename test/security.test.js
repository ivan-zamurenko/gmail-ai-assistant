import test from 'node:test';
import assert from 'node:assert/strict';

import { safeErrorMessage as extensionError } from '../src/utils/errors.js';
import { safeErrorMessage as botError } from '../bot/src/errors.js';
import { executeTask } from '../src/queue/executor.js';
import { commands } from '../bot/src/commands.js';
import { buildParcelEmbed } from '../bot/src/render.js';

test('outbound errors redact URLs and sensitive query values', () => {
  const input = new Error(
    'HTTP 500: http://depot.interlink.local/x?session=secret&UID=user&key=maps',
  );
  for (const sanitize of [extensionError, botError]) {
    const output = sanitize(input);
    assert.doesNotMatch(output, /secret|maps|depot\.interlink/i);
  }
});

test('invalid or unversioned tasks cannot reach a depot command', async () => {
  const tasks = [
    null,
    { schemaVersion: 0 },
    { schemaVersion: 1, command: 'other', args: { mode: 'all', dryRun: false } },
    { schemaVersion: 1, command: 'find', args: { conId: 'not-a-consignment' } },
  ];
  for (const task of tasks) {
    assert.equal((await executeTask(task)).status, 'error');
  }
});

test('Discord command schema includes the three expected commands', () => {
  assert.deepEqual(commands.map((command) => command.toJSON().name), [
    'reschedule', 'find', 'todo',
  ]);
});

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
