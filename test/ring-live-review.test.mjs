// Synthetic Ring HTTP/SDP/image contracts only, never official simulator evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { RingSessions } from '../server/ring.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';
const NOW = Date.UTC(2026, 8, 29, 10);
const TOKEN = 'synthetic_live_review_token_0123456789';
const DEVICE = 'review-camera';
const image = await sharp({create:{width:300,height:200,channels:3,background:'#7a8b76'}}).withMetadata().png().toBuffer();
const imageData = `data:image/png;base64,${image.toString('base64')}`;
const ref = {name:'Private review reference',object:'the parcel',area:'the marked area',region:{x:0,y:0,width:1,height:1},consent:true};
const offer = {deviceId:DEVICE,componentId:'lens-1',sdp:'v=0\r\n'};
async function setup() {
  let time = NOW, hold, onLive, bodyHold, onBodyRead;
  const calls = [];
  const ring = new RingSessions({now:()=>time,fetcher:async(url,options={})=>{
    calls.push({url,options});
    if (new URL(url).pathname === '/v1/devices') return Response.json({data:[{type:'devices',id:DEVICE,relationships:{capabilities:{data:{type:'device-capabilities',id:'cap'}}}}],included:[{type:'device-capabilities',id:'cap',attributes:{video:{},components:{items:[{component_id:'lens-1',component_type:'lens'},{component_id:'lens-2',component_type:'lens'}]}}}]});
    if (options.method === 'POST') {
      onLive?.(); if(hold) await hold;
      return new Response(bodyHold ? new ReadableStream({async pull(controller) {onBodyRead?.(); await bodyHold; controller.enqueue(new TextEncoder().encode('v=0\r\n')); controller.close();}}, {highWaterMark:0}) : 'v=0\r\n',{status:201,headers:{'content-type':'application/sdp',location:`https://api.amazonvision.com/v1/devices/${DEVICE}/media/streaming/whep/sessions/private-session?private=routing`}});
    }
    if(options.method === 'DELETE') return new Response(null,{status:204});
    throw new Error('Unexpected synthetic request');
  }});
  const store = new Store(':memory:',()=>time);
  const owner = store.register({email:'owner@example.test',name:'Owner',password:'synthetic password only'});
  const other = store.register({email:'other@example.test',name:'Other',password:'synthetic password only'});
  const app = await createApp({store,ring,origin:'https://aperture.test'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = (path,method='GET',body,token=owner.token)=>fetch(base+'/api'+path,{method,headers:{origin:'https://aperture.test','content-type':'application/json',cookie:`aperture_session=${token}`},body:body===undefined?undefined:JSON.stringify(body)});
  await ring.connect(owner.user.id,TOKEN,true);
  async function camera() {
    const stream = await ring.startLive(owner.user.id,offer);
    const response = await call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData});
    assert.equal(response.status,201); const frame = await response.json();
    await ring.stopLive(owner.user.id,stream.id);
    const saved = await call('/cameras/ring','POST',{...ref,frameId:frame.id});
    assert.equal(saved.status,201); return {id:(await saved.json()).id,frame};
  }
  function check(cameraId,minutes=30) {
    const pass = store.createPass(owner.user.id,{cameraId,label:'Private label',minutes,budget:3,cooldown:60,consent:true});
    const job = store.request(pass.token,{requestKey:'synthetic-request'}); return {pass,job};
  }
  return {ring,store,owner,other,call,camera,check,calls,setTime:v=>time=v,blockLive:()=>{let release;hold=new Promise(resolve=>release=resolve);return release;},whenLive:fn=>onLive=fn,delayBody:()=>{let release;bodyHold=new Promise(resolve=>release=resolve);const entered=new Promise(resolve=>onBodyRead=resolve);return {release,entered};},close:async()=>{await app.close();store.close();}};
}

test('live reference saves sanitized browser pixels without inventing Ring capture time or leaking credentials', async()=>{
 const f=await setup();
 try {
  const {id,frame}=await f.camera();
  assert.equal(frame.capturedAt,null);assert.equal(frame.sourceTimeVerified,false);assert.equal(frame.fresh,false);
  assert.equal(frame.mediaOrigin,'browser-live-capture');assert.equal(frame.downloadedAt,NOW);
  assert.equal(JSON.stringify(frame).includes(TOKEN),false);assert.equal(JSON.stringify(frame).includes('private-session'),false);
  const metadata=await sharp(f.store.camera(f.owner.user.id,id).image).metadata();
  assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);
  assert.equal(f.store.ringSource(f.owner.user.id,id).capturedAt,null);
  assert.equal((await f.call(`/ring/frames/${frame.id}`,'GET',undefined,f.other.token)).status,409);
  assert.equal((await f.call(`/cameras/${id}/image`,'GET',undefined,f.other.token)).status,404);
 } finally {await f.close();}
});

