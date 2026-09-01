import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../../bot/src/commands.js';

test('Discord command schema includes the three expected commands', () => {
  assert.deepEqual(commands.map((command) => command.toJSON().name), [
    'reschedule', 'find', 'todo',
  ]);

  const reschedule = commands[0].toJSON();
  const parcel = reschedule.options.find((option) => option.name === 'parcel');
  assert.deepEqual(parcel.options.map((option) => option.name), [
    'con_id', 'new_date', 'dry_run', 'confirm_live',
  ]);
});
