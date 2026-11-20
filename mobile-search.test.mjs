import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileSearchInteraction} from './public/search-state.js';
test('mobile draft can be cancelled without changing committed results',()=>{
 const state=new MobileSearchInteraction();const committed={term:'Luc',results:['a','b']};
 state.focus('Luc',committed.term);assert.equal(state.preview,false);state.edit();assert.equal(state.preview,true);
 assert.equal(state.cancel(),'');assert.equal(state.active,false);assert.equal(state.preview,false);assert.deepEqual(committed,{term:'Luc',results:['a','b']});
 state.focus('',committed.term);assert.equal(state.preview,true);state.submit();assert.equal(state.active,true);assert.equal(state.preview,false);
});
test('recent keyboard selection clamps and draft transitions clear selection',()=>{
 const state=new MobileSearchInteraction();state.focus('','');assert.equal(state.move(-1,2),-1);assert.equal(state.move(1,2),0);assert.equal(state.move(1,2),1);assert.equal(state.move(1,2),1);
 state.edit();assert.equal(state.index,-1);assert.equal(state.move(1,0),-1);state.move(1,2);state.reset();assert.deepEqual({...state},{active:false,preview:false,index:-1});
});