test('check-scoped live review uses reference source and cannot release a tampered definite answer or private evidence',async()=>{
 const f=await setup();
 try {
  const c=await f.camera(), {pass,job}=f.check(c.id);
  assert.equal((await f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp,deviceId:'injected'})).status,400);
  assert.equal((await f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp},f.other.token)).status,404);
  const start=await f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp});assert.equal(start.status,201);const stream=await start.json();
  assert.match(f.calls.filter(c=>c.options.method==='POST').at(-1).url,/component_id=lens-1$/);
  assert.equal((await f.call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData,capturedAt:NOW})).status,400);
  const frame=await (await f.call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData})).json();
  assert.equal((await f.call('/cameras/ring','POST',{...ref,frameId:frame.id})).status,404);
  assert.equal((await f.call(`/checks/${job.id}/complete`,'POST',{frameId:c.frame.id,result:'visible',confirmed:true})).status,404);
  const otherCheck=f.check(c.id);assert.equal((await f.call(`/checks/${otherCheck.job.id}/complete`,'POST',{frameId:frame.id,result:'visible',confirmed:true})).status,404);
  f.setTime(NOW+4000);
  const approved=await f.call(`/checks/${job.id}/complete`,'POST',{frameId:frame.id,result:'visible',note:'Private context',confirmed:true});
  assert.equal(approved.status,200);assert.deepEqual(await approved.json(),{result:'cannot_verify',fresh:false});
  const publicResult=await (await f.call(`/p/${pass.token}/checks/${job.id}`,'GET',undefined,'')).json();
  assert.deepEqual(Object.keys(publicResult).sort(),['completedAt','id','observedAt','provider','result','reviewedAt','sourceTimeVerified','state']);
  assert.equal(f.ring.streams.size,0);assert.equal([...f.ring.frames.values()].some(frame=>frame.jobId===job.id),false);
  assert.equal(publicResult.provider,'ring-live-owner-review');assert.equal(publicResult.observedAt,null);
  assert.equal(publicResult.reviewedAt,NOW+4000);assert.equal(publicResult.sourceTimeVerified,false);
  const serialized=JSON.stringify(publicResult);
  for(const privateValue of [DEVICE,'Private context',TOKEN,'image','sdp','private-session']) assert.equal(serialized.includes(privateValue),false);
  const record=f.store.observation(f.owner.user.id,job.id);assert.equal(record.source.provider,'ring-live-browser-capture');assert.equal(record.source.capturedAt,null);
  assert.equal((await f.call(`/checks/${job.id}/image`,'GET',undefined,f.other.token)).status,404);
  await f.call(`/passes/${pass.id}/revoke`,'POST',{});
  assert.equal((await f.call(`/p/${pass.token}/checks/${job.id}`,'GET',undefined,'')).status,410);
  assert.equal(f.ring.streams.size,0);
 } finally {await f.close();}
});

test('revocation during stream negotiation closes the late upstream session',async()=>{
 const f=await setup();
 try {
  const c=await f.camera(),{pass,job}=f.check(c.id),release=f.blockLive();
  let started; const entered=new Promise(resolve=>started=resolve);f.whenLive(started);
  const pending=f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp});await entered;
  await f.call(`/passes/${pass.id}/revoke`,'POST',{});release();
  assert.equal((await pending).status,410);assert.equal(f.ring.streams.size,0);
  assert.equal(f.calls.at(-1).options.method,'DELETE');
 } finally {await f.close();}
});

test('revocation or disconnect during asynchronous image sanitation prevents frame retention',async()=>{
 for(const mode of ['revoke','disconnect']) {
  const f=await setup();
  try {
   const c=await f.camera(),{pass,job}=f.check(c.id);
   const stream=await (await f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp})).json();
   const original=f.ring.live.bind(f.ring);let once=true;
   f.ring.live=(...args)=>{const result=original(...args);if(once){once=false;queueMicrotask(()=>mode==='revoke'?f.store.revoke(f.owner.user.id,pass.id):f.ring.disconnect(f.owner.user.id));}return result;};
   const response=await f.call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData});
   assert.equal(response.status,mode==='revoke'?410:409);
   assert.equal([...f.ring.frames.values()].some(frame=>frame.jobId===job.id),false);
  } finally {await f.close();}
 }
});

test('pass expiry and check timeout bound live sessions; stopped or expired sessions cannot capture frames',async()=>{
 const f=await setup();
 try {
  const c=await f.camera(),{pass,job}=f.check(c.id,1);
  const stream=await (await f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp})).json();
  assert.equal(stream.expiresAt,pass.expires);f.setTime(pass.expires);
  assert.equal((await f.call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData})).status,404);
  assert.equal(f.ring.streams.size,0);
  const second=f.check(c.id);f.setTime(pass.expires+110000);
  const late=await(await f.call(`/checks/${second.job.id}/ring-live`,'POST',{sdp:offer.sdp})).json();
  assert.equal(late.expiresAt,pass.expires+120000);
  await f.call(`/ring/live/${late.id}`,'DELETE');
  assert.equal((await f.call(`/ring/live/${late.id}/frame`,'POST',{image:imageData})).status,404);
 } finally {await f.close();}
});

