import test from 'node:test';
import assert from 'node:assert/strict';
import { createFindViews } from '../../bot/src/findViews.js';
import { buildParcelEmbed } from '../../bot/src/render.js';

test('private find navigation stays on saved scans and rejects other actors and expired views', async () => {
 let clock=1000, renders=0;
 const views=createFindViews({buildParcelEmbed:async (...args)=>{renders++;return buildParcelEmbed(...args);},now:()=>clock});
 const actor={user:{id:'owner'},guildId:'guild',channelId:'channel',createdTimestamp:clock};
 const parcel={consNumber:'123456789',address:{},scans:Array.from({length:15},(_,i)=>({parcel:i===14?'2':'1',type:'Received',date:'03/11/2026',time:`10:${String(i).padStart(2,'0')}:00`}))};
 const payload=await views.open(parcel,actor);
 const ids=payload.components.flatMap(row=>row.toJSON().components.map(b=>b.custom_id));
 const next=ids.find(id=>id.endsWith(':all:1'));
 const selected=ids.find(id=>id.endsWith(':1:0'));
 assert.ok(next);assert.ok(selected);
 let edited,replies=0,deferred=0;
 const click={...actor,customId:next,message:{id:'message'},deferUpdate:async()=>{deferred++;},editReply:async p=>{edited=p;},reply:async()=>{replies++;}};
 await views.handle({...click,user:{id:'other'}});assert.equal(replies,1);assert.equal(renders,1);
 await views.handle({...click,channelId:'elsewhere'});assert.equal(replies,2);assert.equal(renders,1);
 await views.handle(click);assert.equal(deferred,1);assert.match(edited.embeds[1].toJSON().footer.text,/Page 2 of 2/);
 assert.deepEqual(edited.attachments,[],'clear old files when changing card');
 await views.handle({...click,customId:selected});assert.match(edited.embeds[0].toJSON().title,/Parcel 1/);assert.equal(edited.files.length,0);
 clock+=14*60_000;const before=renders;
 await views.handle(click);assert.equal(replies,3);assert.equal(renders,before);
 views.close();
});

test('find and recovered find both expose private navigation without re-enqueue on button clicks', async () => {
 const { createInteractionHandler }=await import('../../bot/src/interactions.js');
 const parcel={consNumber:'123456789',address:{},scans:Array.from({length:13},(_,i)=>({parcel:'1',type:'Received',date:'03/11/2026',time:`10:${String(i).padStart(2,'0')}:00`}))};
 const result={id:'synthetic-result',parcel,command:'find'};
 let enqueued=0,acked=0,payload,privateFlag;
 const handler=createInteractionHandler({cfg:{guildId:'guild'},enqueueAndWait:async()=>{enqueued++;return result;},buildParcelEmbed,
  acknowledgeResult:async()=>{acked++;},listResults:async()=>[result]});
 const base={user:{id:'owner'},guildId:'guild',channelId:'channel',memberPermissions:{has:()=>true},options:{getString:()=> '123456789'},
  isChatInputCommand:()=>true,isButton:()=>false,deferReply:async p=>{privateFlag=p.flags;},editReply:async p=>{payload=p;}};
 await handler({...base,commandName:'find'});assert.ok(privateFlag);assert.equal(acked,1);
 const id=payload.components[0].toJSON().components[0].custom_id;
 await handler({...base,isChatInputCommand:()=>false,isButton:()=>true,customId:id,deferUpdate:async()=>{}});
 assert.equal(enqueued,1);assert.equal(acked,1);assert.match(payload.embeds[1].toJSON().footer.text,/Page 2 of 2/);
 let denied=false;
 await handler({...base,isChatInputCommand:()=>false,isButton:()=>true,customId:id,memberPermissions:{has:()=>false},reply:async()=>{denied=true;}});
 assert.equal(denied,true);
 await handler({...base,commandName:'result'});assert.ok(payload.components.length);assert.equal(acked,2);assert.equal(enqueued,1);
});
