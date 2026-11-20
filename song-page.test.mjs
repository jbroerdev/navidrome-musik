import test from 'node:test';
import assert from 'node:assert/strict';
import {songArtists,songCredits,songLyrics,songSubtitle,renderSongPage,songAlbumHash,renderSearchSongMain,albumSongHasByline,playerMetadata} from './public/song-page.js';
import {readRoute} from './public/search-state.js';

test('New song links select the exact album entry and preserve reserved identifier characters',()=>{
 const song={id:'song/100%?# &東京',albumId:'album/%2F a b'};
 assert.deepEqual(readRoute(songAlbumHash(song)),{route:'album/album%2F%252F%20a%20b',term:'',tab:'song',id:song.albumId,focusSong:song.id});
 assert.equal(readRoute(songAlbumHash(song)).id,song.albumId);
 assert.equal(songAlbumHash({id:'song/a'}),'#/song/song%2Fa');
 assert.equal(readRoute('#/search?i=ignored').focusSong,undefined);
});

test('Library-search playback is confined to desktop artwork and spans the mobile row without nested buttons',()=>{
 const song={id:'one',title:'A < B',artist:'C'},ui={cover:()=>'/test',icon:()=>'',explicitBadge:()=>''};
 const desktop=renderSearchSongMain(song,2,ui),mobile=renderSearchSongMain(song,2,ui,{mobile:true});
 assert.ok(desktop.startsWith('<div class="search-song-main"'));assert.ok(mobile.startsWith('<button class="search-song-main"'));
 assert.equal((desktop.match(/<button\b/g)||[]).length,1);assert.equal((mobile.match(/<button\b/g)||[]).length,1);
 assert.ok(desktop.includes('<button class="song-art search-song-cover-play"'));assert.ok(mobile.includes('<span class="song-art"'));
 assert.ok(desktop.includes('A &lt; B'));assert.ok(mobile.includes('data-play="2"'));assert.ok(!desktop.includes('<a'));
});

test('Song metadata preserves real artist boundaries and release-date precision',()=>{
 const song={artist:'Legacy & Combined',artistId:'old',artists:[{id:'a',name:'A & B'},{id:'b',name:' C '},null],album:'One',year:2024};
 assert.deepEqual(songArtists(song).map(a=>a.name),['A & B','C']);
 assert.equal(songSubtitle(song),'One · A & B, C · 2024');
 assert.deepEqual(songArtists({artist:'A & B',artistId:'old'}),[{id:'old',name:'A & B'}]);
 assert.equal(songSubtitle({}), '');
});
test('Song credits merge roles per person without inventing instruments or omitting unknown contributors',()=>{
 const song={artists:[{id:'a',name:'A'}],contributors:[{role:'performer',subRole:'Bass',artist:{id:'a',name:'A'}},{role:'composer',artist:{id:'c',name:'C'}},{role:'lyricist',artist:{id:'c',name:'C'}},{role:'producer',artist:{name:'P'}},{role:'custom role',artist:{name:'Other'}},{role:'composer',artist:{}},null]};
 const groups=songCredits(song);assert.equal(groups.length,4);
 assert.deepEqual(groups[0].items[0].roles,['Bass']);assert.equal(groups[0].items.length,1);
 assert.deepEqual(groups[1].items[0].roles,['Komposition','Liedtext']);
 assert.equal(groups[3].items[0].roles[0],'custom role');
 assert.deepEqual(songCredits({}),[]);
 assert.deepEqual(songCredits({artist:'A'})[0].items[0].roles,['Künstler:in']);
});
test('Standalone lyrics prefer populated synced text, preserve stanza breaks and do not synthesize missing text',()=>{
 const data={lyricsList:{structuredLyrics:[{synced:true,line:[]},{synced:false,line:[{value:'other'}]},{synced:true,line:[{value:'First'},{value:''},{value:'Third'},{value:'<Music> & more'}]}]}};
 assert.deepEqual(songLyrics(data),['First','','Third','<Music> & more']);
 assert.deepEqual(songLyrics({lyricsList:{structuredLyrics:[]}}),[]);
 assert.deepEqual(songLyrics({lyricsList:{structuredLyrics:[{line:'invalid'}]}}),[]);
 assert.equal(songCredits({contributors:[{role:'__proto__',artist:{name:'Unknown'}}]})[0].items[0].roles[0],'__proto__');
});
test('Song page escapes imported metadata and lyric text and encodes the referenced album route',()=>{
 const song={id:'a/b',title:'<script>alert(1)</script>',artist:'A',album:'<Album>',albumId:'a/b',contributors:[]};
 const html=renderSongPage(song,{lines:['<script>','two','three','four']},{cover:()=>'/cover',icon:()=>'',explicitBadge:()=>'',favoriteButton:()=>'',cards:()=>'',artistPlaceholder:'/artist'});
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('href="#/album/a%2Fb"'));assert.ok(!html.includes('<p>four</p>'));
 assert.ok(html.includes('data-song-lyrics'));assert.ok(!html.includes('Produktion Und Technik'));
});

