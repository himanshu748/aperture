// Synthetic protocol fixtures. Live Playground verification is recorded separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RingSessions} from '../server/ring.mjs';
const TOKEN='synthetic_live_token_0123456789';
const DEVICE='test-camera';
const PATH=`/v1/devices/${DEVICE}/media/streaming/whep/sessions`;
function fixture({location=`https://api.amazonvision.com${PATH}/test-session?location=private-routing`,answer='v=0\r\n',hold}={}) {
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});const path=new URL(url).pathname;
  if(path==='/v1/devices')return Response.json({data:[{type:'devices',id:DEVICE,relationships:{capabilities:{data:{type:'device-capabilities',id:'cap'}}}}],included:[{type:'device-capabilities',id:'cap',attributes:{video:{codecs:['AVC']},components:{items:[{component_id:'1',component_type:'lens'}]}}}]});
  if(options.method==='POST'){if(hold)await hold();return new Response(answer,{status:201,headers:{'Content-Type':'application/sdp',Location:location}});}
  if(options.method==='DELETE')return new Response(null,{status:204});
  throw new Error('Unexpected request');
 };
 return {calls,fetcher};
}
const offer={deviceId:DEVICE,componentId:'1',sdp:'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\n'};
test('live view stays on discovered device/module; response hides token and upstream session URL',async()=>{
 const f=fixture(),ring=new RingSessions({fetcher:f.fetcher});
 try {
 await ring.connect('owner',TOKEN,true);
 await assert.rejects(ring.startLive('owner',{...offer,deviceId:'other'}),/Select a camera/);
 await assert.rejects(ring.startLive('owner',{...offer,componentId:'other'}),/exact camera/);
 const stream=await ring.startLive('owner',offer);
 assert.equal(f.calls[1].url,`https://api.amazonvision.com${PATH}?component_id=1`);
 assert.equal(f.calls[1].options.headers.Authorization,`Bearer ${TOKEN}`);
 assert.equal(f.calls[1].options.redirect,'manual');
 assert.equal(stream.sdp,'v=0\r\n');assert.ok(stream.id);
 assert.equal(JSON.stringify(stream).includes(TOKEN),false);
 assert.equal(JSON.stringify(stream).includes('private-routing'),false);
 await ring.stopLive('other-owner',stream.id);assert.equal(ring.streams.size,1);
 await assert.rejects(ring.startLive('owner',offer),/Stop the current/);
 await ring.stopLive('owner',stream.id);assert.equal(ring.streams.size,0);
 assert.equal(f.calls.at(-1).options.method,'DELETE');
 }finally{ring.close();}
});
test('untrusted session locations are never called',async()=>{
 for(const location of [`https://other.example${PATH}/session`,`https://api.amazonvision.com/v1/devices/other/media/streaming/whep/sessions/session`,`https://user:password@api.amazonvision.com${PATH}/session`]){
 const f=fixture({location}),ring=new RingSessions({fetcher:f.fetcher});
 try{await ring.connect('owner',TOKEN,true);await assert.rejects(ring.startLive('owner',offer),/unexpected response/);assert.equal(f.calls.length,2);assert.equal(ring.streams.size,0);}finally{ring.close();}
 }
});
test('invalid answer closes the upstream session without retaining it',async()=>{
 const f=fixture({answer:'invalid SDP'}),ring=new RingSessions({fetcher:f.fetcher});
 try{await ring.connect('owner',TOKEN,true);await assert.rejects(ring.startLive('owner',offer),/unexpected response/);assert.equal(ring.streams.size,0);assert.equal(f.calls.at(-1).options.method,'DELETE');}finally{ring.close();}
});
test('disconnect during negotiation closes late sessions instead of releasing them',async()=>{
 let release;const waiting=new Promise(r=>release=r);const f=fixture({hold:()=>waiting}),ring=new RingSessions({fetcher:f.fetcher});
 try{await ring.connect('owner',TOKEN,true);const pending=ring.startLive('owner',offer);ring.disconnect('owner');release();await assert.rejects(pending,/connection ended/);assert.equal(ring.streams.size,0);assert.equal(f.calls.at(-1).options.method,'DELETE');}finally{ring.close();}
});
test('stream lifetime is bounded and disconnect clears active streams',async()=>{
 let time=100000;const f=fixture(),ring=new RingSessions({fetcher:f.fetcher,now:()=>time});
 try{await ring.connect('owner',TOKEN,true);const stream=await ring.startLive('owner',offer);assert.equal(stream.expiresAt,time+120000);time+=120001;ring.prune();assert.equal(ring.streams.size,0);await ring.startLive('owner',offer);ring.disconnect('owner');assert.equal(ring.streams.size,0);}finally{ring.close();}
});
