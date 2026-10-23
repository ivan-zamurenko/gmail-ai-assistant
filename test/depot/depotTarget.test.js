import test from 'node:test';
import assert from 'node:assert/strict';

import { assertDepotTab, isDepotUrl } from '../../src/depot/depotTarget.js';
import { depotMain } from '../../src/depot/depotScript.js';
import { depotLookup } from '../../src/depot/lookup.js';

const URLS = [
  ['http://synthetic.interlink.local/scripts/x.p?session=s', true],
  ['http://a.b.interlink.local/', true],
  ['HTTP://Synthetic.INTERLINK.local/', true],
  ['https://synthetic.interlink.local/', false],
  ['http://interlink.local/', false],
  ['http://synthetic.interlink.local.evil.invalid/', false],
  ['http://evil.invalid/?next=.interlink.local', false],
  ['http://evil.invalid/synthetic.interlink.local/', false],
  ['http://user:pw@synthetic.interlink.local/', false],
  ['chrome://newtab/', false],
  ['not a url', false],
  ['', false],
  [undefined, false],
];

test('depot URL rule accepts only http *.interlink.local without credentials', () => {
  for (const [url, expected] of URLS) assert.equal(isDepotUrl(url), expected, String(url));
});

test('active tab check rejects missing, foreign and malformed tabs before injection', () => {
  assert.throws(() => assertDepotTab(undefined), /No active tab found/);
  assert.throws(() => assertDepotTab({ id: 1, url: 'not a url' }), /Open the depot page/);
  assert.throws(() => assertDepotTab({ id: 1 }), /Open the depot page/);
  assert.throws(() => assertDepotTab({ id: 1, url: 'https://www.googleapis.com/' }), /not a depot page/);
  const tab = { id: 1, url: 'http://synthetic.interlink.local/home' };
  assert.equal(assertDepotTab(tab), tab);
});

// Runs an injected function as Chrome would: re-created from its source text, so
// any reference to module scope throws instead of silently working in Node.
function serialized(fn) {
  return new Function(`return (${fn.toString()})`)();
}

async function onPage(href, run, { formAction } = {}) {
  const keys = ['window', 'document', 'DOMParser', 'fetch'];
  const saved = keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  const requests = [];
  globalThis.window = { location: { href, search: new globalThis.URL(href).search } };
  globalThis.document = {
    getElementById: (id) => (id === 'ConQSearchForm' && formAction ? { action: formAction } : null),
    querySelector: () => null,
  };
  globalThis.DOMParser = class { parseFromString() { return { querySelectorAll: () => [], querySelector: () => null }; } };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? 'GET' });
    return { ok: true, status: 200, text: async () => '' };
  };
  const quiet = ['log', 'warn', 'error', 'table'].map((k) => [k, globalThis.console[k]]);
  for (const [k] of quiet) globalThis.console[k] = () => {};
  try {
    return { result: await run(), requests };
  } finally {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    for (const [k, v] of quiet) globalThis.console[k] = v;
  }
}

test('serialized depot scripts refuse a page that is not the depot', async () => {
  const main = serialized(depotMain);
  const lookup = serialized(depotLookup);
  for (const [href, isDepot] of URLS.filter(([u]) => /^https?:/i.test(u ?? ''))) {
    const ran = await onPage(href, () => main({ dryRun: true, mode: 'cad' }));
    const looked = await onPage(href, () => lookup(['123456789']));
    if (isDepot) {
      assert.doesNotMatch(String(ran.result?.__error), /unexpected origin/, href);
      continue;
    }
    assert.match(ran.result.__error, /Not the correct depot page \(unexpected origin\)/, href);
    assert.match(looked.result[0].reason, /Not a depot page \(unexpected origin\)/, href);
    assert.deepEqual([...ran.requests, ...looked.requests], [], href);
  }
});

test('quick search refuses a cross-origin form action before sending the number', async () => {
  const lookup = serialized(depotLookup);
  const page = 'http://synthetic.interlink.local/home?session=synthetic&UID=synthetic';

  const hostile = await onPage(page, () => lookup(['123456789']), { formAction: 'http://evil.invalid/search' });
  assert.deepEqual(hostile.requests, []);
  assert.match(hostile.result[0].reason, /cross-origin/);

  const local = await onPage(page, () => lookup(['123456789']), { formAction: 'http://synthetic.interlink.local/search' });
  assert.deepEqual(local.requests[0], { url: 'http://synthetic.interlink.local/search', method: 'POST' });
});
