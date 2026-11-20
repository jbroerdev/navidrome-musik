import test from 'node:test';
import assert from 'node:assert/strict';
import {contextMenuPlacement} from './public/playlist-actions.js';

test('Context menus reproduce three measured native trigger placements',()=>{
 const width=206.09375;
 // Full player: native bounds (485,167), 384px high.
 assert.deepEqual(contextMenuPlacement({x:470.515625,y:537.40625,width:28,height:28},width,384,1187,827),{left:485,top:167});
 // Table row: both directions fit, but the original still chooses above.
 assert.deepEqual(contextMenuPlacement({x:1101,y:399,width:28,height:28},width,384,1187,827),{left:908,top:29});
 // Top toolbar: not enough space above; the original opens below.
 assert.deepEqual(contextMenuPlacement({x:1145,y:11,width:30,height:30},width,320,1187,827),{left:953,top:26});
});

test('Explicit context points stay anchored and constrained when neither side fits',()=>{
 const anchor={x:100,y:100,width:20,height:20};
 assert.deepEqual(contextMenuPlacement(anchor,200,100,1000,800,{x:700,y:500}),{left:700,top:400});
 assert.deepEqual(contextMenuPlacement(anchor,200,500,1000,600,{x:2,y:350}),{left:8,top:92});
 assert.deepEqual(anchor,{x:100,y:100,width:20,height:20});
});
