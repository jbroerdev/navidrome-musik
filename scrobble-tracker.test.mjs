import test from 'node:test';
import assert from 'node:assert/strict';
import {ScrobbleTracker} from './public/playback-queue.js';
function fixture(){let clock=0,ids=0;const reports=[];const tracker=new ScrobbleTracker({report:entry=>reports.push(entry),now:()=>clock,wall:()=>1700000000000+clock,makeId:()=>String(++ids)});return {tracker,reports,advance:seconds=>{clock+=seconds*1000;}};}
test('Listening reports start only with actual playback and submit once after the threshold',()=>{
 const {tracker,reports,advance}=fixture();tracker.start({id:'track',duration:100});advance(50);tracker.sample();assert.equal(reports.length,0);
 tracker.resume();advance(49);tracker.sample();assert.equal(reports.length,1);assert.equal(reports[0].submission,false);advance(1);tracker.sample();
 assert.equal(reports.length,2);assert.equal(reports[1].submission,true);assert.equal(reports[1].time,reports[0].time);advance(100);tracker.sample();tracker.finish();assert.equal(reports.filter(r=>r.submission).length,1);
});
test('Pauses, buffering and seeking gaps do not count as listened time',()=>{
 const {tracker,reports,advance}=fixture();tracker.start({id:'track',duration:60});tracker.resume();advance(10);tracker.pause();advance(300);tracker.sample();assert.equal(tracker.listened,10);
 tracker.resume();advance(19);tracker.sample();assert.equal(reports.filter(r=>r.submission).length,0);advance(1);tracker.pause();assert.equal(reports.filter(r=>r.submission).length,1);
});
test('Repeat visits get distinct IDs; resetting and short tracks cannot create phantom submissions',()=>{
 const {tracker,reports,advance}=fixture();tracker.start({id:'same',duration:60});tracker.resume();advance(30);tracker.finish();tracker.start({id:'same',duration:60});tracker.resume();advance(30);tracker.finish();
 assert.deepEqual(reports.filter(r=>r.submission).map(r=>r.playId),['1','2']);tracker.start({id:'short',duration:15});tracker.resume();advance(15);tracker.finish();assert.equal(reports.filter(r=>r.submission).length,2);
 tracker.start({id:'reset',duration:60});tracker.resume();advance(20);tracker.reset();advance(100);tracker.sample();assert.equal(reports.filter(r=>r.submission).length,2);
});
test('Long songs submit at four minutes and unknown duration waits for real metadata',()=>{
 const {tracker,reports,advance}=fixture();tracker.start({id:'long',duration:1000});tracker.resume();advance(239);tracker.sample();assert.equal(reports.filter(r=>r.submission).length,0);advance(1);tracker.sample();assert.equal(reports.filter(r=>r.submission).length,1);
 tracker.start({id:'unknown'});tracker.resume();advance(45);tracker.sample();assert.equal(reports.filter(r=>r.submission).length,1);tracker.sample(60);assert.equal(reports.filter(r=>r.submission).length,2);
});
