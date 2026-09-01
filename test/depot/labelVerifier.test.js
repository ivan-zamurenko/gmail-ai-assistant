import test from 'node:test';
import assert from 'node:assert/strict';

import { createLabelVerifier, DEPOT_PROBE } from '../../src/depot/labelVerifier.js';

test('label verifier caches exact depot targets and deduplicates one consignment', async () => {
  const calls = [];
  const verifier = createLabelVerifier({
    lookup: async (number) => {
      calls.push(number);
      return number === DEPOT_PROBE
        ? { reason: '0 matches' }
        : { consNumber: '123456789', consId: '7654321' };
    },
  });

  assert.equal(await verifier.verify(DEPOT_PROBE), false);
  assert.equal(await verifier.verify('123456789'), true);
  assert.equal(await verifier.verify('123456789'), true);
  assert.deepEqual(calls, [DEPOT_PROBE, '123456789']);
  assert.deepEqual(verifier.targetsFor(['123456789', '123456789']), {
    targets: [{ consNumber: '123456789', consId: '7654321', type: 'PopUp' }],
    unresolved: 0,
  });
});

test('label verifier stops the batch when the depot did not give a real answer', async () => {
  const verifier = createLabelVerifier({
    lookup: async () => ({ reason: 'search form unavailable' }),
  });

  await assert.rejects(
    verifier.verify(DEPOT_PROBE),
    error => error.fatal === true && /Depot is not responding/.test(error.message),
  );
});
