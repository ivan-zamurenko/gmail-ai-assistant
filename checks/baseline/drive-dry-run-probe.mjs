/** Offline regression probe. Network and image decoding are explicit fake boundaries. */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
const i = process.argv.indexOf('--root');
const root = resolve(i < 0 ? process.cwd() : process.argv[i + 1]);
if (!vm.SourceTextModule) throw new Error('Run with --experimental-vm-modules');
const calls = [];
let folder = 0;
const context = vm.createContext({
  console, URL, encodeURIComponent,
  FileReader: class {
    readAsDataURL() { this.result = 'data:image/png;base64,AA=='; queueMicrotask(() => this.onload()); }
  },
  fetch: async (url, options = {}) => {
    const u = new URL(url); const method = options.method || 'GET';
    if (u.origin !== 'https://www.googleapis.com') throw new Error('Unexpected origin');
    calls.push({ method, path: u.pathname });
    if (method === 'POST' && u.pathname === '/drive/v3/files') {
      return { ok: true, json: async () => ({ id: `synthetic-folder-${++folder}` }) };
    }
    if (method !== 'GET') throw new Error(`Unexpected method: ${method}`);
    if (u.searchParams.get('alt') === 'media') return { ok: true, blob: async () => ({}) };
    const q = u.searchParams.get('q') || '';
    if (q.includes("mimeType contains 'image/'")) {
      return { ok: true, json: async () => ({ files: [{ id: 'synthetic-photo', name: 'fixture.png', createdTime: '2026-10-09T12:00:00Z' }] }) };
    }
    if (u.pathname === '/drive/v3/files') return { ok: true, json: async () => ({ files: [] }) };
    throw new Error('Unexpected fixture request');
  },
});
const cache = new Map();
async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const text = path.endsWith('/barcode.js')
    ? 'export async function loadImage() { return {}; } export function readBarcodes() { return []; }'
    : await readFile(path, 'utf8');
  const mod = new vm.SourceTextModule(text, { context, identifier: path });
  cache.set(path, mod);
  await mod.link((specifier) => {
    if (!specifier.startsWith('./')) throw new Error('Unexpected import');
    return load(resolve(dirname(path), specifier));
  });
  return mod;
}
const mod = await load(resolve(root, 'src/depot/driveScanner.js'));
await mod.evaluate();
const results = await mod.namespace.processLabels({
  folderInput: 'synthetic-root', token: 'fixture-not-a-token',
  verify: async () => false, dryRun: true, testMode: true,
});
if (results.length !== 1 || results[0].error) throw new Error('Probe did not reach normal completion');
const mutations = calls.filter(x => x.method !== 'GET');
console.log(JSON.stringify({ check: 'dry_run_has_zero_drive_mutations',
  expected_mutations: 0, observed_mutations: mutations.length,
  mutation_methods: mutations.map(x => x.method),
  result: mutations.length ? 'FAIL' : 'PASS',
  boundary: 'offline fetch and image-decoder fixtures; real scanner and naming modules',
}, null, 2));
process.exitCode = mutations.length ? 1 : 0;
