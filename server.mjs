import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';

const publicDir=new URL('./public/',import.meta.url);
const allowed=new Set(['getAlbumList2','getAlbum','getSong','getArtists','getArtist','getPlaylists','getPlaylist','getStarred2','search3','getLyricsBySongId','getLyrics','getRandomSongs']);
export function createApp({upstream='http://navidrome:4533',publicOrigin=process.env.PUBLIC_ORIGIN,allowedHosts=(process.env.ALLOWED_HOSTS||'localhost,127.0.0.1').split(',').map(s=>s.trim())}={}) {
 const sessions=new Map(),playlistWrites=new Set();
 const base=new URL(upstream.endsWith('/')?upstream:upstream+'/');
 function remote(endpoint,session,params={}){const u=new URL('rest/'+endpoint+'.view',base);for(const [key,value] of Object.entries({...params,u:session.user,t:session.token,s:session.salt,v:'1.16.1',c:'MusikWeb',f:'json'}))for(const item of Array.isArray(value)?value:[value])u.searchParams.append(key,String(item));return u;}
 async function sonic(endpoint,session,params,{post=false}={}){const target=remote(endpoint,session,params),options={signal:AbortSignal.timeout(20000),redirect:'error'};if(post){options.method='POST';options.headers={'Content-Type':'application/x-www-form-urlencoded'};options.body=target.searchParams.toString();target.search='';}const r=await fetch(target,options);if(!r.ok)throw Error('Navidrome antwortet mit HTTP '+r.status);const data=(await r.json())['subsonic-response'];if(!data||data.status!=='ok')throw Error(data?.error?.code===40?'Benutzername oder Passwort stimmt nicht.':data?.error?.message||'Ungültige Serverantwort.');return data;}
 return http.createServer(async(req,res)=>{
  const host=(req.headers.host||'').split(':')[0];
  if(!allowedHosts.includes(host)&&(!publicOrigin||req.headers.host!==new URL(publicOrigin).host)){res.writeHead(403);res.end('Ungültiger Host.');return;}
  const url=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const sid=req.headers.cookie?.match(/(?:^|;\s*)musik_session=([a-f0-9]+)/)?.[1];let session=sessions.get(sid);
  if(session&&Date.now()-session.created>12*3600000){sessions.delete(sid);session=null;}
  if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!==(publicOrigin||`http://${req.headers.host}`)){json(403,{error:'Ungültiger Ursprung.'});return;}
  try {
   if(url.pathname==='/navidrome'&&req.method==='GET'){res.writeHead(302,{Location:new URL('app/',base).href});res.end();return;}
   if(url.pathname==='/api/session'&&req.method==='GET'){json(200,{authenticated:!!session,user:session?.user,server:base.origin});return;}
   if(url.pathname==='/api/login'&&req.method==='POST'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){json(413,{error:'Anfrage zu groß.'});return;}}
    let input;try{input=JSON.parse(body);}catch{json(400,{error:'Ungültige Anmeldung.'});return;}
    if(typeof input.username!=='string'||typeof input.password!=='string'||!input.username||!input.password){json(400,{error:'Benutzername und Passwort eingeben.'});return;}
    const salt=randomBytes(20).toString('hex');const auth={user:input.username,token:createHash('md5').update(input.password+salt).digest('hex'),salt,created:Date.now()};input.password='';
    await sonic('ping',auth);if(sid)sessions.delete(sid);const id=randomBytes(32).toString('hex');sessions.set(id,auth);
    res.setHeader('Set-Cookie',`musik_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${publicOrigin?.startsWith('https:')?'; Secure':''}`);json(200,{user:auth.user});return;
   }
   if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(sid);res.setHeader('Set-Cookie','musik_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(200,{ok:true});return;}
   if(url.pathname==='/api/playlist'||url.pathname==='/api/playlist/add'||url.pathname==='/api/playlist/edit'||url.pathname==='/api/playlist/remove'||url.pathname==='/api/playlist/delete'||url.pathname==='/api/playlist/reorder'){
    if(!session){json(401,{error:'Bitte anmelden.'});return;}
    if(req.method!=='POST'){json(405,{error:'Nicht erlaubt.'});return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){json(413,{error:'Anfrage zu groß.'});return;}chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{json(400,{error:'Ungültige Anfrage.'});return;}
    const writeId=url.pathname==='/api/playlist'?null:typeof input?.playlistId==='string'?input.playlistId:null;
    if(writeId&&playlistWrites.has(writeId)){json(409,{error:'Die Playlist wird gerade geändert. Bitte erneut laden.'});return;}
    if(writeId)playlistWrites.add(writeId);
    try{
    if(url.pathname.endsWith('/reorder')){
     const id=input?.playlistId,expected=input?.expectedSongIds,order=input?.order;
     if(typeof id!=='string'||!id||id.length>256||typeof input.expectedName!=='string'||typeof input.expectedChanged!=='string'||!Array.isArray(expected)||expected.length>10000||expected.some(id=>typeof id!=='string'||!id||id.length>256)||!Array.isArray(order)||order.length!==expected.length||order.some(index=>!Number.isInteger(index)||index<0||index>=expected.length)||new Set(order).size!==order.length){json(400,{error:'Ungültige Titelreihenfolge.'});return;}
     const existing=(await sonic('getPlaylist',session,{id})).playlist;
     if(typeof existing?.owner!=='string'||existing.owner.toLocaleLowerCase()!==session.user.toLocaleLowerCase()){json(403,{error:'Nur eigene Playlists können umgeordnet werden.'});return;}
     const entries=existing.entry||[];
     if(existing.name!==input.expectedName||(existing.changed||'')!==input.expectedChanged||entries.length!==expected.length||entries.some((entry,index)=>entry.id!==expected[index])){json(409,{error:'Die Playlist wurde inzwischen geändert. Bitte erneut laden.'});return;}
     if(order.some((index,i)=>index!==i))await sonic('createPlaylist',session,{playlistId:id,songId:order.map(index=>entries[index].id)},{post:true});
     json(200,{ok:true,playlistId:id});return;
    }
    if(url.pathname.endsWith('/delete')){
     const id=input?.playlistId,expected=input?.expectedSongIds;
     if(typeof id!=='string'||!id||id.length>256||typeof input.expectedName!=='string'||typeof input.expectedChanged!=='string'||!Array.isArray(expected)||expected.length>10000||expected.some(id=>typeof id!=='string'||!id||id.length>256)){json(400,{error:'Ungültige Playlist.'});return;}
     const existing=(await sonic('getPlaylist',session,{id})).playlist;
     if(typeof existing?.owner!=='string'||existing.owner.toLocaleLowerCase()!==session.user.toLocaleLowerCase()){json(403,{error:'Nur eigene Playlists können gelöscht werden.'});return;}
     const entries=existing.entry||[];
     if(existing.name!==input.expectedName||(existing.changed||'')!==input.expectedChanged||entries.length!==expected.length||entries.some((entry,index)=>entry.id!==expected[index])){json(409,{error:'Die Playlist wurde inzwischen geändert. Bitte erneut laden.'});return;}
     await sonic('deletePlaylist',session,{id},{post:true});
     json(200,{ok:true,playlistId:id});return;
    }
    if(url.pathname.endsWith('/remove')){
     const indices=input?.indices,expected=input?.expectedSongIds,id=input?.playlistId;
     if(typeof id!=='string'||!id||id.length>256||!Array.isArray(expected)||expected.length>10000||expected.some(id=>typeof id!=='string'||!id||id.length>256)||!Array.isArray(indices)||!indices.length||indices.length>expected.length||indices.some(index=>!Number.isInteger(index)||index<0||index>=expected.length)||new Set(indices).size!==indices.length){json(400,{error:'Ungültige Titelauswahl.'});return;}
      const existing=(await sonic('getPlaylist',session,{id})).playlist;
      if(typeof existing?.owner!=='string'||existing.owner.toLocaleLowerCase()!==session.user.toLocaleLowerCase()){json(403,{error:'Nur eigene Playlists können bearbeitet werden.'});return;}
      const entries=existing.entry||[];
      if(entries.length!==expected.length||entries.some((entry,index)=>entry.id!==expected[index])){json(409,{error:'Die Playlist wurde inzwischen geändert. Bitte erneut laden.'});return;}
      await sonic('updatePlaylist',session,{playlistId:id,songIndexToRemove:[...indices].sort((a,b)=>b-a)},{post:true});
      json(200,{ok:true,playlistId:id,removed:indices.length});return;
    }
    if(url.pathname.endsWith('/edit')){
     if(typeof input?.playlistId!=='string'||!input.playlistId||input.playlistId.length>256||typeof input.name!=='string'||!input.name.trim()||input.name.length>255||typeof input.comment!=='string'||input.comment.length>2000||typeof input.public!=='boolean'){json(400,{error:'Ungültige Playlistangaben.'});return;}
     const existing=(await sonic('getPlaylist',session,{id:input.playlistId})).playlist;
     if(typeof existing?.owner!=='string'||existing.owner.toLocaleLowerCase()!==session.user.toLocaleLowerCase()){json(403,{error:'Nur eigene Playlists können bearbeitet werden.'});return;}
     await sonic('updatePlaylist',session,{playlistId:input.playlistId,name:input.name.trim(),comment:input.comment,public:input.public},{post:true});
     json(200,{ok:true,playlistId:input.playlistId});return;
    }
    const ids=input?.songIds,append=url.pathname.endsWith('/add');
    if(!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string'||!id||id.length>256)||(append&&!ids.length)){json(400,{error:'Ungültige Titelauswahl.'});return;}
    if(append){
     if(typeof input.playlistId!=='string'||!input.playlistId||input.playlistId.length>256){json(400,{error:'Ungültige Playlist.'});return;}
     await sonic('updatePlaylist',session,{playlistId:input.playlistId,songIdToAdd:ids},{post:true});
     json(200,{ok:true,playlistId:input.playlistId});return;
    }
    if(typeof input.name!=='string'||!input.name.trim()||input.name.length>255||typeof input.comment!=='string'||input.comment.length>2000||typeof input.public!=='boolean'){json(400,{error:'Ungültige Playlistangaben.'});return;}
    const created=await sonic('createPlaylist',session,{name:input.name.trim(),songId:ids},{post:true}),playlist=created.playlist;
    // Creation and metadata update are separate Subsonic operations. If the
    // second fails, acknowledge creation so a retry cannot create a duplicate.
    if(!playlist?.id){json(201,{ok:true,warning:'Playlist angelegt. Die Angaben konnten nicht aktualisiert werden; bitte in Navidrome prüfen.'});return;}
    try{await sonic('updatePlaylist',session,{playlistId:playlist.id,comment:input.comment,public:input.public},{post:true});playlist.comment=input.comment;playlist.public=input.public;json(201,{ok:true,playlist});}
    catch{json(201,{ok:true,playlist,warning:'Playlist angelegt. Beschreibung oder Sichtbarkeit konnten nicht gespeichert werden; bitte in Navidrome prüfen.'});}
    return;
    }finally{if(writeId)playlistWrites.delete(writeId);}
   }
   if(url.pathname==='/api/scrobble'){
    if(!session){json(401,{error:'Bitte anmelden.'});return;}
    if(req.method!=='POST'){json(405,{error:'Nicht erlaubt.'});return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){json(413,{error:'Anfrage zu groß.'});return;}}
    let input;try{input=JSON.parse(body);}catch{json(400,{error:'Ungültige Anfrage.'});return;}
    if(typeof input?.id!=='string'||!input.id||input.id.length>256||typeof input.playId!=='string'||!input.playId||input.playId.length>128||typeof input.submission!=='boolean'||!Number.isSafeInteger(input.time)||input.time<0||input.time>Date.now()+300000){json(400,{error:'Ungültige Wiedergabemeldung.'});return;}
    const send=()=>sonic('scrobble',session,{id:input.id,time:input.time,submission:input.submission},{post:true});
    if(input.submission){
     const attempts=session.scrobbleAttempts??=new Map(),previous=attempts.get(input.playId);
     if(previous){if(previous.id!==input.id){json(409,{error:'Wiedergabemeldung widerspricht dem Titel.'});return;}await previous.result;json(200,{ok:true,duplicate:true});return;}
     // Keep failed attempts too: an ambiguous timeout must not count twice.
     const attempt={id:input.id,result:send()};attempts.set(input.playId,attempt);if(attempts.size>1000)attempts.delete(attempts.keys().next().value);
     await attempt.result;
    }else await send();
    json(200,{ok:true});return;
   }
   if(url.pathname==='/api/favorite'){
    if(!session){json(401,{error:'Bitte anmelden.'});return;}
    if(req.method!=='POST'){json(405,{error:'Nicht erlaubt.'});return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){json(413,{error:'Anfrage zu groß.'});return;}}
    let input;try{input=JSON.parse(body);}catch{json(400,{error:'Ungültige Anfrage.'});return;}
    if(!input||typeof input.id!=='string'||!input.id||input.id.length>256||!['song','album','artist'].includes(input.kind)||typeof input.starred!=='boolean'){json(400,{error:'Ungültiger Favorit.'});return;}
    const key={song:'id',album:'albumId',artist:'artistId'}[input.kind];
    await sonic(input.starred?'star':'unstar',session,{[key]:input.id});json(200,{ok:true,starred:input.starred});return;
   }
   if(url.pathname.startsWith('/api/')){
    if(!session){json(401,{error:'Bitte anmelden.'});return;}
    if(req.method!=='GET'){json(405,{error:'Nicht erlaubt.'});return;}
    const endpoint=url.pathname.slice(5);
    const params=Object.fromEntries([...url.searchParams].filter(([k])=>!['u','p','t','s','v','c','f'].includes(k)));
    if(endpoint==='cover'||endpoint==='stream'){
     if(!params.id){json(400,{error:'ID fehlt.'});return;}
     const r=await fetch(remote(endpoint==='cover'?'getCoverArt':'stream',session,params),{headers:req.headers.range?{Range:req.headers.range}:{},signal:AbortSignal.timeout(60000),redirect:'error'});
     res.statusCode=r.status;for(const h of ['content-type','content-length','content-range','accept-ranges'])if(r.headers.has(h))res.setHeader(h,r.headers.get(h));
     if(r.body){const stream=Readable.fromWeb(r.body);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}else res.end();return;
    }
    if(!allowed.has(endpoint)){json(404,{error:'Unbekannte Schnittstelle.'});return;}
    json(200,await sonic(endpoint,session,params));return;
   }
   const files={'/':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/playback-queue.js':['playback-queue.js','text/javascript'],'/ambient-backdrop.js':['ambient-backdrop.js','text/javascript'],'/search-state.js':['search-state.js','text/javascript'],'/collection-metadata.js':['collection-metadata.js','text/javascript'],'/playlist-actions.js':['playlist-actions.js','text/javascript'],'/table-selection.js':['table-selection.js','text/javascript'],'/playlist-reorder.js':['playlist-reorder.js','text/javascript'],'/player-motion.js':['player-motion.js','text/javascript'],'/song-page.js':['song-page.js','text/javascript']};
   const file=files[url.pathname];if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Nicht gefunden');return;}
   const bytes=await readFile(new URL(file[0],publicDir));res.setHeader('Content-Type',file[1]);res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){if(!res.headersSent)json(502,{error:error.name==='TimeoutError'?'Navidrome antwortet nicht rechtzeitig.':error.message==='fetch failed'?'Navidrome ist gerade nicht erreichbar.':error.message});else res.destroy();}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||4173);createApp({upstream:process.env.NAVIDROME_URL}).listen(port,process.env.LISTEN_HOST||'127.0.0.1',()=>console.log(`Musik bereit: http://127.0.0.1:${port}`));}
