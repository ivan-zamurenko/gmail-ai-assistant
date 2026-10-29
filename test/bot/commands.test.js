import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../../bot/src/commands.js';

test('Discord command schema includes depot, todo and retained-result recovery commands', () => {
  assert.deepEqual(commands.map((command) => command.toJSON().name), [
    'reschedule', 'find', 'todo', 'result',
  ]);

  const recovery = commands[3].toJSON();
  assert.equal(recovery.default_member_permissions, '8');
  assert.equal(recovery.options[0].name, 'con_id');
  assert.equal(Boolean(recovery.options[0].required), false);
  const reschedule = commands[0].toJSON();
  const optionNames = (subcommand) => reschedule.options
    .find((option) => option.name === subcommand)
    .options.map((option) => option.name);

  assert.deepEqual(optionNames('all'), ['dry_run']);
  assert.deepEqual(optionNames('parcel'), ['con_id', 'new_date', 'dry_run']);
  assert.deepEqual(optionNames('barcodes'), ['dry_run']);
  assert.deepEqual(optionNames('retry'), ['dry_run']);
});
