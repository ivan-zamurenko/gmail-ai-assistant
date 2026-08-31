import test from 'node:test';
import assert from 'node:assert/strict';

import { depotMain } from '../../src/depot/depotScript.js';

test('label dry-run uses exact verified targets without reading Pending List', async () => {
  const original = {
    log: globalThis.console.log,
    table: globalThis.console.table,
    warn: globalThis.console.warn,
  };
  globalThis.console.log = () => {};
  globalThis.console.table = () => {};
  globalThis.console.warn = () => {};

  try {
    const result = await depotMain({
      dryRun: true,
      mode: 'labels',
      targets: [
        { consNumber: '123456789', consId: '7654321', type: 'PopUp' },
        // Duplicate target must not schedule the same internal consignment twice.
        { consNumber: '123456789', consId: '7654321', type: 'PopUp' },
      ],
    });

    assert.deepEqual(result, {
      dryRun: true,
      count: 1,
      packages: [{ consNumber: '123456789', consId: '7654321' }],
    });
  } finally {
    globalThis.console.log = original.log;
    globalThis.console.table = original.table;
    globalThis.console.warn = original.warn;
  }
});
