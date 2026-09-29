// Synthetic HTTP contract fixtures only. These are not the official Ring simulator or live Ring evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { RingSessions } from '../server/ring.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';
const TOKEN = 'synthetic_contract_token_only_0123456789';
const DEVICE = 'contract-camera';
const NOW = Date.UTC(2026,8,12,10);
const rawImage = await sharp({create:{width:400,height:300,channels:3,background:'#708068'}}).png().toBuffer();
function fixture({online=true,multi=false, timestamp=NOW-1000, origin='snapshot', delay, mediaHost='download-test.amazonvision.com'}={}) {
 const calls=[];
 const fetcher=async(url,options={})=>{
  calls.push({url,options});const parsed=new URL(url);
  if(parsed.pathname==='/v1/devices')return Response.json({data:[{type:'devices',id:DEVICE,attributes:{name:'Synthetic contract camera'},relationships:{capabilities:{data:{type:'device-capabilities',id:'cap'}},status:{data:{type:'device-status',id:'status'}}}}],included:[{type:'device-capabilities',id:'cap',attributes:{video:{codecs:['AVC']},...(multi?{components:{items:[{component_id:'1',component_type:'lens',component_name:'Contract view 1'},{component_id:'2',component_type:'lens',component_name:'Contract view 2'}]}}:{})}},{type:'device-status',id:'status',attributes:{online}}]});
  if(parsed.pathname.endsWith('/media/image/download'))return new Response(null,{status:303,headers:{location:`https://${mediaHost}/image?temporary=synthetic-only`,'x-request-id':'contract-request'}});
  if(parsed.pathname==='/image'){if(delay)await delay();return new Response(rawImage,{headers:{'content-type':'image/png',...(timestamp!==null?{'x-media-timestamp':String(timestamp)}:{}),'x-media-origin':origin,'x-request-id':'contract-private-request'}});}
  throw new Error('Unexpected fixture request');
 };
 return {calls,fetcher};
}
function owner(store, suffix='a'){return store.register({name:'Synthetic owner',email:`${suffix}@example.test`,password:'synthetic test password only'});}
function pass(store,user,camera){return store.createPass(user,{cameraId:camera,label:'Synthetic privacy contract',minutes:30,budget:3,cooldown:60,consent:true});}
const refBody={name:'Synthetic Ring contract reference',object:'the fixture parcel',area:'the approved fixture area',region:{x:.1,y:.1,width:.6,height:.6},consent:true};

test('official Ring discovery contract uses server bearer auth; owner isolation, components and expiry',async()=>{
 let time=NOW;const f=fixture({multi:true}),ring=new RingSessions({fetcher:f.fetcher,now:()=>time});
 const status=await ring.connect('owner-a',TOKEN,true);
 assert.equal(f.calls[0].url,'https://api.amazonvision.com/v1/devices?include=status,capabilities');
 assert.equal(f.calls[0].options.headers.Authorization,`Bearer ${TOKEN}`);
 assert.equal(status.devices[0].components[1].name,'Contract view 2');assert.equal(status.devices[0].camera,true);
 assert.equal(JSON.stringify(status).includes(TOKEN),false);assert.equal(ring.status('owner-b').connected,false);
 time+=30*60000;assert.equal(ring.status('owner-a').connected,false);ring.close();
});

test('snapshot contract follows303 without forwarding bearer; preserves media time separately from download',async()=>{
 let time=NOW-60000;const f=fixture(),ring=new RingSessions({fetcher:f.fetcher,now:()=>time});await ring.connect('a',TOKEN,true);time=NOW;
 const frame=await ring.snapshot('a',{deviceId:DEVICE,jobId:'job-a'});
 const post=f.calls[1];assert.deepEqual(JSON.parse(post.options.body),{type:'latest_in_range',start_timestamp:NOW-60000,end_timestamp:NOW,image_options:{format:'jpeg'}});
 assert.equal(f.calls[2].options.headers.Authorization,undefined);assert.equal(f.calls[2].options.redirect,'manual');
 assert.equal(frame.capturedAt,NOW-1000);assert.equal(frame.downloadedAt,NOW);assert.equal(frame.fresh,true);assert.equal('image' in frame,false);
 const privateFrame=ring.frame('a',frame.id,'job-a');assert.equal((await sharp(privateFrame.image).metadata()).format,'jpeg');assert.equal((await sharp(privateFrame.image).metadata()).exif,undefined);
 assert.throws(()=>ring.frame('b',frame.id),/Connect a current/);assert.throws(()=>ring.frame('a',frame.id,'job-b'),/not available/);ring.close();
});

