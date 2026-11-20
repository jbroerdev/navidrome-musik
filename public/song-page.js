import {releaseDateLabel} from './collection-metadata.js';
import {selectLyrics} from './player-motion.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>typeof value==='string'?value.trim():'';
export function songArtists(song) {
 const artists=Array.isArray(song.artists)?song.artists.filter(a=>a&&text(a.name)):[];
 return artists.length?artists.map(a=>({...a,name:text(a.name)})):text(song.artist)?[{id:song.artistId,name:text(song.artist)}]:[];
}
export function albumSongHasByline(song,album) {
 const same=(a,b)=>a.id!=null&&b.id!=null?String(a.id)===String(b.id):a.name.normalize('NFC').toLocaleLowerCase()===b.name.normalize('NFC').toLocaleLowerCase();
 const unique=list=>list.filter((artist,index)=>!list.slice(0,index).some(other=>same(artist,other)));
 const performers=unique(songArtists(song)),albumArtists=unique(songArtists(album||{}));
 return performers.length>0&&(performers.length!==albumArtists.length||performers.some(artist=>!albumArtists.some(other=>same(artist,other))));
}
export function songLyrics(data) {
 const lyrics=selectLyrics(data);
 return (lyrics?.line||[]).map(line=>typeof line?.value==='string'?line.value:'');
}
const roles={performer:['performers','Interpret:in'],composer:['writing','Komposition'],lyricist:['writing','Liedtext'],writer:['writing','Songwriter:in'],producer:['production','Produzent:in'],engineer:['production','Tontechnik'],mixer:['production','Mischung'],mixing:['production','Mischung'],mastering:['production','Mastering'],conductor:['performers','Dirigent:in'],arranger:['writing','Arrangement']};
export function creditInitials(name) {
 const words=text(name).split(/\s+/).map(word=>Array.from(word).find(c=>/[\p{L}\p{N}]/u.test(c))).filter(Boolean);
 return (words.length>1?words[0]+words.at(-1):words[0]||'').toLocaleUpperCase('de');
}
export function songCredits(song) {
 const groups=new Map([['performers',{title:'Ausführende Künstler:innen',items:[]}],['writing',{title:'Komposition Und Liedtext',items:[]}],['production',{title:'Produktion Und Technik',items:[]}],['other',{title:'Weitere Mitwirkende',items:[]}]]);
 const add=(group,artist,label)=>{
  if(!artist||!text(artist.name))return;
  const list=groups.get(group).items,key=artist.id?'id:'+artist.id:'name:'+text(artist.name),existing=list.find(item=>item.key===key);
  if(existing){if(!existing.roles.includes(label))existing.roles.push(label);}
  else list.push({key,artist:{...artist,name:text(artist.name)},roles:[label]});
 };
 for(const contributor of Array.isArray(song.contributors)?song.contributors:[]) {
  if(!contributor||!text(contributor.role))continue;
  const role=text(contributor.role).toLowerCase(),[group,label]=Object.hasOwn(roles,role)?roles[role]:['other',text(contributor.role)];
  add(group,contributor.artist,role==='performer'&&text(contributor.subRole)?text(contributor.subRole):label);
 }
 for(const artist of songArtists(song))if(!groups.get('performers').items.some(item=>item.key===(artist.id?'id:'+artist.id:'name:'+artist.name)))add('performers',artist,'Künstler:in');
 if(!groups.get('writing').items.length&&text(song.displayComposer))add('writing',{name:text(song.displayComposer)},'Komposition');
 return [...groups.values()].filter(group=>group.items.length);
}
export function songSubtitle(song) { return [song.album,songArtists(song).map(a=>a.name).join(', '),releaseDateLabel(song)].filter(Boolean).join(' · '); }

export function songAlbumHash(song) {
 return song.albumId?'#/album/'+encodeURIComponent(song.albumId)+'?'+new URLSearchParams({i:song.id}):'#/song/'+encodeURIComponent(song.id);
}

export function renderSongArtists(song) {
 return songArtists(song).map(artist=>artist.id?`<a class="song-metadata-link" href="#/artist/${encodeURIComponent(artist.id)}">${esc(artist.name)}</a>`:esc(artist.name)).join(', ');
}
export function renderSongAlbum(song) {
 const label=esc(text(song.album));if(!song.albumId)return label;
 const href=song.id==null?'#/album/'+encodeURIComponent(song.albumId):songAlbumHash(song);
 return `<a class="song-metadata-link" href="${esc(href)}">${label}</a>`;
}

export function playerMetadata(song) {
 const artists=songArtists(song).map(artist=>artist.name).join(', '),album=text(song.album);
 return {text:[artists,album].filter(Boolean).join(' — '),html:[artists?renderSongArtists(song):'',album?renderSongAlbum(song):''].filter(Boolean).join(' — ')};
}

export function renderSearchSongMain(song,index,{cover,icon,explicitBadge},{mobile=false}={}) {
 const play=`type="button" data-play="${index}" aria-label="${esc(song.title)} wiedergeben"`;
 const mainTag=mobile?'button':'div',artTag=mobile?'span':'button';
 return `<${mainTag} class="search-song-main" ${mobile?play:''}><${artTag} class="song-art${mobile?'':' search-song-cover-play'}" ${mobile?'':play}><img src="${esc(cover(song,112))}" alt=""><span class="song-art-play">${icon('play')}</span></${artTag}><span><strong><span class="song-name-text">${esc(song.title)}</span>${explicitBadge(song)}</strong><small class="search-desktop-subtitle">${esc(song.artist)}</small><small class="search-mobile-kind">Titel</small></span></${mainTag}>`;
}

