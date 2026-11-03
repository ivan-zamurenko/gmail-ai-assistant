import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateDocs} from '../check-docs.mjs';
function fixture(t,text='# Start\n\n[Other](docs/other.md)\n') {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dpd-docs-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'README.md'),text);fs.writeFileSync(path.join(root,'docs/other.md'),'# Other\n');
 fs.writeFileSync(path.join(root,'DOCS_MANIFEST.json'),JSON.stringify({schema_version:1,files:['README.md','docs/other.md']}));return root;
}
test('valid UTF-8 docs and local links pass',t=>{const root=fixture(t);assert.deepEqual(validateDocs(root),{files:2,errors:[]});});
test('broken local link fails',t=>{const root=fixture(t,'# Start\n[Missing](missing.md)\n');assert.match(validateDocs(root).errors.join('\n'),/Missing local target/);});
test('unclosed code fence fails',t=>{const root=fixture(t,'# Start\n```sh\nnode example.mjs\n');assert.match(validateDocs(root).errors.join('\n'),/unclosed/);});
test('links inside code and external URLs are not filesystem paths',t=>{const root=fixture(t,'# Start\n```md\n[x](not-a-file.md)\n```\n[Source](https://example.com)\n[Here](#section)\n');assert.deepEqual(validateDocs(root).errors,[]);});
test('invalid UTF-8 and empty documents fail',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'README.md'),Buffer.from([0xff,0xfe]));assert.ok(validateDocs(root).errors.length);fs.writeFileSync(path.join(root,'README.md'),'');assert.match(validateDocs(root).errors.join('\n'),/empty document/);});
test('escaping local links are refused',t=>{const root=fixture(t,'# Start\n[x](../../private.md)\n');assert.match(validateDocs(root).errors.join('\n'),/escapes repository/);});
test('unmanaged legacy Markdown is not silently included',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'legacy.md'),'# Legacy\n[old](missing.md)\n');assert.deepEqual(validateDocs(root).errors,[]);});
test('missing or empty manifest fails rather than empty success',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'DOCS_MANIFEST.json'),JSON.stringify({schema_version:1,files:[]}));assert.ok(validateDocs(root).errors.length);fs.unlinkSync(path.join(root,'DOCS_MANIFEST.json'));assert.ok(validateDocs(root).errors.length);});
