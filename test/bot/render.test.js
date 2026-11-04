import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { buildParcelEmbed, findHistoryPages } from '../../bot/src/render.js';

test('the private parcel card renders full recipient details and CAD location', async () => {
  const parcel = {
    query:      '123456789',
    consNumber: '123456789',
    drop:       null,
    arrangedDate: '29/08/2026',
    address: {
      contact: 'Jane Doe', company: 'Example Ltd', mobile: '0871234567',
      email: 'jane@example.test', lines: ['1 Main Street'], town: 'Dublin',
      county: 'Dublin', postCode: 'D01AB12', depot: '22',
    },
    scans: [{
      parcel: '1', type: 'Received', date: '28/08/2026', time: '12:00:00',
      route: 'cad', bay: '32', sequence: '5', signature: 'J DOE',
    }],
  };
  const output = await buildParcelEmbed(parcel, '');
  assert.equal(output.embeds.length, 3);
  assert.equal(output.files.length, 0);
  const [, history, recipient] = output.embeds.map((embed) => embed.toJSON());
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.match(recipient.fields.find(field => field.name === '🏠 Delivery address').value, /Jane Doe.*Example Ltd/s);
  assert.match(recipient.fields.find(field => field.name === '📞 Contact').value, /0871234567/);
  assert.match(recipient.fields.find(field => field.name === '🏠 Delivery address').value, /D01AB12/);
  assert.match(recipient.fields.find(field => field.name === '🏠 Delivery address').value, /1 Main Street/);
  assert.match(plain, /28 Aug 12:00:00.*Received.*cad.*Bay:32 Seq:5/s);
  assert.doesNotMatch(plain, /B32\/#5/);
});
test('history rows keep each status on one line', async () => {
  const parcel = {
    query: '123456789',
    consNumber: '123456789',
    drop: null,
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: 'Example Ltd', mobile: '0871234567', email: 'jane@example.test', lines: ['1 Main Street'], town: 'Dublin', county: 'Dublin', postCode: 'D01AB12', depot: '22' },
    scans: [
      { parcel: '1', type: 'Nearest Route Assigned', date: '03/09/2026', time: '08:55:20', route: 'NearRoute' },
      { parcel: '1', type: 'CAD scan', date: '03/09/2026', time: '08:34:16', route: 'cad', bay: '11', sequence: '90', signature: 'J DOE' },
    ],
  };

  const { embeds } = await buildParcelEmbed(parcel, '');
  const history = embeds[1].toJSON();
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.equal(history.title, '🕒 SCAN HISTORY — PARCEL 1');
  assert.match(plain, /03 Sep 08:34:16.*CAD scan.*cad.*Bay:11 Seq:90/s);
});

test('NearRoute is hidden from the operator-facing history log', async () => {
  const parcel = {
    query: '123456789',
    consNumber: '123456789',
    drop: null,
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: 'Example Ltd', mobile: '0871234567', email: 'jane@example.test', lines: ['1 Main Street'], town: 'Dublin', county: 'Dublin', postCode: 'D01AB12', depot: '22' },
    scans: [
      { parcel: '1', type: 'Nearest Route Assigned', date: '03/09/2026', time: '08:55:20', route: 'NearRoute', bay: '11', sequence: '90', signature: 'J DOE' },
      { parcel: '1', type: 'CAD scan', date: '03/09/2026', time: '08:34:16', route: 'cad', bay: '11', sequence: '90', signature: 'J DOE' },
    ],
  };

  const { embeds } = await buildParcelEmbed(parcel, '');
  const history = embeds[1].toJSON();
  const plain = history.description.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '');
  assert.doesNotMatch(plain, /NearRoute/);
  assert.doesNotMatch(plain, /Nearest Route Assigned/);
  assert.match(plain, /03 Sep 08:34:16.*CAD scan.*cad.*Bay:11 Seq:90/s);
});

