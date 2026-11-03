import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentUrl, readReport, imagePng } from '../../src/discord/reportCopy.js';
import { createReportControls } from '../../src/discord/copyButtons.js';
const url = 'https://cdn.discordapp.com/ephemeral-attachments/123/456/driver-report.jpg?ex=synthetic';
const caption = 'Parcel recovery & redelivery\nConsignment: 123456789 · Parcel 1\nDeliver to\nExample Street\nhttps://www.google.com/maps/dir/?api=1&destination=D02AF30';
function rowFixture() {
  const content = { innerText: caption, querySelectorAll: () => [] };
  const link = { href: url };
  const node = () => ({ style: {}, children: [], callbacks: {}, append(...x) { for (const child of x) child.parentNode = this; this.children.push(...x); }, setAttribute() {}, addEventListener(k, v) { this.callbacks[k] = v; }, remove() { this.removed = true; this.parentNode = null; } });
  const row = node(); row.isConnected = true;
  row.ownerDocument = { createElement: node };
  row.querySelectorAll = selector => selector.startsWith('[id') ? [content] : [link];
  return { row, content, link };
}

test('report copy binds one row and bounds trusted image reads before decoding', async () => {
  assert.equal(attachmentUrl(url), url);
  for (const bad of ['https://evil.invalid/driver-report.jpg',url.replace('https:', 'http:'),url.replace('cdn.discordapp.com','cdn.discordapp.com.evil.invalid'),url+'#fragment',url.replace('/driver-report.jpg','/other.jpg')]) assert.equal(attachmentUrl(bad), null);
  const f=rowFixture();assert.equal(readReport(f.row).caption,caption);
  f.content.innerText='Driver report attached as text';assert.equal(readReport(f.row),null);
  f.content.innerText=caption;f.row.querySelectorAll=selector=>selector.startsWith('[id')?[f.content,f.content]:[f.link];assert.equal(readReport(f.row),null);
  const jpeg=new Uint8Array([255,216,255,192,0,11,8,0,10,0,20,1,1,17,0,255,217]);
  let request,decoded=0;
  const png=await imagePng(url,{fetchImage:async(u,o)=>{request={u,o};return new globalThis.Response(jpeg,{headers:{'content-type':'image/jpeg'}});}, decode:async()=>{decoded++;return {width:20,height:10,close(){}};}, canvas:()=>({getContext:()=>({drawImage(){}}),toBlob:fn=>fn(new globalThis.Blob(['png'],{type:'image/png'}))})});
  assert.equal(png.type,'image/png');assert.equal(request.o.credentials,'omit');assert.equal(request.o.redirect,'error');
  jpeg[7]=255;
  await assert.rejects(imagePng(url,{fetchImage:async()=>new globalThis.Response(jpeg,{headers:{'content-type':'image/jpeg'}}),decode:async()=>{decoded++;}}));
  assert.equal(decoded,1,'oversized JPEG rejected before bitmap allocation');
});

test('controls are unique, copy fresh paired data and reject recycled or removed messages', async () => {
 const f=rowFixture(),calls=[];
 const mount=createReportControls({copyText:async t=>calls.push(['text',t]),copyImage:async u=>calls.push(['image',u])});
 mount(f.row);mount(f.row);assert.equal(f.row.children.length,1);
 let controls=f.row.children[0].children;
 await controls[0].callbacks.click();await controls[1].callbacks.click();
 assert.deepEqual(calls,[['image',url],['text',caption]]);
 assert.equal(controls[0].textContent,'Картинку скопійовано');
 assert.equal(controls[1].textContent,'Підпис скопійовано');
 f.row.children[0].remove();mount(f.row);assert.equal(f.row.children.length,2,'restore controls removed by Discord re-render');
 controls=f.row.children[1].children;
 f.content.innerText='Another message';await controls[1].callbacks.click();assert.equal(calls.length,2);
 mount(f.row);assert.equal(f.row.children[1].removed,true);
});
