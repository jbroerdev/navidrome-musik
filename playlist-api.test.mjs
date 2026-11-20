import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from './server.mjs';

async function fixture(run) {
  const calls=[];
  const playlists=new Map([
    ['owned',{id:'owned',name:'Original',owner:'tester',comment:'Alt',public:true,entry:[{id:'two'},{id:'one'},{id:'two'}]}],
    ['foreign',{id:'foreign',name:'Fremd',owner:'other',comment:'',public:false,entry:[{id:'keep'}]}],
    ['reorder-denied',{id:'reorder-denied',name:'Nicht umordnen',owner:'tester',entry:[{id:'one'},{id:'two'}]}],
    ['denied',{id:'denied',name:'Gesperrt',owner:'tester',comment:'',public:false,entry:[]}],
    ['slow',{id:'slow',name:'Langsam',owner:'TESTER',comment:'',public:false,entry:[]}]
  ]);
  const upstream=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    let body='';for await(const chunk of req)body+=chunk;
    const params=req.method==='POST'?new URLSearchParams(body):url.searchParams;
    calls.push({method:req.method,url,params});
    const data={status:'ok'};
    if(url.pathname.includes('getPlaylist.')&&params.get('id')==='slow')await new Promise(resolve=>setTimeout(resolve,60));
    if(url.pathname.includes('getPlaylist.'))data.playlist=playlists.get(params.get('id'));
    if(url.pathname.includes('createPlaylist')&&!params.has('playlistId')) data.playlist={id:'created-1',name:params.get('name'),owner:params.get('u')};
    if(url.pathname.includes('createPlaylist')&&params.has('playlistId')){
      const playlist=playlists.get(params.get('playlistId'));
      if(['denied','reorder-denied'].includes(params.get('playlistId')))Object.assign(data,{status:'failed',error:{code:50,message:'Nicht erlaubt'}});
      else{playlist.entry=params.getAll('songId').map(id=>({id}));data.playlist=playlist;}
    }
    if(url.pathname.includes('updatePlaylist')&&params.get('playlistId')==='denied')Object.assign(data,{status:'failed',error:{code:50,message:'Nicht erlaubt'}});
    if(url.pathname.includes('deletePlaylist')){
      if(params.get('id')==='denied')Object.assign(data,{status:'failed',error:{code:50,message:'Nicht erlaubt'}});
      else playlists.delete(params.get('id'));
    }
    if(url.pathname.includes('createPlaylist')&&params.get('name')==='Metadata failure')data.playlist.id='denied';
    if(url.pathname.includes('updatePlaylist')&&data.status==='ok'){
      const playlist=playlists.get(params.get('playlistId'));
      if(playlist){for(const key of ['name','comment','public'])if(params.has(key))playlist[key]=key==='public'?params.get(key)==='true':params.get(key);
        for(const index of params.getAll('songIndexToRemove').map(Number).sort((a,b)=>b-a))playlist.entry.splice(index,1);
        playlist.entry.push(...params.getAll('songIdToAdd').map(id=>({id})));
      }
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({'subsonic-response':data}));
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const app=createApp({upstream:`http://127.0.0.1:${upstream.address().port}`});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.address().port}`;
  try {
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'tester',password:'test'})});
    const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
    await run({base,headers,calls,post:(path,input,extra={})=>fetch(base+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(input)})});
  } finally { await Promise.all([new Promise(resolve=>app.close(resolve)),new Promise(resolve=>upstream.close(resolve))]); }
}

test('Playlist append uses repeated POST parameters and cannot replace existing entries',()=>fixture(async({post,calls})=>{
  const response=await post('/api/playlist/add',{playlistId:'old',songIds:['song&1','song/2','song&1'],name:'Overwrite',u:'attacker',t:'bad'});
  assert.equal(response.status,200);
  const request=calls.at(-1);
  assert.equal(request.url.pathname,'/rest/updatePlaylist.view');
  assert.equal(request.method,'POST');assert.equal(request.url.search,'');
  assert.deepEqual(request.params.getAll('songIdToAdd'),['song&1','song/2','song&1']);
  assert.equal(request.params.get('playlistId'),'old');
  assert.equal(request.params.get('u'),'tester');
  for(const forbidden of ['songId','songIndexToRemove','name','p'])assert.equal(request.params.has(forbidden),false);
}));

test('New playlist preserves Unicode, ordering, description and explicit visibility choice',()=>fixture(async({post,calls})=>{
  const response=await post('/api/playlist',{name:' Neue Musik 東京 ',comment:'Zwei Zeilen\n<Musik> & mehr',public:false,songIds:['two','one']});
  assert.equal(response.status,201);
  const result=await response.json();assert.equal(result.playlist.id,'created-1');assert.equal(result.playlist.public,false);
  const create=calls.at(-2),update=calls.at(-1);
  assert.equal(create.url.pathname,'/rest/createPlaylist.view');assert.equal(create.params.get('name'),'Neue Musik 東京');
  assert.deepEqual(create.params.getAll('songId'),['two','one']);assert.equal(create.params.has('playlistId'),false);
  assert.equal(update.params.get('comment'),'Zwei Zeilen\n<Musik> & mehr');assert.equal(update.params.get('public'),'false');
  assert.equal(update.params.has('songId'),false);assert.equal(update.params.has('songIdToAdd'),false);
  assert.equal(update.method,'POST');
}));

test('Playlist writes enforce login, POST, origin and input shape; report partial creation honestly',()=>fixture(async({base,headers,post,calls})=>{
  assert.equal((await fetch(base+'/api/playlist/add',{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(base+'/api/playlist',{headers})).status,405);
  const before=calls.length;
  assert.equal((await post('/api/playlist/add',{playlistId:'old',songIds:['x']},{Origin:'https://unexpected.example'})).status,403);
  for(const body of [{playlistId:'old',songIds:[]},{playlistId:'old',songIds:'x'},{playlistId:'old',songIds:[{}]},{playlistId:'',songIds:['x']}])assert.equal((await post('/api/playlist/add',body)).status,400);
  assert.equal((await post('/api/playlist',{name:' ',comment:'',public:false,songIds:[]})).status,400);
  assert.equal((await post('/api/playlist',{name:'x',comment:'',public:'false',songIds:[]})).status,400);
  assert.equal(calls.length,before);
  assert.equal((await post('/api/playlist/add',{playlistId:'denied',songIds:['x']})).status,502);
  const start=calls.length;
  const partial=await post('/api/playlist',{name:'Metadata failure',comment:'x',public:false,songIds:['x']});
  assert.equal(partial.status,201);const result=await partial.json();assert.equal(result.ok,true);assert.equal(result.playlist.id,'denied');assert.match(result.warning,/Playlist angelegt/);
  assert.equal(calls.slice(start).filter(call=>call.url.pathname.includes('createPlaylist')).length,1);
}));

test('Playlist editing changes metadata only and preserves track order, duplicates and explicit private state',()=>fixture(async({base,headers,post,calls})=>{
  const result=await post('/api/playlist/edit',{playlistId:'owned',name:' Umbenannt 東京 ',comment:'Erste Zeile\n<Musik> & mehr',public:false,songIds:['replace'],songIdToAdd:['append'],songIndexToRemove:[0],owner:'other',u:'intruder',t:'bad'});
  assert.equal(result.status,200);assert.equal((await result.json()).playlistId,'owned');
  const update=calls.at(-1),check=calls.at(-2);
  assert.equal(check.url.pathname,'/rest/getPlaylist.view');assert.equal(check.params.get('id'),'owned');
  assert.equal(update.url.pathname,'/rest/updatePlaylist.view');assert.equal(update.method,'POST');assert.equal(update.url.search,'');
  assert.equal(update.params.get('name'),'Umbenannt 東京');assert.equal(update.params.get('comment'),'Erste Zeile\n<Musik> & mehr');assert.equal(update.params.get('public'),'false');assert.equal(update.params.get('u'),'tester');
  for(const forbidden of ['songIds','songId','songIdToAdd','songIndexToRemove','owner','p'])assert.equal(update.params.has(forbidden),false);
  let data=await fetch(base+'/api/getPlaylist?id=owned',{headers}).then(r=>r.json());
  assert.deepEqual(data.playlist.entry.map(item=>item.id),['two','one','two']);assert.equal(data.playlist.public,false);
  assert.equal((await post('/api/playlist/edit',{playlistId:'owned',name:'Umbenannt 東京',comment:'',public:true})).status,200);
  data=await fetch(base+'/api/getPlaylist?id=owned',{headers}).then(r=>r.json());
  assert.equal(data.playlist.comment,'');assert.equal(data.playlist.public,true);assert.deepEqual(data.playlist.entry.map(item=>item.id),['two','one','two']);
}));

test('Playlist editing validates inputs and authoritative ownership before writing',()=>fixture(async({base,headers,post,calls})=>{
  const body={playlistId:'owned',name:'Test',comment:'',public:false};
  assert.equal((await fetch(base+'/api/playlist/edit',{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(base+'/api/playlist/edit',{headers})).status,405);
  const before=calls.length;
  assert.equal((await post('/api/playlist/edit',body,{Origin:'https://unexpected.example'})).status,403);
  for(const patch of [{playlistId:''},{playlistId:123},{name:' '},{name:'x'.repeat(256)},{comment:null},{comment:'x'.repeat(2001)},{public:'false'}])assert.equal((await post('/api/playlist/edit',{...body,...patch})).status,400);
  assert.equal(calls.length,before);
  assert.equal((await post('/api/playlist/edit',{...body,playlistId:'foreign',owner:'tester'})).status,403);
  assert.equal(calls.slice(before).filter(call=>call.url.pathname.includes('updatePlaylist')).length,0);
  assert.equal((await post('/api/playlist/edit',{...body,playlistId:'denied'})).status,502);
}));


test('Playlist removal addresses exact duplicate positions and never replaces metadata or queue',()=>fixture(async({base,headers,post,calls})=>{
 const response=await post('/api/playlist/remove',{playlistId:'owned',indices:[2],expectedSongIds:['two','one','two'],name:'Overwrite',songIdToAdd:['bad'],u:'intruder'});
 assert.equal(response.status,200);assert.equal((await response.json()).removed,1);
 const update=calls.at(-1);assert.equal(update.method,'POST');assert.deepEqual(update.params.getAll('songIndexToRemove'),['2']);assert.equal(update.params.get('u'),'tester');
 for(const key of ['name','comment','public','songId','songIdToAdd'])assert.equal(update.params.has(key),false);
 const data=await fetch(base+'/api/getPlaylist?id=owned',{headers}).then(r=>r.json());assert.deepEqual(data.playlist.entry.map(item=>item.id),['two','one']);assert.equal(data.playlist.name,'Original');assert.equal(data.playlist.public,true);
 assert.equal((await post('/api/playlist/remove',{playlistId:'owned',indices:[0],expectedSongIds:['two','one','two']})).status,409);
}));
test('Playlist bulk removal sends descending indices once and retains unselected duplicates',()=>fixture(async({base,headers,post,calls})=>{
 assert.equal((await post('/api/playlist/remove',{playlistId:'owned',indices:[0,1],expectedSongIds:['two','one','two']})).status,200);
 assert.deepEqual(calls.at(-1).params.getAll('songIndexToRemove'),['1','0']);
 const data=await fetch(base+'/api/getPlaylist?id=owned',{headers}).then(r=>r.json());assert.deepEqual(data.playlist.entry.map(item=>item.id),['two']);
}));
test('Playlist removal rejects foreign, stale and malformed selections without a write',()=>fixture(async({base,headers,post,calls})=>{
 assert.equal((await fetch(base+'/api/playlist/remove',{method:'POST',body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/playlist/remove',{headers})).status,405);
 const input={playlistId:'owned',indices:[0],expectedSongIds:['two','one','two']};
 assert.equal((await post('/api/playlist/remove',input,{Origin:'https://unexpected.example'})).status,403);
 for(const indices of [[],[-1],[3],[0,0],[.5],['0'],null])assert.equal((await post('/api/playlist/remove',{...input,indices})).status,400);
 assert.equal((await post('/api/playlist/remove',{...input,expectedSongIds:['one','two','two']})).status,409);
 assert.equal((await post('/api/playlist/remove',{playlistId:'foreign',indices:[0],expectedSongIds:['keep']})).status,403);
 assert.equal((await post('/api/playlist/remove',null)).status,400);
 assert.equal(calls.filter(call=>call.url.pathname.includes('updatePlaylist')).length,0);
}));

test('Whole playlist deletion checks snapshot and owner, posts only id and leaves other lists intact',()=>fixture(async({base,headers,post,calls})=>{
 const input={playlistId:'owned',expectedName:'Original',expectedChanged:'',expectedSongIds:['two','one','two'],u:'intruder',owner:'other',songId:['bad']};
 const response=await post('/api/playlist/delete',input);assert.equal(response.status,200);assert.equal((await response.json()).playlistId,'owned');
 const deletion=calls.at(-1);assert.equal(deletion.url.pathname,'/rest/deletePlaylist.view');assert.equal(deletion.method,'POST');assert.equal(deletion.url.search,'');assert.equal(deletion.params.get('id'),'owned');assert.equal(deletion.params.get('u'),'tester');
 for(const key of ['playlistId','songId','songIdToAdd','songIndexToRemove','owner','expectedSongIds','expectedName','expectedChanged'])assert.equal(deletion.params.has(key),false);
 const deleted=await fetch(base+'/api/getPlaylist?id=owned',{headers}).then(r=>r.json());assert.equal(deleted.playlist,undefined);
 const other=await fetch(base+'/api/getPlaylist?id=foreign',{headers}).then(r=>r.json());assert.deepEqual(other.playlist.entry,[{id:'keep'}]);
 assert.equal(calls.filter(call=>call.url.pathname.includes('deletePlaylist')).length,1);
}));

test('Whole playlist deletion rejects unauthenticated, cross-origin, foreign, stale and malformed requests',()=>fixture(async({base,headers,post,calls})=>{
 const input={playlistId:'owned',expectedName:'Original',expectedChanged:'',expectedSongIds:['two','one','two']};
 assert.equal((await fetch(base+'/api/playlist/delete',{method:'POST',body:'{}'})).status,401);assert.equal((await fetch(base+'/api/playlist/delete',{headers})).status,405);
 assert.equal((await post('/api/playlist/delete',input,{Origin:'https://unexpected.example'})).status,403);
 for(const body of [null,{}, {...input,playlistId:''},{...input,expectedName:null},{...input,expectedChanged:null},{...input,expectedSongIds:['']},{...input,expectedSongIds:'two'}])assert.equal((await post('/api/playlist/delete',body)).status,400);
 for(const patch of [{expectedName:'Renamed'},{expectedChanged:'2026-11-20T01:00:00Z'},{expectedSongIds:['two','two','one']},{expectedSongIds:['two','one']}])assert.equal((await post('/api/playlist/delete',{...input,...patch})).status,409);
 assert.equal((await post('/api/playlist/delete',{...input,playlistId:'foreign',expectedName:'Fremd',expectedSongIds:['keep'],owner:'tester'})).status,403);
 assert.equal((await post('/api/playlist/delete',{...input,playlistId:'missing'})).status,403);
 assert.equal(calls.filter(call=>call.url.pathname.includes('deletePlaylist')).length,0);
 assert.equal((await post('/api/playlist/delete',{...input,playlistId:'denied',expectedName:'Gesperrt',expectedSongIds:[]})).status,502);
 assert.equal((await post('/api/playlist/delete',{...input,playlistId:'denied',expectedName:'Gesperrt',expectedSongIds:[]})).status,502);
}));

test('Deletion serializes all local writes to the same playlist and accepts case-insensitive ownership',()=>fixture(async({post,calls})=>{
 const deletion=post('/api/playlist/delete',{playlistId:'slow',expectedName:'Langsam',expectedChanged:'',expectedSongIds:[]});
 // Wait for the authoritative ownership read, while its mock response is gated.
 while(!calls.some(call=>call.url.pathname.includes('getPlaylist')&&call.params.get('id')==='slow'))await new Promise(resolve=>setTimeout(resolve,1));
 const edit=await post('/api/playlist/edit',{playlistId:'slow',name:'Changed',comment:'',public:false});assert.equal(edit.status,409);
 const append=await post('/api/playlist/add',{playlistId:'slow',songIds:['one']});assert.equal(append.status,409);
 const duplicate=await post('/api/playlist/delete',{playlistId:'slow',expectedName:'Langsam',expectedChanged:'',expectedSongIds:[]});assert.equal(duplicate.status,409);
 assert.equal((await deletion).status,200);
 assert.equal(calls.filter(call=>call.url.pathname.includes('deletePlaylist')).length,1);
 assert.equal(calls.filter(call=>call.url.pathname.includes('updatePlaylist')).length,0);
}));


test('Reordering is an owner-checked permutation preserving duplicates and playlist metadata',()=>fixture(async({post,calls,base,headers})=>{
 const body={playlistId:'owned',expectedName:'Original',expectedChanged:'',expectedSongIds:['two','one','two'],order:[2,0,1],name:'Overwrite',public:false,u:'intruder'};
 const response=await post('/api/playlist/reorder',body);assert.equal(response.status,200);
 const write=calls.at(-1);assert.equal(write.method,'POST');assert.equal(write.url.pathname,'/rest/createPlaylist.view');assert.equal(write.url.search,'');
 assert.equal(write.params.get('playlistId'),'owned');assert.equal(write.params.get('u'),'tester');assert.deepEqual(write.params.getAll('songId'),['two','two','one']);
 for(const key of ['name','public','comment','songIndexToRemove'])assert.equal(write.params.has(key),false);
 const playlist=(await (await fetch(base+'/api/getPlaylist?id=owned',{headers})).json()).playlist;
 assert.equal(playlist.name,'Original');assert.equal(playlist.comment,'Alt');assert.equal(playlist.public,true);assert.deepEqual(playlist.entry.map(e=>e.id),['two','two','one']);
}));

test('Reordering rejects stale, foreign, malformed and cross-origin writes without replacing entries',()=>fixture(async({post,calls,base,headers})=>{
 const good={playlistId:'owned',expectedName:'Original',expectedChanged:'',expectedSongIds:['two','one','two'],order:[2,0,1]};
 assert.equal((await fetch(base+'/api/playlist/reorder',{method:'POST',body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/playlist/reorder',{headers})).status,405);
 assert.equal((await post('/api/playlist/reorder',good,{Origin:'https://elsewhere.example'})).status,403);
 for(const order of [[0,1],[0,0,2],[0,1,3],[0,1,-1],[0,1,1.5],['0',1,2],null])assert.equal((await post('/api/playlist/reorder',{...good,order})).status,400);
 assert.equal((await post('/api/playlist/reorder',{...good,expectedSongIds:['one','two','two']})).status,409);
 assert.equal((await post('/api/playlist/reorder',{...good,expectedChanged:'new'})).status,409);
 assert.equal((await post('/api/playlist/reorder',{...good,expectedName:'New name'})).status,409);
 assert.equal((await post('/api/playlist/reorder',{...good,playlistId:'foreign',expectedSongIds:['keep'],order:[0]})).status,403);
 assert.equal((await post('/api/playlist/reorder',{...good,order:[0,1,2]})).status,200);
 assert.equal(calls.filter(c=>c.url.pathname.includes('createPlaylist')).length,0);
}));

test('Reorder uses the shared playlist write lock and propagates an upstream refusal',()=>fixture(async({post,calls})=>{
 const slow={playlistId:'slow',expectedName:'Langsam',expectedChanged:'',expectedSongIds:[],order:[]};
 const pending=post('/api/playlist/reorder',slow);await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal((await post('/api/playlist/edit',{playlistId:'slow',name:'Blocked',comment:'',public:false})).status,409);assert.equal((await pending).status,200);
 const denied={playlistId:'denied',expectedName:'Gesperrt',expectedChanged:'',expectedSongIds:[],order:[]};
 // No-op does not invoke the upstream writer.
 assert.equal((await post('/api/playlist/reorder',denied)).status,200);
 assert.equal(calls.filter(c=>c.url.pathname.includes('createPlaylist')).length,0);
 assert.equal((await post('/api/playlist/reorder',{playlistId:'reorder-denied',expectedName:'Nicht umordnen',expectedChanged:'',expectedSongIds:['one','two'],order:[1,0]})).status,502);
 assert.equal(calls.filter(c=>c.url.pathname.includes('createPlaylist')).length,1);
}));