export function renderNewSongCards(songs,{cover,icon,explicitBadge,favoriteButton}) {
 return '<div class="new-song-grid" role="list">'+songs.map((song,index)=>{
  const label=song.title+(song.artist?', Von '+song.artist:'');
  const artists=songArtists(song).map(artist=>artist.id?`<a href="#/artist/${encodeURIComponent(artist.id)}">${esc(artist.name)}</a>`:esc(artist.name)).join(', ');
  return `<article class="new-song" role="listitem" aria-label="${esc(label)}" data-song-id="${esc(song.id)}"><div class="new-song-main"><button class="song-art new-song-cover-play" data-play="${index}" aria-label="${esc(song.title)} wiedergeben"><img src="${esc(cover(song,80))}" alt=""><span class="song-art-play">${icon('play')}</span></button><span class="new-song-label"><strong><a class="song-name-text" href="${esc(songAlbumHash(song))}" aria-label="${esc(label)}">${esc(song.title)}</a>${explicitBadge(song)}</strong><small>${artists}</small></span></div>${favoriteButton(song,'song','new-song-favorite')}<button class="new-song-menu" data-menu="${index}" aria-label="Aktionen für ${esc(song.title)}">${icon('more')}</button></article>`;
 }).join('')+'</div>';
}

export function renderSongPage(song,{lines=[],lyricsError=false,albums=[],artist=null},ui) {
 const {cover,icon,explicitBadge,favoriteButton,cards,artistPlaceholder}=ui;
 const link=(name,kind,id)=>id?`<a href="#/${kind}/${encodeURIComponent(id)}">${esc(name)}</a>`:esc(name);
 const artists=songArtists(song),metadata=[song.album?link(song.album,'album',song.albumId):'',artists.map(a=>link(a.name,'artist',a.id)).join(', '),esc(releaseDateLabel(song))].filter(Boolean);
 const header=`<section class="song-page-header" aria-label="Im Spotlight"><div class="song-page-actions">${favoriteButton(song,'song','song-page-favorite')}<button data-menu="0" aria-label="Aktionen für ${esc(song.title)}">${icon('more')}</button></div><div class="song-page-details"><div class="song-page-artwork"><img class="song-page-reflection" src="${esc(cover(song,600))}" alt="" aria-hidden="true"><img src="${esc(cover(song,600))}" alt="${esc(song.title)}"></div><div class="song-page-meta"><h1>${esc(song.title)}${explicitBadge(song)}</h1><p class="song-page-subtitle">${metadata.map(item=>'<span>'+item+'</span>').join('')}</p><div class="song-page-play"><button class="primary" data-play="0">${icon('play')}Wiedergabe</button></div></div></div></section>`;
 const preview=lines.filter(line=>line.trim()).slice(0,3);
 const lyrics=preview.length?`<section class="song-info-section"><h2>Texte</h2><div class="song-info-content"><div class="song-lyrics-preview">${preview.map(line=>'<p>'+esc(line)+'</p>').join('')}<button data-song-lyrics>Vollständige Liedtexte anzeigen <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344"/></svg></button></div></div></section>`:lyricsError?'<section class="song-info-section"><h2>Texte</h2><div class="song-info-content song-lyrics-error"><p role="alert">Der Liedtext konnte nicht geladen werden.</p><button data-retry>Erneut versuchen</button></div></section>':'';
 const credits=songCredits(song).map(group=>`<section class="song-info-section"><h2>${esc(group.title)}</h2><div class="song-info-content"><ul class="song-credit-grid">${group.items.map(item=>{const person=artist?.id&&item.artist.id===artist.id?{...artist,...item.artist}:item.artist;return `<li><div class="song-credit"><span class="song-credit-avatar" aria-hidden="true"><span>${esc(creditInitials(person.name))}</span>${person.coverArt?`<img src="${esc(cover(person,96))}" alt="">`:""}</span><div><p>${esc(person.name)}</p><small>${esc(item.roles.join(', '))}</small></div></div></li>`;}).join('')}</ul></div></section>`).join('');
 const more=albums.length?`<section class="music-section song-more"><div class="section-heading"><h2>${artist?.id?link('Mehr von '+artist.name,'artist',artist.id):'Mehr aus deiner Mediathek'}</h2></div>${cards(albums,'album',true)}</section>`:'';
 return header+lyrics+credits+more;
}

export function renderTrackPlayback(playIcon) {
 const bars=[0,2.9668,5.9333,8.8999].map((x,i)=>`<rect class="playback-bar playback-bar-${i+1}" x="${x}" y="0" width="2.1" height="11" rx=".25"/>`).join('');
 return '<span class="track-playback" aria-hidden="true"><svg class="playback-bars" viewBox="0 0 11 11">'+bars+'</svg><span class="track-play-hover track-play-resume">'+playIcon+'</span><span class="track-play-hover track-play-pause"><svg viewBox="0 0 16 16"><path d="M9.918.464h2.672a.89.89 0 0 1 .89.89v13.291a.89.89 0 0 1-.89.891H9.918a.89.89 0 0 1-.89-.89V1.354a.89.89 0 0 1 .89-.891zm-6.371 0h2.398c.567 0 1.027.46 1.027 1.028v13.016c0 .568-.46 1.028-1.027 1.028H3.547c-.567 0-1.028-.46-1.028-1.028V1.492c0-.568.46-1.028 1.028-1.028"/></svg></span></span>';
}