test('selected scan GPS works without Eircode and never borrows another parcel location', async () => {
 const parcel={consNumber:'123456789',address:{},scans:[
 {parcel:'1',type:'Carded',date:'03/11/2026',time:'10:00:00',coords:{lat:53,lng:-6}},
 {parcel:'2',type:'Delivered',date:'03/11/2026',time:'11:00:00',coords:{lat:54,lng:-7}}],drop:{type:'Delivered',lat:55,lng:-8}};
 const first=await buildParcelEmbed(parcel,'',{parcelNumber:'1'});
 assert.match(plainText(first),/53.000000, -6.000000/);
 assert.match(plainText(first),/Open scan location/);
 assert.doesNotMatch(plainText(first),/54.000000|55.000000|11:00:00/);
 const conflict=await buildParcelEmbed({...parcel,scans:[...parcel.scans,{...parcel.scans[0],coords:{lat:52,lng:-5}}]},'',{parcelNumber:'1'});
 assert.doesNotMatch(plainText(conflict),/maps\/|53.000000|52.000000/);
 const conflictingType=await buildParcelEmbed({...parcel,scans:[...parcel.scans,{...parcel.scans[0],type:'Delivered'}]},'',{parcelNumber:'1'});
 assert.doesNotMatch(plainText(conflictingType),/maps\/|53.000000/);


 const legacy=await buildParcelEmbed({...parcel,scans:parcel.scans.map(scan=>({...scan,coords:undefined}))},'',{parcelNumber:'1'});
 assert.doesNotMatch(plainText(legacy),/maps\/|55.000000/);
});

test('find never includes POD images or placeholders', async () => {
  const parcel = {
    query: '123456789', consNumber: '123456789', drop: null,
    arrangedDate: '29/08/2026',
    address: { contact: 'Jane Doe', company: '', mobile: '', email: '', lines: [], town: '', county: '', postCode: '', depot: '' },
    scans: [{ parcel: '1', type: 'Delivered', date: '03/09/2026', time: '08:55:20', route: 'V17' }],
    pod: { mime: 'image/jpeg', body: '/9j/4AAQ' },
  };

  const { embeds, files } = await buildParcelEmbed(parcel, '');
  assert.equal(files.length, 0);
  assert.doesNotMatch(JSON.stringify(embeds), /pod.jpg|pod-unavailable|POD photo/);
});

