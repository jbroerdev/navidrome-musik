import test from 'node:test';
import assert from 'node:assert/strict';
import {albumCoverTone} from './public/ambient-backdrop.js';

test('Album color preserves uniform covers and chooses a contrasting text mode', () => {
  assert.deepEqual(albumCoverTone(new Uint8ClampedArray([178, 119, 61, 255]), 1), {color: [178, 119, 61], light: false});
  assert.equal(albumCoverTone(new Uint8ClampedArray([245, 245, 245, 255]), 1).light, true);
  assert.equal(albumCoverTone(new Uint8ClampedArray([10, 10, 10, 255]), 1).light, false);
});

test('Transparent pixels do not turn album backgrounds black; empty covers have a neutral fallback', () => {
  assert.deepEqual(albumCoverTone(new Uint8ClampedArray([0, 0, 0, 0, 160, 80, 50, 255]), 2).color, [160, 80, 50]);
  assert.deepEqual(albumCoverTone(new Uint8ClampedArray(16), 2).color, [86, 86, 91]);
});

test('Playlist vibrant colors match observed Apple dark navy and ochre surfaces without channel overflow',async()=>{
 const {playlistPalette}=await import('./public/ambient-backdrop.js');
 assert.deepEqual(playlistPalette({color:[13,20,36],light:false}),{secondary:'rgb(174 181 202)',sidebar:[28,31,38]});
 assert.equal(playlistPalette({color:[165,131,11],light:false}).secondary,'rgb(255 255 177)');
 assert.deepEqual(playlistPalette({color:[245,245,245],light:true}),{secondary:'rgba(0,0,0,.56)',sidebar:[245,245,245]});
});
