import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createApp} from './server.mjs';
test('The browser entry point and every imported local module are actually served as JavaScript',async()=>{
 const app=createApp();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${app.address().port}`,pending=[new URL('/app.js',base)],seen=new Set();
 try{
  while(pending.length){
   const url=pending.pop();if(seen.has(url.href))continue;seen.add(url.href);
   const response=await fetch(url);assert.equal(response.status,200,url.pathname);assert.match(response.headers.get('content-type'),/javascript/,url.pathname);
   const source=await response.text();for(const match of source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))pending.push(new URL(match[1],url));
  }
 }finally{await new Promise(resolve=>app.close(resolve));}
});
test('Anmeldung, Sitzung, Proxy-Grenzen und Audio-Range',async()=>{
 const seen=[];
 const upstream=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');seen.push({url:u,range:req.headers.range});
  const correct=u.searchParams.get('t')===createHash('md5').update('test-password'+u.searchParams.get('s')).digest('hex');
  if(u.pathname.includes('stream')){res.writeHead(206,{'Content-Type':'audio/mpeg','Content-Range':'bytes 0-3/10','Accept-Ranges':'bytes'});res.end('test');return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({'subsonic-response':correct?{status:'ok',...(u.pathname.includes('/getSong.')?{song:{id:u.searchParams.get('id'),title:'Testtitel'}}:{albumList2:{album:[{id:'1',name:'Test'}]}})}:{status:'failed',error:{code:40}}}));
 });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const app=createApp({upstream:`http://127.0.0.1:${upstream.address().port}`});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.address().port}`;
 try{
  assert.equal((await fetch(base+'/api/getAlbumList2')).status,401);
  assert.equal((await fetch(base+'/api/favorite',{method:'POST',body:JSON.stringify({id:'song-1',kind:'song',starred:true})})).status,401);
  const bad=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'tester',password:'wrong'})});assert.equal(bad.status,502);assert.equal(bad.headers.get('set-cookie'),null);
  const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'tester',password:'test-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);const headers={Cookie:cookie.split(';')[0]};
  const list=await fetch(base+'/api/getAlbumList2?type=newest&u=attacker&t=bad',{headers});assert.equal(list.status,200);assert.equal((await list.json()).albumList2.album[0].name,'Test');assert.equal(seen.at(-1).url.searchParams.get('u'),'tester');assert.equal(seen.at(-1).url.searchParams.has('p'),false);
  const song=await fetch(base+'/api/getSong?id=song-1&u=attacker&t=bad',{headers});assert.equal(song.status,200);assert.equal((await song.json()).song.id,'song-1');assert.equal(seen.at(-1).url.searchParams.get('u'),'tester');
  const lyrics=await fetch(base+'/api/getLyricsBySongId?id=song-1&enhanced=true&u=attacker&t=bad',{headers});assert.equal(lyrics.status,200);assert.equal(seen.at(-1).url.pathname,'/rest/getLyricsBySongId.view');assert.equal(seen.at(-1).url.searchParams.get('enhanced'),'true');assert.equal(seen.at(-1).url.searchParams.get('id'),'song-1');assert.equal(seen.at(-1).url.searchParams.get('u'),'tester');
  assert.equal((await fetch(base+'/api/deleteUser',{headers})).status,404);
  assert.equal((await fetch(base+'/api/favorite',{headers})).status,405);
  const favorite=await fetch(base+'/api/favorite',{method:'POST',headers,body:JSON.stringify({id:'song-1',kind:'song',starred:true,u:'attacker',t:'bad'})});assert.equal(favorite.status,200);assert.equal((await favorite.json()).starred,true);assert.equal(seen.at(-1).url.pathname,'/rest/star.view');assert.equal(seen.at(-1).url.searchParams.get('id'),'song-1');assert.equal(seen.at(-1).url.searchParams.get('u'),'tester');
  const unstar=await fetch(base+'/api/favorite',{method:'POST',headers,body:JSON.stringify({id:'album-1',kind:'album',starred:false})});assert.equal(unstar.status,200);assert.equal(seen.at(-1).url.pathname,'/rest/unstar.view');assert.equal(seen.at(-1).url.searchParams.get('albumId'),'album-1');assert.equal(seen.at(-1).url.searchParams.has('id'),false);
  assert.equal((await fetch(base+'/api/favorite',{method:'POST',headers,body:JSON.stringify({id:'x',kind:'__proto__',starred:true})})).status,400);
  assert.equal((await fetch(base+'/api/favorite',{method:'POST',headers:{...headers,Origin:'https://unexpected.example'},body:JSON.stringify({id:'x',kind:'song',starred:true})})).status,403);
  assert.equal((await fetch(base+'/api/logout',{method:'POST',headers:{...headers,Origin:'https://unexpected.example'}})).status,403);
  const stream=await fetch(base+'/api/stream?id=song',{headers:{...headers,Range:'bytes=0-3'}});assert.equal(stream.status,206);assert.equal(stream.headers.get('content-range'),'bytes 0-3/10');assert.equal(await stream.text(),'test');assert.equal(seen.at(-1).range,'bytes=0-3');
  assert.equal((await fetch(base+'/api/logout',{method:'POST',headers})).status,200);assert.equal((await fetch(base+'/api/session',{headers}).then(r=>r.json())).authenticated,false);
  assert.equal((await fetch(base+'/server.mjs')).status,404);assert.match((await fetch(base).then(r=>r.text())),/Mit Navidrome verbinden/);
 }finally{await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>upstream.close(r))]);}
});
