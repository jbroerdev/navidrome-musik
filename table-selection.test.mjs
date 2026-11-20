import test from 'node:test';
import assert from 'node:assert/strict';
import {RowSelection} from './public/table-selection.js';

test('Table selection extends and contracts a fixed range, then replaces it on an ordinary click',()=>{
 const selection=new RowSelection(),songs=Array.from({length:8},(_,i)=>({id:String(i)}));
 selection.select(1);selection.select(5,{extend:true});
 assert.deepEqual(selection.songs(songs).map(s=>s.id),['1','2','3','4','5']);
 selection.select(3,{extend:true});assert.deepEqual(selection.songs(songs).map(s=>s.id),['1','2','3']);
 selection.select(0,{extend:true});assert.deepEqual(selection.songs(songs).map(s=>s.id),['0','1']);
 selection.select(6);assert.deepEqual(selection.songs(songs).map(s=>s.id),['6']);
});

test('Disjoint selection uses table order, preserves duplicate entries and never mutates the collection',()=>{
 const selection=new RowSelection(),songs=[{id:'same'},{id:'middle'},{id:'same'},{id:'end'}];
 selection.select(3);selection.select(0,{toggle:true});selection.select(2,{toggle:true});
 assert.deepEqual(selection.songs(songs),[songs[0],songs[2],songs[3]]);
 selection.select(3,{toggle:true});assert.deepEqual(selection.songs(songs),[songs[0],songs[2]]);
 assert.deepEqual(songs.map(s=>s.id),['same','middle','same','end']);
});

test('Select all includes loaded collection metadata beyond rendered rows and a new view starts empty',()=>{
 const selection=new RowSelection(),songs=Array.from({length:230},(_,i)=>({id:String(i)}));
 selection.all(songs.length);assert.equal(selection.songs(songs).length,230);
 assert.equal(selection.songs(songs)[229],songs[229]);
 assert.deepEqual(new RowSelection().songs(songs),[]);
 selection.all(0);assert.deepEqual(selection.songs(songs),[]);
});
