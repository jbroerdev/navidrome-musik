import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from './server.mjs';
async function fixture(run){
 const calls=[];const upstream=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const url=new URL(req.url,'http://localhost'),params=req.method==='POST'?new URLSearchParams(body):url.searchParams;calls.push({url,params,method:req.method});const failed=params.get('id')==='denied';res.setHeader('Content-Type','application/json');res.end(JSON.stringify({'subsonic-response':failed?{status:'failed',error:{code:50,message:'Nicht erlaubt'}}:{status:'ok'}}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const app=createApp({upstream:'http://127.0.0.1:'+upstream.address().port});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 try{const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'tester',password:'test'})}),headers={Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};await run({base,headers,calls,post:(input,extra={})=>fetch(base+'/api/scrobble',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(input)})});}finally{await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>upstream.close(r))]);}
}
const event={id:'track&1',playId:'visit-1',time:1700000000000,submission:false};
test('Playback reports use authenticated POST and completed visits are submitted only once',()=>fixture(async({post,calls})=>{
 assert.equal((await post(event)).status,200);let last=calls.at(-1);assert.equal(last.url.pathname,'/rest/scrobble.view');assert.equal(last.url.search,'');assert.equal(last.method,'POST');assert.equal(last.params.get('submission'),'false');assert.equal(last.params.get('id'),'track&1');assert.equal(last.params.get('u'),'tester');
 const complete={...event,submission:true,u:'attacker',t:'secret'};assert.equal((await post(complete)).status,200);const count=calls.length;const duplicate=await post(complete);assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).duplicate,true);assert.equal(calls.length,count);
 assert.equal((await post({...complete,id:'different'})).status,409);assert.equal((await post({...complete,playId:'visit-2'})).status,200);assert.equal(calls.at(-1).params.get('u'),'tester');assert.equal(calls.at(-1).params.has('playId'),false);
}));
test('History endpoints reject unauthenticated, cross-origin and invalid payloads before upstream writes',()=>fixture(async({base,headers,post,calls})=>{
 assert.equal((await fetch(base+'/api/scrobble',{method:'POST',body:'{}'})).status,401);assert.equal((await fetch(base+'/api/scrobble',{headers})).status,405);const count=calls.length;
 assert.equal((await post(event,{Origin:'https://unexpected.example'})).status,403);
 for(const input of [null,{}, {...event,id:''},{...event,playId:''},{...event,submission:'true'},{...event,time:-1},{...event,time:1.5},{...event,time:Date.now()+600000}])assert.equal((await post(input)).status,400);
 assert.equal(calls.length,count);
}));
test('Failed or ambiguous submissions are not retried and never reported as successful',()=>fixture(async({post,calls})=>{
 const bad={...event,id:'denied',submission:true};assert.equal((await post(bad)).status,502);const count=calls.length;assert.equal((await post(bad)).status,502);assert.equal(calls.length,count);
}));
