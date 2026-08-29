import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../../bot/src/commands.js';

test('Discord command schema includes the three expected commands', () => {
  assert.deepEqual(commands.map((command) => command.toJSON().name), [
    'reschedule', 'find', 'todo',
  ]);
});
