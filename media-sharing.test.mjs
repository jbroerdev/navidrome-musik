import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaShareUrl,MediaSharing} from './public/playlist-actions.js';

test('Media links point to the selected item and preserve IDs while removing transient query and focus state',()=>{
 for(const kind of ['song','album','artist','playlist']){
  const id='a/b %2F? #ä';const url=new URL(mediaShareUrl('https://music.example/ui/?session=private#/album/old?i=wrong',kind,id));
  assert.equal(url.pathname,'/ui/');assert.equal(url.search,'');assert.equal(url.hash,'#/'+kind+'/'+encodeURIComponent(id));
  assert.equal(decodeURIComponent(url.hash.slice(kind.length+3)),id);
 }
 assert.equal(mediaShareUrl('https://user:secret@example.com/ui/?token=secret#/new','song','s'),'https://example.com/ui/#/song/s');
 assert.equal(mediaShareUrl('http://localhost:4173/#/playlist/x','favorites'),'http://localhost:4173/#/favorites');
 for(const args of [['https://example.com','unknown','a'],['https://example.com','song',''],['file:///tmp','song','a']])assert.throws(()=>mediaShareUrl(...args),TypeError);
});

test('Copy reports success only after the clipboard succeeds and resolves the current application base',async()=>{
 let base='https://first.example/ui/',copied;const service=new MediaSharing({navigator:{clipboard:{writeText:async value=>{copied=value;}}},getBase:()=>base});
 base='https://second.example/ui/#/new';const result=await service.copy('album',{id:'a/b'});
 assert.equal(copied,'https://second.example/ui/#/album/a%2Fb');assert.equal(result.action,'copied');
 service.navigator.clipboard.writeText=async()=>{throw Error('denied');};await assert.rejects(service.copy('song',{id:'s'}),/denied/);
});

test('Native sharing sends only title and canonical URL; cancellation never copies or retries a share',async()=>{
 const calls=[],copied=[];const navigator={share:async data=>calls.push(data),canShare:()=>true,clipboard:{writeText:async value=>copied.push(value)}};
 const service=new MediaSharing({navigator,getBase:()=> 'https://example.com/#/playlist/from'});
 assert.equal(service.nativeAvailable,true);assert.equal((await service.share('song',{id:'s',title:'Title',password:'never transmit',token:'never transmit'})).action,'shared');
 assert.deepEqual(calls,[{title:'Title',url:'https://example.com/#/song/s'}]);
 navigator.share=async()=>{throw Object.assign(Error('closed'),{name:'AbortError'});};assert.equal((await service.share('song',{id:'s'})).action,'cancelled');assert.deepEqual(copied,[]);
 navigator.share=async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});};await assert.rejects(service.share('song',{id:'s'}),/denied/);assert.deepEqual(copied,[]);
});

test('Browsers without a supported native share operation copy the same canonical target',async()=>{
 const copied=[];const navigator={clipboard:{writeText:async value=>copied.push(value)}};const service=new MediaSharing({navigator,getBase:()=> 'http://localhost:4180/#/new'});
 assert.equal(service.nativeAvailable,false);assert.equal((await service.share('artist',{id:'ar',name:'Artist'})).action,'copied');
 navigator.share=async()=>{throw Error('unsupported data must not be submitted');};navigator.canShare=()=>false;
 assert.equal((await service.share('playlist',{id:'p'})).action,'copied');assert.deepEqual(copied,['http://localhost:4180/#/artist/ar','http://localhost:4180/#/playlist/p']);
});
