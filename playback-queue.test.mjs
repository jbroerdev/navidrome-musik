import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaybackQueue} from './public/playback-queue.js';

const songs = Array.from({length: 6}, (_, id) => ({id}));
const makeQueue = () => new PlaybackQueue({random: () => 0.37});

test('Insert an album next in its original order with normal, shuffled and prepared queues', () => {
  const album = [{id:'album1'}, {id:'album2'}, {id:'album3'}];
  for (const shuffle of [false, true]) {
    const queue = makeQueue();
    queue.setShuffle(shuffle);
    queue.replace(songs);
    const playing = queue.items[queue.index];
    queue.addMany(album, {next:true});
    assert.equal(queue.items[queue.index], playing);
    assert.deepEqual(Array.from({length:3}, () => queue.items[queue.next()].id), album.map(item=>item.id));
    assert.equal(queue.items[queue.previous()].id, 'album2');
    assert.equal(queue.items[queue.next()].id, 'album3');
    assert.equal(queue.upcoming().length, 5);
  }
  const prepared = makeQueue();
  prepared.addMany(songs);
  prepared.addMany(album, {next:true});
  assert.equal(prepared.index, -1);
  assert.deepEqual(prepared.items.slice(0,3), album);
  const empty = makeQueue();
  empty.addMany(album, {next:true});
  assert.equal(empty.index, -1);
  assert.equal(empty.items[empty.next()].id, 'album1');
});

test('Shuffle visits every entry once and previous/next retrace actual playback', () => {
  const queue = makeQueue();
  queue.setShuffle(true);
  queue.replace(songs);
  const order = [queue.index];
  while (queue.upcoming().length) order.push(queue.next());
  assert.equal(new Set(order).size, songs.length);
  assert.equal(queue.next({automatic: true}), null);
  assert.equal(queue.previous(), order.at(-2));
  assert.equal(queue.next(), order.at(-1));
  assert.equal(queue.next(), null);
});

test('Repeat one affects automatic endings; manual next still advances', () => {
  const queue = makeQueue();
  queue.replace(songs);
  queue.repeat = 2;
  assert.equal(queue.next({automatic: true}), 0);
  assert.equal(queue.next(), 1);
  queue.repeat = 1;
  queue.select(songs.length - 1);
  assert.equal(queue.next({automatic: true}), 0);
  queue.setShuffle(true);
  const cycle = [queue.index];
  for (let i = 1; i < songs.length; i++) cycle.push(queue.next());
  assert.equal(new Set(cycle).size, songs.length);
  const last = queue.index;
  assert.notEqual(queue.next(), last);
});

test('Insert-next and removal keep the playing song and shuffled queue consistent', () => {
  const queue = makeQueue();
  queue.setShuffle(true);
  queue.replace(songs, 3);
  queue.insert({id: 'next'}, queue.index + 1, {next: true});
  assert.equal(queue.items[queue.upcoming()[0]].id, 'next');
  assert.equal(queue.items[queue.index].id, 3);
  queue.next();
  assert.equal(queue.items[queue.index].id, 'next');
  queue.remove(0);
  assert.equal(queue.items[queue.index].id, 'next');
  assert.equal(queue.items[queue.previous()].id, 3);
  assert.equal(queue.items[queue.next()].id, 'next');
  const upcoming = queue.upcoming().map(index => queue.items[index].id);
  assert.equal(new Set(upcoming).size, upcoming.length);
  assert.ok(!upcoming.includes(0));
});

test('Prepared queue starts correctly; clear removes playback preferences and history', () => {
  const queue = makeQueue();
  queue.addMany(songs);
  assert.equal(queue.upcoming().length, songs.length);
  assert.equal(queue.next(), 0);
  queue.next();
  queue.repeat = 2;
  queue.clear();
  assert.equal(queue.index, -1);
  assert.deepEqual(queue.upcoming(), []);
  assert.equal(queue.next(), null);
  assert.equal(queue.repeat, 0);
});

test('Clear upcoming preserves the current song, history and playback modes', () => {
  for (const shuffle of [false, true]) {
    const queue = makeQueue();
    queue.setShuffle(shuffle);
    queue.replace(songs);
    queue.next();
    const playing = queue.items[queue.index];
    const previous = queue.items[queue.history.at(-1)];
    queue.repeat = 2;
    queue.clearUpcoming();
    assert.equal(queue.items[queue.index], playing);
    assert.equal(queue.shuffle, shuffle);
    assert.equal(queue.repeat, 2);
    assert.deepEqual(queue.upcoming(), []);
    assert.equal(queue.items[queue.previous()], previous);
  }
  const prepared = makeQueue();
  prepared.addMany(songs);
  prepared.clearUpcoming();
  assert.deepEqual(prepared.items, []);
  assert.equal(prepared.index, -1);
});

test('Activating the current title from another view preserves shuffled queue and navigation history', () => {
 const queue=makeQueue();queue.replace(songs,2);queue.setShuffle(true);queue.next();queue.previous();queue.repeat=2;
 const before=JSON.stringify(queue),items=queue.items,index=queue.index,current=items[index];
 assert.deepEqual(queue.activate([{...current},{id:'elsewhere'}],0),{action:'toggle',index});
 assert.equal(queue.items,items);assert.equal(JSON.stringify(queue),before);
 // A duplicate occurrence is still the same currently loaded recording.
 assert.deepEqual(queue.activate([{...current},{...current}],1),{action:'toggle',index});
 assert.equal(JSON.stringify(queue),before);
});
test('Activating a different title replaces the source collection and rejects invalid entries', () => {
 const queue=makeQueue();queue.replace(songs,2);const next=[{id:'new'}, {id:'next'}, {id:'new'}];
 assert.deepEqual(queue.activate(next,1),{action:'play',index:1});
 assert.deepEqual(queue.items,next);assert.notEqual(queue.items,next);assert.deepEqual(queue.history,[]);
 const before=JSON.stringify(queue);for(const index of [-1,4,NaN,.5])assert.equal(queue.activate(next,index),null);
 assert.equal(JSON.stringify(queue),before);
});
