#!/usr/bin/env node
// Explicit integration runner, never production Firebase/CLI/config/credentials.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { readFile, writeFile, mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '1.22.0';
const SHA256 = '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c';
const SIZE = 136707194;
const CACHE = join(tmpdir(), 'dpd-firestore-emulator');
const JAR = process.env.FIRESTORE_EMULATOR_JAR || join(CACHE, `cloud-firestore-emulator-v${VERSION}.jar`);
const DOWNLOAD = `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${VERSION}.jar`;

async function verifiedJar() {
  let bytes;
  try { bytes = await readFile(JAR); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!process.argv.includes('--download')) throw new Error('Emulator missing: run npm run test:rules -- --download once, or set FIRESTORE_EMULATOR_JAR to the pinned JAR');
    if (process.env.FIRESTORE_EMULATOR_JAR) throw new Error('Explicit emulator JAR missing; refusing to overwrite supplied path');
    await mkdir(CACHE, { recursive: true });
    const response = await fetch(DOWNLOAD, { redirect: 'error', signal: AbortSignal.timeout(180_000) });
    if (!response.ok || Number(response.headers.get('content-length')) !== SIZE) throw new Error('Unexpected emulator download response');
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== SIZE || createHash('sha256').update(bytes).digest('hex') !== SHA256) throw new Error('Emulator checksum mismatch');
    const temporary = `${JAR}.${process.pid}.part`;
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, JAR);
  }
  if (bytes.length !== SIZE || createHash('sha256').update(bytes).digest('hex') !== SHA256) throw new Error('Emulator checksum mismatch');
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
function start(command, args, options) {
  const child = spawn(command, args, options);
  child.finished = new Promise(resolve => {
    child.once('error', error => resolve({ code: 1, error }));
    child.once('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  let deadline;
  try { await Promise.race([child.finished, new Promise(resolve => { deadline = setTimeout(resolve, 5000); })]); }
  finally { clearTimeout(deadline); }
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await child.finished; }
}

let emulator;
let tests;
let directory;
let interrupted = false;
const interrupt = () => { interrupted = true; tests?.kill('SIGTERM'); emulator?.kill('SIGTERM'); };
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  if (process.argv.slice(2).some(arg => arg !== '--download')) throw new Error('Only --download is supported');
  await verifiedJar();
  const port = await freePort();
  const project = `demo-dpd-rules-${randomBytes(6).toString('hex')}`;
  directory = await mkdtemp(join(tmpdir(), 'dpd-rules-run-'));
  const rules = await readFile(join(ROOT, 'firestore.rules'));
  await writeFile(join(directory, 'firestore.rules'), rules);
  let log = '';
  emulator = start('java', ['-Duser.language=en', '-jar', JAR, '--host', '127.0.0.1', '--port', String(port), '--project_id', project, '--rules', join(directory, 'firestore.rules')], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  const record = chunk => { log = (log + chunk).slice(-65536); };
  emulator.stdout.on('data', record);
  emulator.stderr.on('data', record);
  const ready = (async () => {
    for (let i = 0; i < 120; i++) {
      if (log.includes('Dev App Server is now running.')) return;
      if (interrupted) throw new Error('Interrupted');
      if (emulator.exitCode !== null || emulator.signalCode !== null) throw new Error(`Emulator stopped. ${log.slice(-4000)}`);
      await delay(250);
    }
    throw new Error('Emulator startup timed out; check Java21 and local socket permissions');
  })();
  await Promise.race([ready, emulator.finished.then(() => { throw new Error(`Emulator failed before ready. ${log.slice(-4000)}`); })]);
  console.log(`Firestore Emulator ${VERSION}; loopback only; synthetic project; SHA256 verified.`);
  tests = start(process.execPath, ['--test', join(ROOT, 'test/emulator/firestore-rules.emulator.mjs')], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`, DPD_RULES_PROJECT: project },
  });
  const timeout = setTimeout(() => tests.kill('SIGTERM'), 120_000);
  try { process.exitCode = (await tests.finished).code; } finally { clearTimeout(timeout); }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stop(tests);
  await stop(emulator);
  if (directory) await rm(directory, { recursive: true, force: true });
  if (interrupted) process.exitCode = 130;
}
