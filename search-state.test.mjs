import test from 'node:test';
import assert from 'node:assert/strict';
import {readRoute, searchHash, searchView, readSearchView, SearchCache, matchingPlaylists, isSearchSongDetail, appendSearchSongs,newPageView,readNewPageView} from './public/search-state.js';

test('New-page history restores its own vertical and shelf positions with valid numeric coordinates',()=>{
 const view=newPageView({y:580,shelves:[0,247,531]});
 assert.deepEqual(readNewPageView({musikNewView:view}),view);
 assert.deepEqual(readNewPageView({musikNewView:{route:'search',y:580,shelves:[30]}}),{route:'new',y:0,shelves:[]});
 assert.deepEqual(newPageView({y:Infinity,shelves:[-1,'20',NaN,38]}),{route:'new',y:0,shelves:[0,0,0,38]});
});

test('Search URLs round-trip query punctuation and Unicode without changing collection routes', () => {
  const term = 'AC/DC? #1 + 100% & 東京 🎵';
  assert.deepEqual(readRoute(searchHash(term, 'artist')), {route: 'search', term, tab: 'artist'});
  assert.deepEqual(readRoute('#/album/a%2Fb?term=ignored'), {route: 'album/a%2Fb', term: '', tab: 'song',id:'a/b'});
  assert.equal(readRoute('#/bad%').route, 'not-found');
  assert.equal(readRoute('').route, 'home');
  assert.equal(readRoute('#/search?term=test&type=unknown').tab, 'song');
  assert.equal(searchHash(''), '#/search');
});

test('History coordinates are restored only for the same search and category', () => {
  const saved = {musikSearchView: searchView('music', 'album', {y: 531, songs: 284, tabs: 20, artists: 42})};
  assert.equal(readSearchView(saved, 'music', 'album').y, 531);
  assert.equal(readSearchView(saved, 'music', 'album').artists, 42);
  assert.equal(readSearchView(saved, 'other', 'album').artists, 0);
  assert.equal(readSearchView(saved, 'other', 'album').y, 0);
  assert.equal(readSearchView(saved, 'music', 'song').songs, 0);
  assert.deepEqual(searchView('x', 'song', {y: Infinity, songs: -10, tabs: '20'}), {term: 'x', tab: 'song', y: 0, songs: 0, tabs: 0, albums: 0, playlists: 0, artists: 0});
});

test('Search cache expires, evicts least recently used results and clears on reset', () => {
  let now = 0;
  const cache = new SearchCache({limit: 2, ttl: 60, now: () => now});
  cache.set('one', {song: [{id: 'one'}]});
  cache.set('two', {album: [{id: 'two'}]});
  assert.equal(cache.get('one').song[0].id, 'one');
  cache.set('three', {});
  assert.equal(cache.get('two'), null);
  now = 61;
  assert.equal(cache.get('one'), null);
  cache.set('new', {});
  cache.clear();
  assert.equal(cache.get('new'), null);
});

test('Playlist search matches reordered Unicode words without changing upstream objects or order', () => {
 const items=[{id:'one',name:'FÜR unterwegs – Café 東京',owner:'one'},{id:'two',name:'Café am Abend',owner:'two'},{id:'three',name:'Cafe\u0301 für unterwegs'}, {id:'missing'}];
 assert.deepEqual(matchingPlaylists(items,'UNTERWEGS fur cafe').map(item=>item.id),['one','three']);
 assert.deepEqual(matchingPlaylists(items,'東京').map(item=>item.id),['one']);
 assert.equal(matchingPlaylists(items,'café')[0],items[0]);
 assert.deepEqual(matchingPlaylists(items,'  '),[]);
 assert.equal(items[2].name,'Cafe\u0301 für unterwegs');
 const saved={musikSearchView:searchView('cafe','playlist',{playlists:310,albums:20})};
 assert.equal(readRoute(searchHash('cafe','playlist')).tab,'playlist');
 assert.equal(readSearchView(saved,'cafe','playlist').playlists,310);
 assert.equal(readSearchView(saved,'other','playlist').playlists,0);
 assert.equal(readSearchView(saved,'cafe','album').playlists,0);
});

test('Expanded search is bound to its query and pagination advances by received rather than unique count', () => {
 assert.equal(isSearchSongDetail({musikSearchDetail:{term:'AC/DC',kind:'song'}},'AC/DC'),true);
 assert.equal(isSearchSongDetail({musikSearchDetail:{term:'other',kind:'song'}},'AC/DC'),false);
 assert.equal(isSearchSongDetail({musikSearchDetail:{term:'',kind:'song'}},''),false);
 const cache={items:[],offset:0,hasMore:true};
 assert.equal(appendSearchSongs(cache,[{id:'a'},{id:'a'},{id:'b'}],3),2);
 assert.equal(cache.offset,3);assert.equal(cache.hasMore,true);
 assert.equal(appendSearchSongs(cache,[{id:'b'},{id:'c'},{id:'d'}],3),2);
 assert.deepEqual(cache.items.map(item=>item.id),['a','b','c','d']);assert.equal(cache.offset,6);
 appendSearchSongs(cache,[{id:'b'},{id:'c'},{id:'d'}],3);
 assert.equal(cache.hasMore,false);assert.equal(cache.offset,9);
 const short={items:[],offset:0};appendSearchSongs(short,[{id:'a'}],3);assert.equal(short.hasMore,false);
});
