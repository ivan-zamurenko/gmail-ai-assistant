import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../../bot/src/commands.js';

test('Discord command schema includes the three expected commands', () => {
  assert.deepEqual(commands.map((command) => command.toJSON().name), [
    'reschedule', 'find', 'todo',
  ]);

  const reschedule = commands[0].toJSON();
  const optionNames = (subcommand) => reschedule.options
    .find((option) => option.name === subcommand)
    .options.map((option) => option.name);

  assert.deepEqual(optionNames('all'), ['dry_run']);
  assert.deepEqual(optionNames('parcel'), ['con_id', 'new_date', 'dry_run']);
  assert.deepEqual(optionNames('barcodes'), ['dry_run']);
  assert.deepEqual(optionNames('retry'), ['dry_run']);
});
