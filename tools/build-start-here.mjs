/** Build a self-contained, searchable reader for managed Markdown. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {safePath} from './roadmap.mjs';
export const escapeHtml = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function buildReader(root) {
  const manifest=JSON.parse(fs.readFileSync(safePath(root,'DOCS_MANIFEST.json'),'utf8'));
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Empty document manifest');
  const preferred=['00_READ_FIRST.md','README.md','INSTALL_RU.md','AGENTS.md','COPILOT_SETUP_RU.md','CODEX_SETUP_RU.md','docs/copilot/WORKFLOW_RU.md','docs/discord-bot.md','docs/queue-contract.md','docs/discord/RUNBOOK_RU.md','docs/audit/LOCAL_BASELINE.md','docs/audit/GITHUB_BASELINE.md','docs/INDEX.md','roadmap/ROADMAP.md'];
  const files=[...manifest.files].sort((a,b)=>{
    const ai=preferred.indexOf(a),bi=preferred.indexOf(b);
    if(ai>=0 || bi>=0) return (ai<0?999:ai)-(bi<0?999:bi);
    return a.localeCompare(b);
  });
  const docs=files.map((relative,index)=>{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(safePath(root,relative)));
    const title=text.match(/^#\s+(.+)$/m)?.[1]??relative;
    return {relative,text,title,id:'doc-'+index};
  });
  const nav=docs.map(doc=>`<a class="nav" href="#${doc.id}" data-target="${doc.id}">${escapeHtml(doc.title)}<small>${escapeHtml(doc.relative)}</small></a>`).join('\n');
  const content=docs.map((doc,index)=>`<article id="${doc.id}" tabindex="-1"${index?' hidden':''}><p class="path"><a href="${escapeHtml(doc.relative)}">${escapeHtml(doc.relative)}</a></p><h1>${escapeHtml(doc.title)}</h1><pre class="markdown">${escapeHtml(doc.text)}</pre></article>`).join('\n');
  const html=`<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DPD Assistance - Markdown execution kit</title><style>
:root{color-scheme:light dark;--bg:#f5f6f7;--panel:#fff;--text:#20282f;--muted:#53616c;--line:#d7dde2;--accent:#aa1735}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,sans-serif}header{padding:16px 24px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:center;flex-wrap:wrap}header strong{font-size:20px}header span{color:var(--muted)}button,input{font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 12px}button{cursor:pointer}#toggle{margin-left:auto}#layout{display:grid;grid-template-columns:320px minmax(0,1fr)}aside{height:calc(100vh - 85px);position:sticky;top:0;overflow:auto;padding:16px;border-right:1px solid var(--line);background:var(--panel)}#search{width:100%;margin-bottom:10px}.nav{display:block;padding:10px;color:var(--text);text-decoration:none;border-bottom:1px solid var(--line);line-height:1.4}.nav small{display:block;font-size:11px;color:var(--muted);overflow-wrap:anywhere}.nav.active{border-left:4px solid var(--accent);background:var(--bg)}main{min-width:0;padding:28px clamp(18px,4vw,64px)}article{max-width:1100px;margin:auto}h1{font-size:32px;line-height:1.2}.path{font-size:13px;overflow-wrap:anywhere}a{color:var(--accent)}.markdown{font:15px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--panel);padding:24px;border:1px solid var(--line);border-radius:8px}.hint{font-size:13px;color:var(--muted)}[hidden]{display:none!important}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}body.dark{--bg:#15191d;--panel:#20262c;--text:#e6ebef;--muted:#aebac3;--line:#46515b;--accent:#ff9eb2}@media(max-width:850px){#layout{grid-template-columns:1fr}aside{position:static;height:auto;max-height:40vh;border-bottom:1px solid var(--line)}main{padding:20px 12px}.markdown{padding:14px}h1{font-size:25px}}
</style></head><body><header><strong>DPD Assistance</strong><span>Комплект v1.2 / 53 задачі / ${docs.length} Markdown-файлів</span><button id="toggle" type="button">Світла / темна</button></header><div id="layout"><aside aria-label="Документи"><label for="search">Пошук</label><input id="search" type="search" placeholder="S01-01, dryRun, Gmail..."><p id="count" class="hint" aria-live="polite"></p><nav>${nav}</nav></aside><main><p class="hint">Документи доступні офлайн. Тут показано повний Markdown; джерелом залишаються файли .md. Поточні статуси задач дивіться в .workflow/CURRENT.md та .workflow/state.json.</p>${content}</main></div><script>
'use strict';
const links=[...document.querySelectorAll('.nav')],articles=[...document.querySelectorAll('article')];
function select(){let id=location.hash.slice(1);if(!articles.some(x=>x.id===id))id=articles[0].id;for(const a of articles)a.hidden=a.id!==id;for(const a of links){const active=a.dataset.target===id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}}
function search(){const q=document.getElementById('search').value.trim().toLocaleLowerCase();let count=0;for(const a of links){const article=document.getElementById(a.dataset.target);a.hidden=!!q&&!article.textContent.toLocaleLowerCase().includes(q);if(!a.hidden)count++;}document.getElementById('count').textContent=count+' / '+links.length;}
window.addEventListener('hashchange',select);document.getElementById('search').addEventListener('input',search);document.getElementById('toggle').addEventListener('click',()=>document.body.classList.toggle('dark'));select();search();
</script></body></html>`;
  fs.writeFileSync(safePath(root,'START_HERE.html'),html,'utf8');
  return {documents:docs.length,bytes:Buffer.byteLength(html)};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);let root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  if(args.length){if(args.length!==2||args[0]!=='--root')throw new Error('Usage: node tools/build-start-here.mjs [--root PATH]');root=path.resolve(args[1]);}
  console.log(JSON.stringify(buildReader(root),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
