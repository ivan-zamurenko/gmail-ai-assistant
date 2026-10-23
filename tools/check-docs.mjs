/** Validate managed Markdown only; never rewrite user documents. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {safePath} from './roadmap.mjs';

export function validateDocs(root) {
  const errors = [];
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(safePath(root,'DOCS_MANIFEST.json'),'utf8')); }
  catch (error) { return {files:0,errors:['Cannot read DOCS_MANIFEST.json: '+error.message]}; }
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files) || manifest.files.length === 0) return {files:0,errors:['Nonempty managed Markdown manifest required']};
  if (new Set(manifest.files).size !== manifest.files.length) errors.push('Duplicate document in manifest');
  for (const relative of manifest.files) {
    let text;
    try {
      if (typeof relative !== 'string' || !relative.endsWith('.md')) throw new Error('Expected Markdown path');
      text = new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(safePath(root,relative)));
    } catch (error) { errors.push(relative+': '+error.message); continue; }
    if (!text.trim()) { errors.push(relative+': empty document'); continue; }
    if (text.includes('\0') || text.includes('\ufffd')) errors.push(relative+': invalid replacement/NUL character');
    if (!/^(#|---\s*$)/m.test(text)) errors.push(relative+': missing heading/frontmatter');
    let fence = null, prose = [];
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(`{3,}|~{3,})/);
      if (match) {
        if (!fence) fence=match[1];
        else if (match[1][0]===fence[0] && match[1].length>=fence.length) fence=null;
        continue;
      }
      if (!fence) prose.push(line);
    }
    if (fence) errors.push(relative+': unclosed code fence');
    for (const match of prose.join('\n').matchAll(/\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/i.test(target)) continue;
      try {
        const clean = decodeURIComponent(target.split('#')[0]);
        if (!clean) continue;
        if (/^[a-z]+:/i.test(clean)) throw new Error('Unsupported link scheme');
        const joined = path.posix.join(path.posix.dirname(relative),clean);
        if (!fs.existsSync(safePath(root,joined))) throw new Error('Missing local target');
      } catch (error) { errors.push(relative+': '+target+' ('+error.message+')'); }
    }
  }
  return {files:manifest.files.length,errors};
}
export function run(argv=process.argv.slice(2)) {
  let root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  if (argv.length) {
    if (argv.length!==2 || argv[0]!=='--root') throw new Error('Usage: node tools/check-docs.mjs [--root PATH]');
    root=path.resolve(argv[1]);
  }
  const result=validateDocs(root);
  console.log(JSON.stringify({result:result.errors.length?'FAIL':'PASS',...result},null,2));
  return result.errors.length?1:0;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.exitCode=run();} catch(error) {console.error(error.message);process.exitCode=1;}
}
