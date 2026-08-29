import test from 'node:test';
import assert from 'node:assert/strict';

import { safeErrorMessage as extensionError } from '../../src/utils/errors.js';
import { safeErrorMessage as botError } from '../../bot/src/errors.js';

test('outbound errors redact URLs and sensitive query values', () => {
  const input = new Error(
    'HTTP 500: http://depot.interlink.local/x?session=secret&UID=user&key=maps',
  );
  for (const sanitize of [extensionError, botError]) {
    const output = sanitize(input);
    assert.doesNotMatch(output, /secret|maps|depot\.interlink/i);
  }
});
