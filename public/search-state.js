const tabs = new Set(['song', 'artist', 'album', 'playlist']);
export const searchTabName = value => tabs.has(value) ? value : 'song';

export function readRoute(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const separator = raw.indexOf('?');
  const path = separator < 0 ? raw : raw.slice(0, separator);
  const params = new URLSearchParams(separator < 0 ? '' : raw.slice(separator + 1));
  let route,id;
  try {
    decodeURI(path);route=path||'home';
    const parts=path.split('/');
    if(['album','artist','playlist','song'].includes(parts[0])&&parts.length===2){
      id=decodeURIComponent(parts[1]);route=parts[0]+'/'+encodeURIComponent(id);
    }
  }
  catch { route = 'not-found'; }
  return {route, term: route === 'search' ? params.get('term') || '' : '', tab: searchTabName(params.get('type')), ...(id!==undefined?{id}:{}), ...(route.startsWith('album/')&&params.get('i')?{focusSong:params.get('i')}:{})};
}

export function newPageView({y=0,shelves=[]}={}) {
 const coordinate=value=>Number.isFinite(value)&&value>=0?value:0;
 return {route:'new',y:coordinate(y),shelves:Array.isArray(shelves)?shelves.map(coordinate):[]};
}
export function readNewPageView(state) {
 return newPageView(state?.musikNewView?.route==='new'?state.musikNewView:{});
}

export function searchHash(term, tab = 'song') {
  if (!term) return '#/search';
  const params = new URLSearchParams({term});
  if (searchTabName(tab) !== 'song') params.set('type', tab);
  return '#/search?' + params;
}

const coordinate = value => Number.isFinite(value) && value >= 0 ? value : 0;
export function searchView(term, tab, view = {}) {
  return {term, tab: searchTabName(tab), y: coordinate(view.y), songs: coordinate(view.songs), tabs: coordinate(view.tabs), albums: coordinate(view.albums), playlists: coordinate(view.playlists), artists: coordinate(view.artists)};
}

export function readSearchView(historyState, term, tab) {
  const saved = historyState?.musikSearchView;
  return saved && saved.term === term && saved.tab === searchTabName(tab) ? searchView(term, tab, saved) : searchView(term, tab);
}

// The client clears these results on logout; only view coordinates enter history.
export class SearchCache {
  constructor({limit = 12, ttl = 60000, now = Date.now} = {}) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Search cache limit must be positive');
    this.limit = limit;
    this.ttl = ttl;
    this.now = now;
    this.entries = new Map();
  }
  get(term) {
    const entry = this.entries.get(term);
    if (!entry) return null;
    if (this.now() - entry.created > this.ttl) { this.entries.delete(term); return null; }
    this.entries.delete(term);
    this.entries.set(term, entry);
    return entry.result;
  }
  set(term, result) {
    this.entries.delete(term);
    this.entries.set(term, {result, created: this.now()});
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  clear() { this.entries.clear(); }
}

// getPlaylists is scoped by the upstream to the signed-in user's accessible library.
export function matchingPlaylists(playlists, query) {
  const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const term = normalize(query).trim();
  if (!term) return [];
  const words = term.split(/\s+/);
  return playlists.filter(item => words.every(word => normalize(item.name).includes(word)));
}

export const isSearchSongDetail = (historyState, term) => Boolean(term && historyState?.musikSearchDetail?.kind === 'song' && historyState.musikSearchDetail.term === term);

export function appendSearchSongs(cache, received, pageSize = 100) {
  const ids = new Set(cache.items.map(song => song.id));
  const fresh = received.filter(song => { if (ids.has(song.id)) return false; ids.add(song.id); return true; });
  cache.items.push(...fresh);
  cache.offset += received.length;
  cache.hasMore = received.length === pageSize && fresh.length > 0;
  return fresh.length;
}

const recentKinds=new Set(['artist','album','playlist']);
const recentEntry=(kind,item)=>{
 if(!recentKinds.has(kind)||!item||typeof item.id!=='string'||!item.id||typeof item.name!=='string'||!item.name.trim())return null;
 const entry={kind,id:item.id,name:item.name};
 for(const key of ['coverArt','artist','album'])if(typeof item[key]==='string')entry[key]=item[key];
 return entry;
};
export class RecentSearches {
 constructor(storage,{limit=10}={}){this.storage=storage;this.limit=limit;this.entries=[];this.key=null;}
 setScope(server,user){
  this.entries=[];this.key=null;if(!server||!user)return;
  try{const url=new URL(server);this.key='musik-search-recents-v1:'+JSON.stringify([url.origin+url.pathname.replace(/\/+$/,''),String(user).toLowerCase()]);
   const stored=JSON.parse(this.storage.getItem(this.key)||'null');if(stored?.version!==1||!Array.isArray(stored.entries))return;
   const seen=new Set();for(const item of stored.entries){const entry=recentEntry(item?.kind,item),id=entry&&JSON.stringify([entry.kind,entry.id]);if(!entry||seen.has(id))continue;seen.add(id);this.entries.push(entry);if(this.entries.length>=this.limit)break;}
  }catch{}
 }
 list(){return this.entries.map(item=>({...item}));}
 remove(kind,id){if(!this.key)return;this.entries=this.entries.filter(item=>item.kind!==kind||item.id!==id);try{this.storage.setItem(this.key,JSON.stringify({version:1,entries:this.entries}));}catch{}}
 remember(kind,item){const entry=recentEntry(kind,item);if(!entry||!this.key)return;this.entries=[entry,...this.entries.filter(old=>old.kind!==kind||old.id!==entry.id)].slice(0,this.limit);try{this.storage.setItem(this.key,JSON.stringify({version:1,entries:this.entries}));}catch{}}
 clear(){this.entries=[];if(this.key)try{this.storage.removeItem(this.key);}catch{}}
}

// Editing mobile search is separate from the committed query/results in the URL.
export class MobileSearchInteraction {
 constructor(){this.reset();}
 reset(){this.active=false;this.preview=false;this.index=-1;}
 focus(draft,committed){this.active=true;this.preview=!draft.trim()||draft!==committed;this.index=-1;}
 edit(){this.active=true;this.preview=true;this.index=-1;}
 submit(){this.active=true;this.preview=false;this.index=-1;}
 cancel(){this.reset();return '';}
 move(delta,count){this.index=Math.max(-1,Math.min(Math.max(-1,count-1),this.index+delta));return this.index;}
}

const libraryRoutes=new Set(['recent','artists','albums','songs']);
export class LibraryNavigation {
 constructor(storage){this.storage=storage;this.key=null;this.hidden=new Set();}
 setScope(server,user){
  this.key=null;this.hidden.clear();if(!server||!user)return;
  try{
   const url=new URL(server);this.key='musik-library-nav-v1:'+JSON.stringify([url.origin+url.pathname.replace(/\/+$/,''),String(user).toLowerCase()]);
   const saved=JSON.parse(this.storage.getItem(this.key)||'null');
   if(saved?.version===1&&Array.isArray(saved.hidden))this.hidden=new Set(saved.hidden.filter(route=>libraryRoutes.has(route)));
  }catch{}
 }
 visible(route){return !this.hidden.has(route);}
 setVisible(route,visible){
  if(!this.key||!libraryRoutes.has(route))return;
  if(visible)this.hidden.delete(route);else this.hidden.add(route);
  try{this.storage.setItem(this.key,JSON.stringify({version:1,hidden:[...this.hidden]}));}catch{}
 }
}
