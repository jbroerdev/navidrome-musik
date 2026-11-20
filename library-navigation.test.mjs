import test from 'node:test';
import assert from 'node:assert/strict';
import {LibraryNavigation} from './public/search-state.js';

const storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('Library visibility survives reload and stays isolated by server and account',()=>{
 const disk=storage(),nav=new LibraryNavigation(disk);
 nav.setScope('https://music.example/navidrome/','Alice');nav.setVisible('artists',false);
 const reloaded=new LibraryNavigation(disk);reloaded.setScope('https://music.example/navidrome','alice');
 assert.equal(reloaded.visible('artists'),false);assert.equal(reloaded.visible('albums'),true);
 reloaded.setScope('https://music.example/navidrome','bob');assert.equal(reloaded.visible('artists'),true);
 reloaded.setScope('https://other.example/navidrome','alice');assert.equal(reloaded.visible('artists'),true);
 reloaded.setScope(null,null);assert.equal(reloaded.visible('artists'),true);reloaded.setVisible('songs',false);assert.equal(reloaded.visible('songs'),true);
 nav.setVisible('artists',true);assert.equal(nav.visible('artists'),true);
});
test('Visibility settings validate imported data and remain editable when storage is unavailable',()=>{
 const disk=storage(),nav=new LibraryNavigation(disk);nav.setScope('https://music.example','qa');
 disk.setItem(nav.key,JSON.stringify({version:1,hidden:['artists','__proto__','home',null,'artists']}));nav.setScope('https://music.example','qa');
 assert.equal(nav.visible('artists'),false);assert.equal(nav.visible('home'),true);nav.setVisible('home',false);assert.equal(nav.visible('home'),true);
 for(const route of ['recent','artists','albums','songs'])nav.setVisible(route,false);
 for(const route of ['recent','artists','albums','songs'])assert.equal(nav.visible(route),false);
 for(const route of ['recent','artists','albums','songs'])nav.setVisible(route,true);
 assert.deepEqual(JSON.parse(disk.getItem(nav.key)).hidden,[]);
 disk.setItem(nav.key,'broken');nav.setScope('https://music.example','qa');assert.equal(nav.visible('artists'),true);
 const unavailable=new LibraryNavigation({getItem(){throw Error('Denied');},setItem(){throw Error('Denied');}});
 unavailable.setScope('https://music.example','qa');unavailable.setVisible('artists',false);assert.equal(unavailable.visible('artists'),false);
});
