// Loads JSON fixtures from test/fixtures and refuses anything that looks like
// real customer, session or credential data.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

const FORBIDDEN = [
  [/ya29\.|Bearer\s+\S/i, 'OAuth token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/data:image\/|\/9j\/4|iVBORw0KGgo/, 'embedded image'],
  [/<html|<body|<table/i, 'raw HTML'],
  [/dpd\.ie|interlink\.local|[?&](?:sid|session|token)=/i, 'depot host or session reference'],
  [/[\w.+-]+@(?!example\.(?:com|org|net)\b)[\w-]+\.[\w.]+/i, 'non-example email address'],
];

/** Throws when a fixture is not explicitly synthetic or contains forbidden data. */
export function assertSyntheticFixture(fixture, name = 'fixture') {
  if (fixture?.synthetic !== true) {
    throw new Error(`${name}: missing "synthetic": true marker`);
  }
  const text = JSON.stringify(fixture);
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(text)) throw new Error(`${name}: contains ${what}`);
  }
  return fixture;
}

export async function loadFixture(name) {
  const fixture = JSON.parse(await readFile(join(FIXTURES, name), 'utf8'));
  return assertSyntheticFixture(fixture, name);
}
