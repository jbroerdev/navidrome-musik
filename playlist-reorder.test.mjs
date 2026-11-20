import test from 'node:test';
import assert from 'node:assert/strict';
import {movePlaylistEntries} from './public/playlist-reorder.js';

test('Moving entries uses original gaps and preserves the order of disjoint selections',()=>{
 assert.deepEqual(movePlaylistEntries(5,[1],5),[0,2,3,4,1]);
 assert.deepEqual(movePlaylistEntries(5,[4],0),[4,0,1,2,3]);
 assert.deepEqual(movePlaylistEntries(5,[3,1],5),[0,2,4,1,3]);
 assert.deepEqual(movePlaylistEntries(5,[1,3],2),[0,1,3,2,4]);
 assert.deepEqual(movePlaylistEntries(5,[1,2],2),[0,1,2,3,4]);
 assert.deepEqual(movePlaylistEntries(3,[0,1,2],3),[0,1,2]);
});

test('Repeated songs remain separate positions and invalid moves cannot lose entries',()=>{
 const songs=['same','middle','same','end'],indices=[2];
 assert.deepEqual(movePlaylistEntries(4,indices,0).map(i=>songs[i]),['same','same','middle','end']);
 assert.deepEqual(indices,[2]);assert.deepEqual(songs,['same','middle','same','end']);
 for(const [length,selection,gap] of [[4,[0,0],1],[4,[-1],0],[4,[4],0],[4,[1],5],[4,[],0],[4,[1.5],0]])assert.throws(()=>movePlaylistEntries(length,selection,gap));
});