test('deleting the reference closes its live check and purges private review records',async()=>{
 const f=await setup();
 try {
  const c=await f.camera(),{pass,job}=f.check(c.id);
  const stream=await(await f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp})).json();
  const frame=await(await f.call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData})).json();
  assert.equal((await f.call(`/cameras/${c.id}`,'DELETE')).status,200);
  assert.equal(f.ring.streams.size,0);
  assert.equal((await f.call(`/ring/frames/${frame.id}`)).status,404);assert.equal(f.ring.frames.has(frame.id),false);
  assert.equal((await f.call(`/p/${pass.token}`,'GET',undefined,'')).status,404);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM jobs').get().n,0);
 } finally {await f.close();}
});


test('connected owners cannot read, import, capture or stop each other’s existing live frames and sessions',async()=>{
 const f=await setup();
 try {
  await f.ring.connect(f.other.user.id,TOKEN,true);
  const stream=await f.ring.startLive(f.owner.user.id,offer);
  const captured=await f.call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData});
  assert.equal(captured.status,201);const frame=await captured.json();
  assert.equal(f.ring.frames.has(frame.id),true);
  assert.equal((await f.call(`/ring/frames/${frame.id}`,'GET',undefined,f.other.token)).status,404);
  assert.equal((await f.call('/cameras/ring','POST',{...ref,frameId:frame.id},f.other.token)).status,404);
  assert.equal((await f.call(`/ring/live/${stream.id}/frame`,'POST',{image:imageData},f.other.token)).status,404);
  await f.call(`/ring/live/${stream.id}`,'DELETE',undefined,f.other.token);
  assert.equal(f.ring.streams.has(stream.id),true);assert.equal(f.ring.frames.has(frame.id),true);
  assert.equal((await f.call(`/ring/frames/${frame.id}`)).status,200);
  const imported=await f.call('/cameras/ring','POST',{...ref,frameId:frame.id});assert.equal(imported.status,201);
  assert.equal(f.store.workspace(f.other.user.id).cameras.length,0);
 } finally {await f.close();}
});

test('scope changes while the SDP body is pending produce a controlled denial and no retained stream',async()=>{
 for(const mode of ['revoke','delete','disconnect','expire-prune','expire-unpruned']) {
  const f=await setup();
  try {
   const c=await f.camera(),{pass,job}=f.check(c.id,1),{entered,release}=f.delayBody();
   const pending=f.call(`/checks/${job.id}/ring-live`,'POST',{sdp:offer.sdp});
   await entered;assert.equal(f.ring.streams.size,1);
   if(mode==='revoke') await f.call(`/passes/${pass.id}/revoke`,'POST',{});
   else if(mode==='delete') await f.call(`/cameras/${c.id}`,'DELETE');
   else if(mode==='disconnect') await f.call('/ring','DELETE');
   else {f.setTime(pass.expires);if(mode==='expire-prune') f.ring.prune();}
   release();const response=await pending;
   assert.equal(response.status,409,mode);const denied=await response.json();
   assert.equal(denied.code,mode==='disconnect'?'ring_disconnected':'ring_live',mode);
   assert.equal('sdp' in denied,false);assert.equal(f.ring.streams.size,0);
   assert.equal(f.calls.at(-1).options.method,'DELETE');
  } finally {await f.close();}
 }
});


test('late capture cleanup deletes only the specified frame owned by the caller',async()=>{
 const f=await setup();
 try {
  await f.ring.connect(f.other.user.id,TOKEN,true);
  const ownerStream=await f.ring.startLive(f.owner.user.id,offer);
  const ownerFrame=await(await f.call(`/ring/live/${ownerStream.id}/frame`,'POST',{image:imageData})).json();
  const otherStream=await f.ring.startLive(f.other.user.id,offer);
  const otherFrame=await(await f.call(`/ring/live/${otherStream.id}/frame`,'POST',{image:imageData},f.other.token)).json();
  assert.equal((await f.call(`/ring/frames/${ownerFrame.id}`,'DELETE',undefined,f.other.token)).status,200);
  assert.equal(f.ring.frames.has(ownerFrame.id),true);assert.equal(f.ring.frames.has(otherFrame.id),true);
  assert.equal((await f.call(`/ring/frames/${ownerFrame.id}`,'DELETE',undefined,'')).status,401);
  await f.call(`/ring/frames/${ownerFrame.id}`,'DELETE');
  assert.equal(f.ring.frames.has(ownerFrame.id),false);assert.equal(f.ring.frames.has(otherFrame.id),true);
  assert.equal((await f.call(`/ring/frames/${otherFrame.id}`,'GET',undefined,f.other.token)).status,200);
  assert.equal((await f.call(`/ring/frames/${ownerFrame.id}`,'DELETE')).status,200);
 } finally {await f.close();}
});
