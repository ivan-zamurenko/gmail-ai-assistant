/** Read-only task selector. Never executes commands stored in task cards. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')) throw new Error('Expected a relative POSIX path');
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Path escapes repository: ' + relative);
  if (fs.existsSync(target)) {
    const real = fs.realpathSync(target);
    const realBase = fs.realpathSync(base);
    if (real !== realBase && !real.startsWith(realBase + path.sep)) throw new Error('Symlink escapes repository: ' + relative);
  }
  return target;
}
function readJson(root, relative) { return JSON.parse(fs.readFileSync(safePath(root, relative), 'utf8')); }
export function loadProject(root) {
  return { root: path.resolve(root), metadata: readJson(root, 'roadmap/tasks.json'), state: readJson(root, '.workflow/state.json') };
}
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function validateProject(project) {
  const {root, metadata, state} = project;
  const errors = [];
  if (metadata?.schema_version !== 1 || state?.schema_version !== 1) errors.push('Unsupported schema_version');
  if (!Array.isArray(metadata?.tasks) || metadata.tasks.length === 0) return [...errors, 'Task list must not be empty'];
  if (!record(state?.tasks) || !record(state?.gates) || !record(metadata?.stages)) return [...errors, 'Invalid task, gate or stage map'];
  const tasks = metadata.tasks;
  const map = new Map();
  for (const task of tasks) {
    if (!record(task) || !/^S\d{2}-\d{2}(?:-[a-z0-9]+)?$/.test(task.id ?? '')) { errors.push('Invalid task ID'); continue; }
    if (map.has(task.id)) errors.push('Duplicate task: ' + task.id);
    map.set(task.id, task);
    if (typeof task.title !== 'string' || !task.title.trim()) errors.push('Missing title: ' + task.id);
    if (!Object.hasOwn(metadata.stages, task.stage)) errors.push('Unknown stage: ' + task.id);
    if (!Array.isArray(task.depends_on) || !Array.isArray(task.gates) || !Array.isArray(task.context)) errors.push('Invalid arrays: ' + task.id);
    if (!Number.isInteger(task.acceptance_count) || task.acceptance_count < 1) errors.push('Missing acceptance count: ' + task.id);
    try {
      const p = safePath(root, task.path);
      if (!p.endsWith('.md') || !fs.statSync(p).isFile()) throw new Error('Not a Markdown file');
    } catch (error) { errors.push('Invalid card ' + task.id + ': ' + error.message); }
    for (const item of Array.isArray(task.context) ? task.context : []) {
      try { safePath(root,item); } catch { errors.push('Unsafe context path: ' + task.id); }
    }
  }
  for (const task of map.values()) {
    for (const dep of Array.isArray(task.depends_on) ? task.depends_on : []) if (!map.has(dep)) errors.push('Unknown dependency ' + dep + ' in ' + task.id);
    for (const gate of Array.isArray(task.gates) ? task.gates : []) if (!Object.hasOwn(state.gates, gate)) errors.push('Unknown gate ' + gate + ' in ' + task.id);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push('Dependency cycle at ' + id); return; }
    if (visited.has(id) || !map.has(id)) return;
    visiting.add(id);
    for (const dep of Array.isArray(map.get(id).depends_on) ? map.get(id).depends_on : []) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const id of map.keys()) visit(id);
  for (const [name, gate] of Object.entries(state.gates)) {
    if (!record(gate) || !['pending','approved','rejected'].includes(gate.status)) { errors.push('Invalid gate status: ' + name); continue; }
    if (gate.status === 'approved' && (typeof gate.evidence !== 'string' || !gate.evidence.trim())) errors.push('Approved gate needs a decision/evidence reference: ' + name);
    if (gate.status === 'rejected' && (typeof gate.note !== 'string' || !gate.note.trim())) errors.push('Rejected gate needs a reason: ' + name);
  }
  const statuses = new Set(['todo','in_progress','blocked','env_blocked','done']);
  const active = [];
  for (const id of map.keys()) {
    const entry = state.tasks[id];
    if (!record(entry) || !statuses.has(entry.status)) { errors.push('Invalid/missing task state: ' + id); continue; }
    if (entry.status === 'in_progress') active.push(id);
    if (['blocked','env_blocked'].includes(entry.status) && (typeof entry.block_reason !== 'string' || !entry.block_reason.trim())) errors.push('Blocked task needs a reason: ' + id);
    if (entry.status === 'done') {
      const task = map.get(id);
      for (const dep of Array.isArray(task.depends_on) ? task.depends_on : []) if (state.tasks[dep]?.status !== 'done') errors.push('Done task has unfinished dependency: ' + id + ' -> ' + dep);
      for (const gate of Array.isArray(task.gates) ? task.gates : []) if (state.gates[gate]?.status !== 'approved') errors.push('Done task has unapproved gate: ' + id + ' -> ' + gate);
      try {
        if (typeof entry.evidence !== 'string' || !entry.evidence.startsWith('.workflow/evidence/')) throw new Error('Expected .workflow/evidence path');
        const evidence = readJson(root, entry.evidence);
        if (evidence.task_id !== id || evidence.outcome !== 'passed' || !Array.isArray(evidence.checks) || evidence.checks.length === 0) throw new Error('Evidence must match task and contain passed checks');
        const green = evidence.checks.some(check => (check.phase === 'green' && check.exit_code === 0) || (check.kind === 'manual' && check.result === 'passed'));
        if (!green) throw new Error('No successful GREEN/manual check');
      } catch (error) { errors.push('Invalid evidence for ' + id + ': ' + error.message); }
    }
  }
  for (const id of Object.keys(state.tasks)) if (!map.has(id)) errors.push('State references unknown task: ' + id);
  if (active.length > 1) errors.push('Only one in_progress writer is allowed');
  const expectedActive = active.length === 1 ? active[0] : null;
  if (state.active_task !== expectedActive) errors.push('active_task must match the single in_progress task, or null');
  return errors;
}
export function blockers(project, task) {
  return [
    ...task.depends_on.filter(id => project.state.tasks[id]?.status !== 'done').map(id => 'dependency:' + id),
    ...task.gates.filter(id => project.state.gates[id]?.status !== 'approved').map(id => 'gate:' + id),
  ];
}
export function nextTask(project) {
  const active = project.metadata.tasks.find(t => project.state.tasks[t.id]?.status === 'in_progress');
  if (active) return { task: active, reason: 'in_progress', blockers: blockers(project, active) };
  const ready = project.metadata.tasks.find(t => project.state.tasks[t.id]?.status === 'todo' && blockers(project, t).length === 0);
  return ready ? {task: ready, reason: 'ready', blockers: []} : {task: null, reason: 'no_ready_task', blockers: []};
}
export function run(argv = process.argv.slice(2)) {
  const args = [...argv];
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const r = args.indexOf('--root');
  if (r !== -1) { if (!args[r+1]) throw new Error('--root requires a path'); root = path.resolve(args[r+1]); args.splice(r,2); }
  const [command = 'next', id] = args;
  if (!['validate','next','show','context'].includes(command) || args.length > (['show','context'].includes(command) ? 2 : 1)) throw new Error('Usage: node tools/roadmap.mjs validate|next|show ID|context ID [--root PATH]');
  const project = loadProject(root);
  const errors = validateProject(project);
  if (errors.length) { console.error(errors.join('\n')); return 1; }
  if (command === 'validate') {
    console.log(JSON.stringify({result:'PASS',tasks:project.metadata.tasks.length,stages:Object.keys(project.metadata.stages).length,gates:Object.keys(project.state.gates).length},null,2)); return 0;
  }
  if (command === 'next') {
    const result = nextTask(project);
    console.log(JSON.stringify(result.task ? {id:result.task.id,title:result.task.title,path:result.task.path,reason:result.reason,blockers:result.blockers} : {reason:result.reason,remaining:project.metadata.tasks.filter(t => project.state.tasks[t.id].status !== 'done').map(t=>({id:t.id,status:project.state.tasks[t.id].status,block_reason:project.state.tasks[t.id].block_reason,blockers:blockers(project,t)}))},null,2)); return 0;
  }
  const task = project.metadata.tasks.find(t=>t.id === id);
  if (!task) throw new Error('Unknown or missing task ID: ' + String(id));
  if (command === 'show') console.log(fs.readFileSync(safePath(root,task.path),'utf8'));
  else console.log(JSON.stringify({id:task.id,card:task.path,context:task.context.map(item=>({path:item,present:fs.existsSync(safePath(root,item))})),note:'Missing source/future paths may be expected in the documentation-only kit. Do not fabricate their contents.'},null,2));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
