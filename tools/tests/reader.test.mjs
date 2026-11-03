import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildReader,escapeHtml} from '../build-start-here.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'dpd-reader-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('reader embeds text safely without remote dependencies',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'README.md'),'# Read\n<script>BAD()</script>\n');fs.writeFileSync(path.join(root,'DOCS_MANIFEST.json'),JSON.stringify({files:['README.md']}));const r=buildReader(root);assert.equal(r.documents,1);const html=fs.readFileSync(path.join(root,'START_HERE.html'),'utf8');assert.ok(html.includes('&lt;script&gt;BAD()&lt;/script&gt;'));assert.ok(!html.includes('<script>BAD()'));assert.ok(!/<script[^>]+src=/i.test(html));assert.ok(!/<link[^>]+href=["']https?:/i.test(html));});
test('reader rejects empty manifest and escaping source path',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'DOCS_MANIFEST.json'),JSON.stringify({files:[]}));assert.throws(()=>buildReader(root),/Empty/);fs.writeFileSync(path.join(root,'DOCS_MANIFEST.json'),JSON.stringify({files:['../outside.md']}));assert.throws(()=>buildReader(root),/escapes/);});
test('HTML escaping includes ampersands and attribute quotes',()=>{assert.equal(escapeHtml('<a x="&">'), '&lt;a x=&quot;&amp;&quot;&gt;');});