test('new connections never request pre-authorization media; later checks keep the freshness window',async()=>{
 let time=NOW;const f=fixture({timestamp:NOW+1000}),ring=new RingSessions({fetcher:f.fetcher,now:()=>time});
 try {
 await ring.connect('a',TOKEN,true);time+=2000;
 const reference=await ring.snapshot('a',{deviceId:DEVICE});
 assert.equal(JSON.parse(f.calls[1].options.body).start_timestamp,NOW);
 assert.equal(reference.sourceTimeVerified,true);
 await ring.snapshot('a',{deviceId:DEVICE,jobId:'early'});
 assert.equal(JSON.parse(f.calls[3].options.body).start_timestamp,NOW);
 time+=120000;
 await ring.snapshot('a',{deviceId:DEVICE,jobId:'later'});
 assert.equal(JSON.parse(f.calls[5].options.body).start_timestamp,time-60000);
 // A server timestamp outside the requested window must never become verified evidence.
 assert.equal(ring.publicFrame([...ring.frames.values()].at(-1)).sourceTimeVerified,false);
 } finally {ring.close();}
});

test('multi-camera scope requires one discovered string component on every download',async()=>{
 const f=fixture({multi:true}),ring=new RingSessions({fetcher:f.fetcher,now:()=>NOW});await ring.connect('a',TOKEN,true);
 await assert.rejects(ring.snapshot('a',{deviceId:DEVICE}),/exact camera module/);
 await assert.rejects(ring.snapshot('a',{deviceId:DEVICE,componentId:1}),/exact camera module/);
 await ring.snapshot('a',{deviceId:DEVICE,componentId:'2'});assert.deepEqual(JSON.parse(f.calls[1].options.body).components,[{component_id:'2'}]);ring.close();
});

test('missing and future source times are never replaced by fetch time',async()=>{
 for(const timestamp of [null,NOW+1000]){const f=fixture({timestamp}),ring=new RingSessions({fetcher:f.fetcher,now:()=>NOW});await ring.connect('a',TOKEN,true);const frame=await ring.snapshot('a',{deviceId:DEVICE,jobId:'job'});assert.equal(frame.capturedAt,null);assert.equal(frame.sourceTimeVerified,false);assert.equal(frame.fresh,false);ring.close();}
});

test('unapproved download hosts stop at the provider boundary',async()=>{
 const f=fixture({mediaHost:'unapproved.example'}),ring=new RingSessions({fetcher:f.fetcher,now:()=>NOW});await ring.connect('a',TOKEN,true);await assert.rejects(ring.snapshot('a',{deviceId:DEVICE}),/not approved/);assert.equal(f.calls.length,2);ring.close();
});

test('disconnect during a download prevents retaining or releasing its image',async()=>{
 let release;const waiting=new Promise(r=>release=r),f=fixture({delay:()=>waiting}),ring=new RingSessions({fetcher:f.fetcher,now:()=>NOW});await ring.connect('a',TOKEN,true);const pending=ring.snapshot('a',{deviceId:DEVICE});await new Promise(r=>setTimeout(r,10));ring.disconnect('a');release();await assert.rejects(pending,/connection ended/);assert.equal(ring.frames.size,0);ring.close();
});

test('disconnect during device discovery cannot resurrect a cancelled connection',async()=>{
 let release;const f=fixture(),waiting=new Promise(r=>release=r);const ring=new RingSessions({fetcher:async(...args)=>{await waiting;return f.fetcher(...args)},now:()=>NOW});const pending=ring.connect('a',TOKEN,true);ring.disconnect('a');release();await assert.rejects(pending,/cancelled/);assert.equal(ring.status('a').connected,false);ring.close();
});