test('Credit initials use the first and last name, including Unicode letters, without treating punctuation as a person',async()=>{
 const {creditInitials}=await import('./public/song-page.js');
 for(const [name,result] of [['Dennis Opoku','DO'],['Gennaro Alessandro Frenken','GF'],['Patrick Großmann','PG'],['  Élodie   Ångström  ','ÉÅ'],['geenaro','G'],['«王 小明»','王小'],['---',''],[null,'']])assert.equal(creditInitials(name),result);
});

test('Table metadata keeps individual artists, escapes labels and selects the exact song in its album',async()=>{
 const {renderSongArtists,renderSongAlbum}=await import('./public/song-page.js');
 const song={id:'s/%2F?',albumId:'a/b',album:'<Album> & More',artists:[{id:'a/b',name:'A & B'},{id:'c?d',name:'<C>'}],artist:'Combined fallback'};
 const artists=renderSongArtists(song),album=renderSongAlbum(song);
 assert.equal(artists,'<a class="song-metadata-link" href="#/artist/a%2Fb">A &amp; B</a>, <a class="song-metadata-link" href="#/artist/c%3Fd">&lt;C&gt;</a>');
 assert.ok(album.includes('href="#/album/a%2Fb?i=s%2F%252F%3F"'));assert.ok(album.includes('&lt;Album&gt; &amp; More'));
 assert.equal(renderSongArtists({artist:'No ID & Name'}),'No ID &amp; Name');assert.equal(renderSongAlbum({album:'No <ID>'}),'No &lt;ID&gt;');
 assert.equal(renderSongAlbum({album:'Only album',albumId:'a/b'}),'<a class="song-metadata-link" href="#/album/a%2Fb">Only album</a>');
});

test('Player metadata uses known destinations, escapes names and leaves unknown IDs as plain text',()=>{
 const song={id:'s/?',artist:'Combined fallback',artists:[{id:'ar/1',name:'A & B'},{name:'C <D>'}],album:'<Album>',albumId:'al/2'};
 const result=playerMetadata(song);
 assert.equal(result.text,'A & B, C <D> — <Album>');
 assert.ok(result.html.includes('href="#/artist/ar%2F1">A &amp; B</a>, C &lt;D&gt;'));
 assert.ok(result.html.includes('href="#/album/al%2F2?i=s%2F%3F">&lt;Album&gt;</a>'));
 assert.deepEqual(playerMetadata({artist:'No ID & Name'}),{text:'No ID & Name',html:'No ID &amp; Name'});
 assert.deepEqual(playerMetadata({album:'Only <Album>'}),{text:'Only <Album>',html:'Only &lt;Album&gt;'});
 assert.deepEqual(playerMetadata({}),{text:'',html:''});
});

test('Album bylines distinguish guest performers from the album artist without splitting band names',()=>{
 const album={artist:'Lena Winter',artistId:'a'};
 assert.equal(albumSongHasByline({artist:'Lena Winter',artistId:'a'},album),false);
 assert.equal(albumSongHasByline({artists:[{id:'a',name:'L. Winter'}]},album),false);
 assert.equal(albumSongHasByline({artists:[{id:'a',name:'Lena Winter'},{id:'b',name:'Studio Nord'}]},album),true);
 assert.equal(albumSongHasByline({artist:'Lena Winter & Studio Nord'},album),true);
 assert.equal(albumSongHasByline({artist:'Earth, Wind & Fire'},{artist:'Earth, Wind & Fire'}),false);
 assert.equal(albumSongHasByline({artist:'Lena Winter',artistId:'other'},album),true);
 assert.equal(albumSongHasByline({artist:'Performer'},{artist:'Verschiedene Interpreten'}),true);
});

test('Album bylines compare artist sets, Unicode names and available metadata without inventing credits',()=>{
 const artists=[{id:'a',name:'One'},{id:'b',name:'Two'}];
 assert.equal(albumSongHasByline({artists:[...artists].reverse()},{artists}),false);
 assert.equal(albumSongHasByline({artists:[artists[0],artists[0]]},{artists:[artists[0]]}),false);
 assert.equal(albumSongHasByline({artist:'  JÖRG  '},{artist:'Jo\u0308rg'}),false);
 assert.equal(albumSongHasByline({},{}),false);
 assert.equal(albumSongHasByline({artist:'Known'},{}),true);
 assert.equal(albumSongHasByline({}, {artist:'Known'}),false);
});
