import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const required=['docs/discord-bot.md','docs/queue-contract.md','docs/discord/RUNBOOK_RU.md','docs/discord/TEST_MATRIX.md','docs/audit/GITHUB_BASELINE.md','docs/audit/UPDATE_V1_2.md'];
test('Discord documentation is included in the managed manifest',()=>{
 const files=json('DOCS_MANIFEST.json').files;
 for(const f of required){assert.ok(files.includes(f),f); assert.ok(read(f).length>1500,f);}
});
test('the roadmap has a dedicated existing-bot workstream',()=>{
 const m=json('roadmap/tasks.json');assert.ok(m.stages.S09);
 for(let i=1;i<=12;i++)assert.ok(m.tasks.some(t=>t.id===`S09-${String(i).padStart(2,'0')}`));
});
test('queue task context includes both contract mirrors and Firestore rules',()=>{
 const task=json('roadmap/tasks.json').tasks.find(t=>t.id==='S09-01');assert.ok(task);
 for(const p of ['bot/src/contract.js','src/queue/contract.js','firestore.rules'])assert.ok(task.context.includes(p),p);
});
test('current capabilities distinguish implemented commands from live verification',()=>{
 const c=json('docs/discord/capabilities.json').commands;
 assert.equal(c.find.status,'implemented_unverified_live');
 assert.equal(c['reschedule.all'].status,'implemented_unverified_live');
 for(const k of ['reschedule.parcel','reschedule.barcodes','reschedule.retry'])assert.equal(c[k].status,'implemented_unverified_live');
 assert.equal(c.todo.status,'implemented_unverified_live');
});
test('bot guide retains OWNER-D01 and no-email-send boundary',()=>{
 const t=read('docs/discord-bot.md');assert.match(t,/OWNER-D01/);assert.match(t,/dry_run:false/);assert.match(t,/auto-send/);assert.match(t,/S06-05/);
});
test('toolchain explicitly covers two dependency installations and the existing test',()=>{
 const t=read('docs/toolchain.md');for(const s of ['npm ci','npm --prefix bot ci','docs/TESTING.md','bot/package-lock.json'])assert.ok(t.includes(s),s);
});
test('release integrates bot evidence without forcing unfinished optional modes',()=>{
 const m=json('roadmap/tasks.json');const get=id=>m.tasks.find(t=>t.id===id);
 assert.ok(get('S08-03').depends_on.includes('S09-12'));
 const seen=new Set();function walk(id){if(seen.has(id))return;seen.add(id);for(const d of get(id).depends_on)walk(d);}walk('S09-12');
 assert.ok(!seen.has('S09-10'));assert.ok(!seen.has('S09-11'));
});
test('each added bot card contains baseline, boundaries, acceptance, and evidence',()=>{
 for(let i=1;i<=12;i++){
  const id=`S09-${String(i).padStart(2,'0')}`;const t=read(`roadmap/tasks/${id}.md`);
  for(const heading of ['## Baseline','## Scope','## Acceptance','## Evidence'])assert.ok(t.includes(heading),id+' '+heading);
  assert.ok(t.includes(`.workflow/evidence/${id}.json`));
 }
});
test('new source provenance is distinct from the historical baseline',()=>{
 const t=read('docs/audit/GITHUB_BASELINE.md');assert.ok(t.includes('gmail-ai-assistant-main.zip'));
 assert.match(t,/b92e58bc30740f105fc94ef20fc266eb7a6c1eaa2d9201f279bd0dca8e1e3077/);
 assert.ok(read('docs/audit/BASELINE.md').includes('GITHUB_BASELINE.md'));
});
test('source-based docs do not silently use the old worker or storage architecture',()=>{
 const a=read('docs/architecture.md');for(const s of ['bot/','src/offscreen/','src/queue/','firestore.rules','OWNER-D01'])assert.ok(a.includes(s),s);
 assert.ok(read('AGENTS.md').includes('bot/package-lock.json'));
 assert.ok(json('.workflow/state.json').gates.G_DISCORD_ACCESS);
});

test('historical Discord probe is excluded from default test discovery',()=>{
 assert.ok(fs.existsSync(path.join(root,'checks/github/offline-discord.probe.mjs')));
 assert.ok(!fs.existsSync(path.join(root,'checks/github/offline-discord.test.mjs')));
});
