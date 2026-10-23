import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateProject,nextTask,safePath} from '../roadmap.mjs';
const cli=fileURLToPath(new URL('../roadmap.mjs',import.meta.url));
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dpd-roadmap-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'roadmap/tasks'),{recursive:true}); fs.mkdirSync(path.join(root,'.workflow/evidence'),{recursive:true});
  const tasks=['S00-01','S00-02','S00-03'].map((id,i)=>({id,title:id,stage:'S00',path:`roadmap/tasks/${id}.md`,depends_on:i?[`S00-0${i}`]:[],gates:i===1?['G_TEST']:[],context:[],acceptance_count:1}));
  for(const task of tasks) fs.writeFileSync(path.join(root,task.path),'# '+task.id+'\n');
  const project={root,metadata:{schema_version:1,stages:{S00:{title:'Test'}},tasks},state:{schema_version:1,active_task:null,tasks:Object.fromEntries(tasks.map(t=>[t.id,{status:'todo',evidence:null,block_reason:null}])),gates:{G_TEST:{status:'pending',evidence:null,note:null}}}};
  return project;
}
function done(p,id) {
  const relative='.workflow/evidence/'+id+'.json';
  p.state.tasks[id]={status:'done',evidence:relative,block_reason:null};
  fs.writeFileSync(path.join(p.root,relative),JSON.stringify({task_id:id,outcome:'passed',checks:[{phase:'green',exit_code:0}]}));
}
function save(p){fs.writeFileSync(path.join(p.root,'roadmap/tasks.json'),JSON.stringify(p.metadata));fs.writeFileSync(path.join(p.root,'.workflow/state.json'),JSON.stringify(p.state));}
test('valid project selects first task',t=>{const p=fixture(t);assert.deepEqual(validateProject(p),[]);assert.equal(nextTask(p).task.id,'S00-01');});
test('pending gate blocks successor',t=>{const p=fixture(t);done(p,'S00-01');assert.deepEqual(validateProject(p),[]);assert.equal(nextTask(p).task,null);});
test('approved gate and completed dependency unlock successor',t=>{const p=fixture(t);done(p,'S00-01');p.state.gates.G_TEST={status:'approved',evidence:'docs/decisions.md: approved synthetic test'};assert.deepEqual(validateProject(p),[]);assert.equal(nextTask(p).task.id,'S00-02');});
test('in-progress task is returned before a ready task',t=>{const p=fixture(t);p.state.tasks['S00-03'].status='in_progress';p.state.active_task='S00-03';assert.equal(nextTask(p).task.id,'S00-03');assert.equal(nextTask(p).reason,'in_progress');assert.ok(nextTask(p).blockers.length);});
test('dependency cycle is rejected',t=>{const p=fixture(t);p.metadata.tasks[0].depends_on=['S00-03'];assert.match(validateProject(p).join('\n'),/cycle/);});
test('unknown dependency and gate are rejected',t=>{const p=fixture(t);p.metadata.tasks[0].depends_on=['S99-01'];p.metadata.tasks[0].gates=['G_UNKNOWN'];assert.match(validateProject(p).join('\n'),/Unknown dependency/);assert.match(validateProject(p).join('\n'),/Unknown gate/);});
test('duplicate IDs and empty graph are rejected',t=>{const p=fixture(t);p.metadata.tasks.push(p.metadata.tasks[0]);assert.match(validateProject(p).join('\n'),/Duplicate task/);p.metadata.tasks=[];assert.match(validateProject(p).join('\n'),/empty/);});
test('missing card is rejected',t=>{const p=fixture(t);fs.unlinkSync(path.join(p.root,p.metadata.tasks[0].path));assert.match(validateProject(p).join('\n'),/Invalid card/);});
test('path traversal and escaping symlink are rejected',t=>{const p=fixture(t);assert.throws(()=>safePath(p.root,'../outside'));fs.symlinkSync(os.tmpdir(),path.join(p.root,'escape'));assert.throws(()=>safePath(p.root,'escape'));});
test('done requires real matching evidence with a successful check',t=>{const p=fixture(t);p.state.tasks['S00-01'].status='done';assert.match(validateProject(p).join('\n'),/Invalid evidence/);done(p,'S00-01');assert.deepEqual(validateProject(p),[]);const e=path.join(p.root,p.state.tasks['S00-01'].evidence);fs.writeFileSync(e,JSON.stringify({task_id:'S00-01',outcome:'passed',checks:[{phase:'green',exit_code:1}]}));assert.match(validateProject(p).join('\n'),/No successful/);});
test('done requires finished dependencies and approved gates',t=>{const p=fixture(t);done(p,'S00-02');const e=validateProject(p).join('\n');assert.match(e,/unfinished dependency/);assert.match(e,/unapproved gate/);});
test('blocked task requires reason and is not silently selected',t=>{const p=fixture(t);p.state.tasks['S00-01'].status='blocked';assert.match(validateProject(p).join('\n'),/needs a reason/);p.state.tasks['S00-01'].block_reason='Owner decision required';assert.deepEqual(validateProject(p),[]);assert.equal(nextTask(p).task,null);});
test('active state consistency and one writer are enforced',t=>{const p=fixture(t);p.state.tasks['S00-01'].status='in_progress';assert.match(validateProject(p).join('\n'),/active_task/);p.state.active_task='S00-01';assert.deepEqual(validateProject(p),[]);p.state.tasks['S00-02'].status='in_progress';assert.match(validateProject(p).join('\n'),/Only one/);});
test('approved gates need evidence and state cannot contain unknown tasks',t=>{const p=fixture(t);p.state.gates.G_TEST.status='approved';p.state.tasks['S99-01']={status:'todo'};const e=validateProject(p).join('\n');assert.match(e,/decision\/evidence/);assert.match(e,/unknown task/);});
test('CLI next and show are read-only, never execute card commands',t=>{const p=fixture(t);save(p);const card=path.join(p.root,p.metadata.tasks[0].path);fs.writeFileSync(card,'# Task\n```sh\ntouch SHOULD_NOT_EXIST\n```\n');const before=fs.readFileSync(path.join(p.root,'.workflow/state.json'));for(const args of [['next'],['show','S00-01'],['context','S00-01']]){const result=spawnSync(process.execPath,[cli,...args,'--root',p.root],{cwd:p.root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}assert.deepEqual(fs.readFileSync(path.join(p.root,'.workflow/state.json')),before);assert.equal(fs.existsSync(path.join(p.root,'SHOULD_NOT_EXIST')),false);});
test('CLI invalid ID and malformed JSON return failure',t=>{const p=fixture(t);save(p);assert.notEqual(spawnSync(process.execPath,[cli,'show','S99-99','--root',p.root]).status,0);fs.writeFileSync(path.join(p.root,'.workflow/state.json'),'{');assert.notEqual(spawnSync(process.execPath,[cli,'next','--root',p.root]).status,0);});