test('source provenance persists privately; missing or stale source times abstain at approval',async()=>{
 let time=NOW;const store=new Store(':memory:',()=>time),u=owner(store).user;
 try{for(const capturedAt of [NOW-1000,null,NOW-61000]){
 const source={deviceId:DEVICE,componentId:null,capturedAt,downloadedAt:NOW,mediaOrigin:'snapshot',requestId:'private-contract-id',sourceTimeVerified:capturedAt!==null,image:rawImage};
 const camera=store.addRingCamera(u.id,refBody,source),p=pass(store,u.id,camera.id),job=store.request(p.token,{requestKey:`contract-${String(capturedAt)}`});
 const result=store.complete(u.id,job.id,{result:'visible',confirmed:true,note:'Private contract note'},rawImage,source);
 assert.equal(result.result,capturedAt===NOW-1000?'visible':'cannot_verify');const released=store.result(p.token,job.id);
 assert.equal(released.provider,'ring-snapshot-owner-review');assert.equal(released.observedAt,capturedAt);assert.equal(JSON.stringify(released).includes('private-contract-id'),false);assert.equal('image' in released,false);
 assert.equal(store.observation(u.id,job.id).source.requestId,'private-contract-id');store.deleteCamera(u.id,camera.id);
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM job_sources').get().n,0);
 }}finally{store.close();}
});

test('Ring HTTP workflow: connect, import, fetch, approve, isolate source and revoke in-flight downloads',async()=>{
 let time=NOW;let hold=false,release;const waiting=()=>new Promise(r=>release=r);let gate;
 const f=fixture({delay:()=>hold?gate:undefined}),ring=new RingSessions({fetcher:f.fetcher,now:()=>time}),store=new Store(':memory:',()=>time);
 const app=await createApp({store,ring,origin:'https://aperture.test'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const u=owner(store),v=owner(store,'b');const call=(path,method='GET',body,token=u.token)=>fetch(base+'/api'+path,{method,headers:{origin:'https://aperture.test','content-type':'application/json',cookie:`aperture_session=${token}`},body:body===undefined?undefined:JSON.stringify(body)});
 try{
 assert.equal((await call('/ring','GET',undefined,'')).status,401);
 assert.equal((await call('/ring/connect','POST',{token:TOKEN,consent:true})).status,200);
 const frame=await(await call('/ring/reference','POST',{deviceId:DEVICE,componentId:null})).json();
 assert.equal((await call(`/ring/frames/${frame.id}`,'GET',undefined,v.token)).status,409);
 const camera=await(await call('/cameras/ring','POST',{...refBody,frameId:frame.id})).json();
 const p=pass(store,u.user.id,camera.id),job=store.request(p.token,{requestKey:'http-contract-01'});
 const snapshot=await(await call(`/checks/${job.id}/ring-snapshot`,'POST',{})).json();assert.ok(snapshot.id);
 assert.equal((await call(`/checks/${job.id}/complete`,'POST',{frameId:snapshot.id,result:'visible',observedAt:NOW,confirmed:true})).status,400);
 assert.equal((await call(`/checks/${job.id}/complete`,'POST',{frameId:snapshot.id,result:'visible',confirmed:true,note:'Private fixture note'})).status,200);
 assert.deepEqual((await(await call('/workspace')).json()).provider,{ringAdapter:'available',automatedRecognition:false,answerApproval:'owner'});
 const result=store.result(p.token,job.id);assert.equal(result.provider,'ring-snapshot-owner-review');assert.deepEqual(Object.keys(result).sort(),['completedAt','id','observedAt','provider','result','state']);
 const privateRecord=await(await call(`/checks/${job.id}`)).json();assert.equal(privateRecord.source.provider,'ring-api');assert.equal((await call(`/checks/${job.id}/image`,'GET',undefined,v.token)).status,404);
 const p2=pass(store,u.user.id,camera.id),job2=store.request(p2.token,{requestKey:'http-contract-02'});hold=true;gate=waiting();const pending=call(`/checks/${job2.id}/ring-snapshot`,'POST',{});await new Promise(r=>setTimeout(r,20));store.revoke(u.user.id,p2.id);release();assert.equal((await pending).status,410);
 await call('/ring','DELETE');assert.equal((await call(`/ring/frames/${snapshot.id}`)).status,409);assert.equal(ring.frames.size,0);
 }finally{await app.close();store.close();}
});

 test('offline status does not block authorized stored footage; old evidence is not fresh',async()=>{
 let time=NOW-120000;const f=fixture({online:false,timestamp:NOW-90000}),ring=new RingSessions({fetcher:f.fetcher,now:()=>time});
 try {await ring.connect('a',TOKEN,true);time=NOW;const frame=await ring.snapshot('a',{deviceId:DEVICE});assert.equal(frame.sourceTimeVerified,true);assert.equal(frame.fresh,false);assert.equal(frame.capturedAt,NOW-90000);}finally{ring.close();}
 });
