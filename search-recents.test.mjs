import test from 'node:test';
import assert from 'node:assert/strict';
import {RecentSearches} from './public/search-state.js';
const storage=()=>{const values=new Map();return{values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
test('Recent search destinations persist in recency order and keep different object kinds with the same ID',()=>{
 const store=storage(),history=new RecentSearches(store,{limit:3});history.setScope('https://music.example/','Admin');
 history.remember('artist',{id:'a/b%2F',name:'A & B',coverArt:'cover',password:'never saved'});
 history.remember('album',{id:'a/b%2F',name:'Album'});history.remember('playlist',{id:'p',name:'One'});
 history.remember('artist',{id:'a/b%2F',name:'Updated'});
 assert.deepEqual(history.list().map(item=>[item.kind,item.name]),[['artist','Updated'],['playlist','One'],['album','Album']]);
 const saved=[...store.values.values()][0];assert.ok(!saved.includes('password'));assert.ok(!saved.includes('never saved'));
 const restored=new RecentSearches(store,{limit:3});restored.setScope('https://music.example','admin');assert.deepEqual(restored.list(),history.list());
 history.remember('album',{id:'last',name:'Last'});assert.equal(history.list().length,3);assert.ok(!history.list().some(item=>item.name==='Album'));
 const copy=history.list();copy[0].name='mutated';assert.equal(history.list()[0].name,'Last');
});
test('Recent searches are isolated by server and account; clearing never removes another account history',()=>{
 const store=storage(),history=new RecentSearches(store);history.setScope('https://user:secret@one.example/music/?token=private','a');history.remember('artist',{id:'a',name:'Private A'});
 assert.ok(![...store.values.keys()][0].includes('secret'));assert.ok(![...store.values.keys()][0].includes('private'));
 history.setScope('https://one.example/music/','b');assert.deepEqual(history.list(),[]);history.remember('album',{id:'b',name:'Private B'});history.clear();
 history.setScope('https://one.example/music/','a');assert.equal(history.list()[0].name,'Private A');history.setScope('https://two.example/music/','a');assert.deepEqual(history.list(),[]);
 history.setScope(null,null);history.remember('artist',{id:'x',name:'No session'});assert.deepEqual(history.list(),[]);
});
test('Broken or unavailable browser storage and malformed records do not break search',()=>{
 const store=storage(),history=new RecentSearches(store);history.setScope('https://one.example','a');store.setItem(history.key,'not json');history.setScope('https://one.example','a');assert.deepEqual(history.list(),[]);
 store.setItem(history.key,JSON.stringify({version:1,entries:[null,{kind:'__proto__',id:'bad',name:'bad'},{kind:'artist',id:'',name:'bad'},{kind:'artist',id:'ok',name:'<Artist>'},{kind:'artist',id:'ok',name:'Duplicate'}]}));
 history.setScope('https://one.example','a');assert.deepEqual(history.list(),[{kind:'artist',id:'ok',name:'<Artist>'}]);
 const unavailable=new RecentSearches({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}});unavailable.setScope('https://one.example','a');unavailable.remember('artist',{id:'ok',name:'Memory only'});assert.equal(unavailable.list()[0].name,'Memory only');unavailable.clear();assert.deepEqual(unavailable.list(),[]);
});

test('Deleting a recent playlist removes only its own account destination and preserves identical album ids',()=>{
 const store=storage(),history=new RecentSearches(store);history.setScope('https://music.example','a');history.remember('playlist',{id:'p',name:'Remove'});history.remember('album',{id:'p',name:'Keep'});
 history.setScope('https://music.example','b');history.remember('playlist',{id:'p',name:'Other account'});
 history.setScope('https://music.example','a');history.remove('playlist','p');assert.deepEqual(history.list().map(item=>item.kind),['album']);
 const restored=new RecentSearches(store);restored.setScope('https://music.example','a');assert.deepEqual(restored.list().map(item=>item.kind),['album']);
 history.setScope('https://music.example','b');assert.equal(history.list()[0].name,'Other account');
});
