// OpenSubsonic ItemDate may contain only a year or a year and month.
// Format only the precision supplied by the server; never invent January 1.
export function releaseDateLabel(item = {}) {
  for (const value of [item.originalReleaseDate, item.releaseDate, {year: item.year}]) {
    const year = value?.year, month = value?.month, day = value?.day;
    if (!Number.isInteger(year) || year < 1 || year > 9999) continue;
    if (!month) return String(year);
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, 1);
    if (!day) return date.toLocaleDateString('de-DE', {month: 'long', year: 'numeric', timeZone: 'UTC'});
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    date.setUTCDate(day);
    if (date.getUTCMonth() !== month - 1) continue;
    return date.toLocaleDateString('de-DE', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
  }
  return '';
}

export function collectionDurationLabel(seconds) {
  const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  const minuteLabel = value => `${value} ${value === 1 ? 'Minute' : 'Minuten'}`;
  return hours ? `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}${remainder ? ' ' + minuteLabel(remainder) : ''}` : minuteLabel(minutes);
}

// Apple-style recent update labels use civil dates, so DST never changes the day count.
export function playlistUpdatedLabel(changed,{now=new Date(),timeZone}={}) {
 if(typeof changed!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(changed))return '';
 const year=Number(changed.slice(0,4)),month=Number(changed.slice(5,7)),day=Number(changed.slice(8,10)),calendar=new Date(0);calendar.setUTCFullYear(year,month-1,day);
 if(month<1||month>12||day<1||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)return '';
 const date=new Date(changed);if(!Number.isFinite(date.getTime())||!(now instanceof Date)||!Number.isFinite(now.getTime()))return '';
 try{
  const options=timeZone?{timeZone}:{},format=new Intl.DateTimeFormat('en-CA',{...options,year:'numeric',month:'2-digit',day:'2-digit'});
  const civil=value=>{const parts=Object.fromEntries(format.formatToParts(value).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));return Date.UTC(parts.year,parts.month-1,parts.day);};
  const days=(civil(now)-civil(date))/86400000;if(days<0||days>6)return '';
  return (days===0?'Heute':days===1?'Gestern':date.toLocaleDateString('de-DE',{...options,weekday:'long'}))+' aktualisiert';
 }catch{return '';}
}

export function playlistCardOrder(playlists,favorites) {
 const collator=new Intl.Collator('de',{numeric:true,sensitivity:'base'});
 const key=item=>String(item.isFavorites?'Favourite Songs':item.name||'').replace(/^[^\p{L}\p{N}]+/u,'');
 const startsWithNumber=item=>/^\p{N}/u.test(key(item));
 return [...playlists,...(favorites?[favorites]:[])].sort((a,b)=>Number(startsWithNumber(a))-Number(startsWithNumber(b))||collator.compare(key(a),key(b)));
}
export function playlistCardOwner(item,user) {
 const owner=typeof item.owner==='string'?item.owner:'';
 return !item.isFavorites&&owner&&typeof user==='string'&&owner.toLocaleLowerCase()===user.toLocaleLowerCase()?'':owner;
}

// Read every metadata page before reversing a server-defined album order.
// A stale view must neither keep requesting pages nor populate another view's cache.
export async function readAlbumIndex(readPage,isCurrent=()=>true) {
 const all=[],ids=new Set();
 for(let offset=0;;){
  if(!isCurrent())return null;
  const page=await readPage({size:500,offset});
  if(!isCurrent())return null;
  if(!Array.isArray(page))throw Error('Ungültige Albumliste.');
  const fresh=page.filter(album=>album?.id!=null&&!ids.has(album.id));
  for(const album of fresh){if(ids.has(album.id))continue;ids.add(album.id);all.push(album);}
  if(page.length<500||!fresh.length)return all;
  offset+=page.length;
 }
}
