import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseDateLabel, collectionDurationLabel, playlistUpdatedLabel, playlistCardOrder, playlistCardOwner,readAlbumIndex} from './public/collection-metadata.js';

test('Album indexing reads beyond the first page and retains server order without duplicate albums',async()=>{
 const albums=Array.from({length:1101},(_,i)=>({id:'album-'+i,name:'Album '+i})),calls=[];
 const result=await readAlbumIndex(async({size,offset})=>{calls.push({size,offset});return albums.slice(offset,offset+size);});
 assert.deepEqual(calls,[{size:500,offset:0},{size:500,offset:500},{size:500,offset:1000}]);
 assert.deepEqual(result,albums);
 assert.equal([...result].reverse()[0].id,'album-1100');
 let requests=0;
 const repeated=await readAlbumIndex(async()=>{requests++;return albums.slice(0,500);});
 assert.equal(requests,2);assert.equal(repeated.length,500);
});

test('Stale or failed album indexing never returns a partial library',async()=>{
 let current=true,requests=0;
 assert.equal(await readAlbumIndex(async()=>{requests++;current=false;return [{id:'old-account'}];},()=>current),null);
 assert.equal(requests,1);
 await assert.rejects(readAlbumIndex(async()=>{throw Error('Unavailable');}),/Unavailable/);
 await assert.rejects(readAlbumIndex(async()=>({album:[]})),/Ungültige Albumliste/);
});

test('Release dates preserve server precision and prefer the original release', () => {
  assert.equal(releaseDateLabel({originalReleaseDate:{year:1979,month:1,day:16},releaseDate:{year:2014},year:2014}), '16. Januar 1979');
  assert.equal(releaseDateLabel({releaseDate:{year:2024,month:3}}), 'März 2024');
  assert.equal(releaseDateLabel({originalReleaseDate:{year:2024,month:0,day:0}}), '2024');
  assert.equal(releaseDateLabel({year:1984}), '1984');
  assert.equal(releaseDateLabel({}), '');
});

test('Malformed dates cannot silently roll into a different month or century', () => {
  assert.equal(releaseDateLabel({originalReleaseDate:{year:2023,month:2,day:29},releaseDate:{year:2024,month:2,day:29}}), '29. Februar 2024');
  assert.equal(releaseDateLabel({originalReleaseDate:{year:2024,month:13,day:1},year:1984}), '1984');
  assert.equal(releaseDateLabel({originalReleaseDate:{year:0},year:1984}), '1984');
  assert.equal(releaseDateLabel({originalReleaseDate:{year:99}}), '99');
});

test('Collection duration uses elapsed minutes, then hours and remaining minutes', () => {
  assert.equal(collectionDurationLabel(1412), '23 Minuten');
  assert.equal(collectionDurationLabel(221), '3 Minuten');
  assert.equal(collectionDurationLabel(60), '1 Minute');
  assert.equal(collectionDurationLabel(3600), '1 Stunde');
  assert.equal(collectionDurationLabel(17280), '4 Stunden 48 Minuten');
  assert.equal(collectionDurationLabel(-10), '0 Minuten');
});


test('Playlist update labels use local civil days across midnight and DST',()=>{
 const options={now:new Date('2026-11-19T23:30:00Z'),timeZone:'Europe/Berlin'};
 assert.equal(playlistUpdatedLabel('2026-11-19T23:15:00Z',options),'Heute aktualisiert');
 assert.equal(playlistUpdatedLabel('2026-11-19T12:00:00Z',options),'Gestern aktualisiert');
 assert.equal(playlistUpdatedLabel('2026-11-18T12:00:00Z',options),'Mittwoch aktualisiert');
 assert.equal(playlistUpdatedLabel('2026-10-24T23:30:00+02:00',{now:new Date('2026-10-26T00:30:00+01:00'),timeZone:'Europe/Berlin'}),'Samstag aktualisiert');
});
test('Missing, stale, future and invalid update dates never invent a label',()=>{
 const options={now:new Date('2026-11-20T12:00:00Z'),timeZone:'Europe/Berlin'};
 for(const value of [undefined,null,'','2026','2026-02-30T12:00:00Z','2026-13-01T12:00:00Z','2026-11-20T99:00:00Z','2026-11-13T12:00:00Z','2026-11-21T12:00:00Z'])assert.equal(playlistUpdatedLabel(value,options),'');
 assert.equal(playlistUpdatedLabel('2026-11-20T12:00:00Z',{...options,timeZone:'invalid/zone'}),'');
 assert.equal(playlistUpdatedLabel('2026-11-20T12:00:00Z',{now:new Date('invalid')}),'');
});


test('Playlist cards sort alphabetically with number-leading names last without reordering the sidebar source',()=>{
 const items=[{id:'n2',name:'20 Hits'},{id:'lofi',name:'Lofi Girl'},{id:'n1',name:'2 Hits'},{id:'fri',name:'freitag'},{id:'de',name:'Deutsche Lieder'},{id:'quoted',name:'’60s Hits'}],original=items.map(item=>({...item}));
 const favorites={id:'fav',name:'Lieblingstitel',isFavorites:true};
 assert.deepEqual(playlistCardOrder(items,favorites).map(item=>item.id),['de','fav','fri','lofi','n1','n2','quoted']);
 assert.deepEqual(items,original);assert.equal(favorites.name,'Lieblingstitel');assert.equal(playlistCardOrder([],favorites)[0],favorites);
});
test('Playlist card subtitles omit the signed-in owner but retain foreign and service attribution',()=>{
 assert.equal(playlistCardOwner({owner:'Admin'},'admin'),'');assert.equal(playlistCardOwner({owner:'Other'},'admin'),'Other');
 assert.equal(playlistCardOwner({owner:'musik',isFavorites:true},'musik'),'musik');assert.equal(playlistCardOwner({},'admin'),'');
 assert.equal(playlistCardOwner({owner:'Admin'},null),'Admin');
});