const plainText = output => output.embeds.map(embed => JSON.stringify(embed.toJSON())).join('\n').replaceAll('\\u001b', '').replace(/\[[0-9;]*m/g, '');

test('overview separates parcel summaries from individual paged histories', async () => {
 const scans=Array.from({length:14},(_,i)=>({parcel:i===13?'2':'1',type:i===13?'Delivered':'Goods Held',date:`${String(i+1).padStart(2,'0')}/10/2026`,time:'10:00:00'}));
 const parcel={consNumber:'123456789',address:{},scans};
 const overview=await buildParcelEmbed(parcel,'');
 assert.doesNotMatch(plainText(overview),/SCAN HISTORY|14 Oct|13 Oct/);
 assert.match(plainText(overview),/Parcel 1/);assert.match(plainText(overview),/Parcel 2/);
 const selected=await buildParcelEmbed(parcel,'',{parcelNumber:'1'});
 const history=selected.embeds[1].toJSON();
 assert.match(history.title,/PARCEL 1/);assert.match(history.description,/13 Oct/);
 assert.doesNotMatch(history.description,/Delivered|14 Oct|Parcel 2/);
 assert.match(history.description,/\n\u200b\n/);assert.match(history.footer.text,/Page 1 of 2/);
});

test('malformed and oversized card values remain honest, bounded and cannot inject Discord formatting', async () => {
  for (const parcel of [{}, { scans: [] }, { scans: 'invalid' }, { scans: [null] }, { scans: [{ parcel: '1', type: 'Delivered', date: '31/02/2026', time: '10:00:00' }] }, { scans: [{ parcel: '', type: 'Received', date: '01/11/2026', time: '' }] }]) {
    const result = await buildParcelEmbed(parcel, '');
    assert.match(plainText(result), /unknown|unconfirmed|no scan/i);
    assert.doesNotMatch(plainText(result), /31 Feb/);
  }
  const clippedAddress = await buildParcelEmbed({ address: { lines: ['1 Main Street'], truncated: true },
    drop: { type: 'Delivered', lat: 53, lng: -6 }, scans: [{ parcel: '1', type: 'Received', date: '01/11/2026', time: '12:00:00' }],
  }, '');
  assert.doesNotMatch(plainText(clippedAddress), /maps\/dir|destination=/);
  const unassigned = await buildParcelEmbed({ scans: [
    { parcel: '1', type: 'Delivered', date: '01/11/2026', time: '12:00:00' },
    { parcel: '', type: 'Redirected', date: '01/11/2026', time: '13:00:00' },
  ] }, '');
  assert.match(unassigned.embeds[0].toJSON().title, /Latest status unconfirmed/);
  assert.match(plainText(unassigned), /unassigned parcel identity/);
  const hostile = '``` @everyone <@123> \u001b[31m ** [click](https://evil.test)'.repeat(300);
  const output = await buildParcelEmbed({ consNumber: hostile, query: hostile,
    address: { contact: hostile, company: hostile, lines: Array(20).fill(hostile), mobile: hostile, email: hostile, depot: hostile, postCode: hostile },
    arrangedDate: hostile,
    scans: Array.from({ length: 40 }, (_, i) => ({ parcel: String(i + 1), type: hostile, signature: hostile, date: '01/11/2026', time: '12:00:00', route: hostile, bay: hostile, sequence: hostile, onwardBc: hostile })),
  }, '');
  assert.deepEqual(output.allowedMentions, { parse: [] });
  let total = 0;
  for (const embed of output.embeds.map(item => item.toJSON())) {
    assert.ok((embed.title?.length ?? 0) <= 256);
    assert.ok((embed.description?.length ?? 0) <= 4096);
    total += (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0);
    for (const field of embed.fields ?? []) { assert.ok(field.value.length <= 1024); total += field.name.length + field.value.length; }
  }
  assert.ok(total <= 6000);
  assert.doesNotMatch(JSON.stringify(output.embeds.map(item => item.toJSON())), /@everyone|<@123>|\\u001b\[31m|\[click\]\(/);
  for (const embed of output.embeds.map(item => item.toJSON())) {
    for (const value of [embed.description, ...(embed.fields ?? []).map(field => field.value)]) {
      if (value?.startsWith('```ansi')) assert.equal((value.match(/```/g) ?? []).length, 2);
    }
  }
  const emailCard = await buildParcelEmbed({ address: { email: 'a_b@example.test' }, scans: [] }, '');
  assert.match(plainText(emailCard), /a_b@example\.test/);
  const unicode = '𠮷'.repeat(100);
  const unicodeCard = await buildParcelEmbed({ address: { lines: Array(5).fill(unicode), town: unicode, county: unicode },
    scans: Array.from({ length: 6 }, (_, i) => ({ parcel: String(i + 1), type: unicode, date: '01/11/2026', time: '12:00:00' })),
  }, '');
  assert.ok(unicodeCard.embeds.every(embed => (embed.toJSON().fields ?? []).every(field => field.value.length <= 1024)));
  const undelivered = await buildParcelEmbed({ address: {}, scans: [{ parcel: '1', type: 'Undelivered', date: '01/11/2026', time: '12:00:00' }] }, '');
  assert.notEqual(undelivered.embeds[0].toJSON().color, 0x2ecc71);
  const mixed = await buildParcelEmbed({ address: {}, scans: [{ parcel: '1', type: 'Received', date: '01/11/2026', time: '12:00:00' }, { parcel: '1', type: 'Delivered', date: 'invalid', time: '12:00:00' }] }, '');
  assert.match(mixed.embeds[0].toJSON().title, /unknown|unconfirmed/i);
  const badDate = await buildParcelEmbed({ scans: Array(15).fill({ type: 'Delivered', date: '01/11/2026junk', time: '12:00:00junk' }) }, '');
  assert.match(plainText(badDate), /Unknown time/);
  assert.match(plainText(badDate), /3 not shown/);
  assert.doesNotMatch(plainText(badDate), /01 Nov|earlier/);
  const invalidParcel = await buildParcelEmbed({ scans: [
    { parcel: '1234567', type: 'Delivered', date: '01/11/2026', time: '12:00:00' },
    { parcel: '2', type: 'Received', date: '01/11/2026', time: '11:00:00' },
  ] }, '');
  assert.doesNotMatch(invalidParcel.embeds[0].toJSON().title, /\(1\/2\)/);
  for (const lines of [[], ['𠮷'.repeat(400)], ['bad' + String.fromCharCode(0xd800)]]) {
    const map = await buildParcelEmbed({ address: { lines }, drop: { type: 'Delivered', lat: 53, lng: -6 }, scans: [] }, '');
    assert.doesNotMatch(plainText(map), /destination=/);
    assert.doesNotMatch(plainText(map), /Open scan location/);
  }
});


test('status colors and badges distinguish every depot status group without changing source labels', async () => {
 for (const [type,color,badge] of [['Goods Held',0xf1c40f,'🟨'],['Delivered',0x90ee90,'🟩'],['Failed Delivered',0xe74c3c,'🟥'],['Carded',0xe74c3c,'🟥'],['Failed Delivery',0xe74c3c,'🟥'],['Incorrect Address',0xe74c3c,'🟥'],['Return to depot',0xe74c3c,'🟥'],['Pending',0xff8fcb,'🩷'],
  ['Undelivered',0xe74c3c,'🟥'],['Out for delivery',0x3498db,'🟦'],['Cancelled out for delivery',0xe67e22,'🟧'],
  ['Optimize For Next Day',0xe67e22,'🟧'],['Redirected',0xe67e22,'🟧'],['CAD scan',0x9b59b6,'🟪'],
  ['Received into HUB',0x8d6e63,'🟫'],['Received into depot',0x8d6e63,'🟫'],['Long lengths',0x8d6e63,'🟫'],
  ['Order received',0x2c3e50,'⬛'],['Something new from depot',0x95a5a6,'⬜']]) {
  const output=await buildParcelEmbed({scans:[{parcel:'1',type,date:'03/11/2026',time:'10:00:00'}]},'');
  assert.equal(output.embeds[0].toJSON().color,color);
  assert.ok(output.embeds[0].toJSON().description.includes(`${badge} **${type}**`));
  assert.ok(output.embeds[1].toJSON().description.includes(`${badge} **${type}**`));
 }
});

test('scan Maps fail independently and never geocode or expose a key', async t => {
 const key='SYNTHETIC_MAP_SECRET';
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 t.mock.method(globalThis.console,'warn',()=>{});
 const parcel={consNumber:'123456789',address:{contact:'Synthetic recipient'},scans:[{parcel:'1',type:'Delivered',date:'03/11/2026',time:'10:00:00',coords:{lat:53,lng:-6}}],pod:{body:'/9j/4AAQ'}};
 let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error(key);};
 const failed=await buildParcelEmbed(parcel,key);
 assert.equal(calls,1);assert.equal(failed.files.length,0);
 assert.match(plainText(failed),/Map preview unavailable/);assert.match(plainText(failed),/Open scan location/);
 assert.doesNotMatch(plainText(failed),/SYNTHETIC_MAP_SECRET|pod.jpg/);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=', 'base64');
 globalThis.fetch=async url=>{assert.match(String(url),/staticmap/);assert.doesNotMatch(String(url),/label:D|path=/);return new globalThis.Response(png,{headers:{'content-type':'image/png'}});};
 const ready=await buildParcelEmbed(parcel,key);assert.equal(ready.files[0].name,'scan-location.png');assert.ok(ready.files[0].attachment.equals(png));
 calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected');};
 for (const type of ['Goods Held','Pending','Return to depot']) {
  const excluded=await buildParcelEmbed({...parcel,scans:[{...parcel.scans[0],type}]},key);
  assert.doesNotMatch(plainText(excluded),/maps\/|53.000000/);
 }
 await buildParcelEmbed(parcel,'');assert.equal(calls,0);
 for (const type of ['Failed Delivery','Incorrect Address']) {
  const attempt=await buildParcelEmbed({...parcel,scans:[{...parcel.scans[0],type}]},'');
  assert.match(plainText(attempt),/Open scan location/);
  assert.match(plainText(attempt),/Attempted delivery/);
  assert.doesNotMatch(plainText(attempt),/Historical delivery scan/);
 }

});

test('operator find pages history, isolates selected parcels and never carries an old bay forward', async () => {
 const scans=Array.from({length:15},(_,i)=>({parcel:'1',type:i===14?'Goods Held':'CAD scan',date:'03/11/2026',time:`10:${String(i).padStart(2,'0')}:00`,...(i===0?{bay:'7',sequence:'2'}:{})}));
 scans.push({parcel:'2',type:'Delivered',date:'03/11/2026',time:'11:00:00'});
 const parcel={consNumber:'123456789',address:{depot:'22'},scans,drop:{type:'Delivered',lat:53,lng:-6},pod:{body:'/9j/4AAQ'}};
 const selected=await buildParcelEmbed(parcel,'',{parcelNumber:'1',page:1});
 assert.match(selected.embeds[0].toJSON().title,/Parcel 1.*Goods Held/);
 assert.match(selected.embeds[0].toJSON().fields[0].value,/Depot position: not recorded in latest scan/);
 assert.doesNotMatch(selected.embeds[0].toJSON().fields[0].value,/Bay:7/);
 const history=selected.embeds[1].toJSON();
 assert.match(history.footer.text,/Page 2 of 2/);
 assert.match(history.description,/10:00:00.*Bay:7 Seq:2/s);
 assert.doesNotMatch(history.description,/Delivered|P2/);
 assert.equal(selected.files.length,0,'consignment-level photos must not be attributed to selected parcel');
 const ambiguous=await buildParcelEmbed({...parcel,scans:[...scans,{parcel:'',type:'Delivered',date:'03/11/2026',time:'12:00:00'}]},'',{parcelNumber:'1'});
 assert.match(ambiguous.embeds[0].toJSON().title,/unconfirmed/);
 assert.match(ambiguous.embeds[0].toJSON().description,/unassigned parcel identity/);
 assert.equal(findHistoryPages({scans:[...scans.slice(0,12),{parcel:'',type:'Carded'}]}),1,'single parcel pages exclude unassigned scans like the renderer');


 assert.doesNotMatch(plainText(selected),/maps\/|attachment:\/\//);
 const overview=await buildParcelEmbed(parcel,'');
 assert.match(overview.embeds[0].toJSON().fields.find(f=>f.name==='📋 Parcel details').value,/Delivery depot: 22/);
});

test('find card uses spaced, labelled sections that read well on a phone', async () => {
  const output = await buildParcelEmbed({
    consNumber: '123456789', arrangedDate: '03/11/2026',
    address: { depot: 'SYNTHETIC - 22', lines: ['1 Synthetic Street'], mobile: '0870000000' },
    scans: [
      { parcel: '1', type: 'Goods Held', date: '04/11/2026', time: '11:26:06', route: 'D22' },
      { parcel: '1', type: 'CAD scan', date: '03/11/2026', time: '07:28:38', route: 'cad', bay: '4', sequence: '68' },
    ],
  }, '');
  const [main, history, recipient] = output.embeds.map(embed => embed.toJSON());
  const field = (embed, name) => embed.fields.find(f => f.name === name)?.value ?? '';

  assert.deepEqual(main.fields.map(f => f.name), ['🕒 Latest event', '📋 Parcel details']);
  assert.match(field(main, '🕒 Latest event'), /^📅 04 Nov 11:26:06\n🚚 Route D22\n📍 Depot position: not recorded in latest scan/);
  assert.match(field(main, '📋 Parcel details'), /🔢 Selected parcel: 1\n🗓️ Planned delivery: 03\/11\/2026\n🏢 Delivery depot: SYNTHETIC - 22/);
  for (const f of [...main.fields, ...recipient.fields]) assert.ok(f.value.endsWith('\n\u200b'), `${f.name} needs breathing space`);
  assert.deepEqual(recipient.fields.map(f => f.name), ['🏠 Delivery address', '📞 Contact']);
  assert.match(history.description, /\*\*04 Nov 11:26:06\*\* · 🟨 \*\*Goods Held\*\*\n🚚 Route D22\n\u200b\n\*\*03 Nov 07:28:38\*\* · 🟪 \*\*CAD scan\*\*\n🚚 Route cad · 📍 Bay:4 Seq:68/);
});
