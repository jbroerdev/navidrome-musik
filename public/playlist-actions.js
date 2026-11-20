const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const plus = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 0h2v7h7v2H9v7H7V9H0V7h7z"/></svg>';
const chevron = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

export const playlistActionButton = disabled => `<button role="menuitem" data-add-playlist aria-haspopup="menu" aria-expanded="false" ${disabled?'disabled':''}>${chevron}Zur Playlist hinzufügen</button>`;

// Context menus prefer the space above their trigger. Fit whole-pixel bounds
// so fractional text widths cannot leave the surface past its intended anchor.
export function contextMenuPlacement(anchor,width,height,viewportWidth,viewportHeight,point=null) {
 const w=Math.ceil(width),h=Math.ceil(height);
 const x=Math.round(point?.x??anchor.x+anchor.width/2),y=Math.round(point?.y??anchor.y+anchor.height/2);
 const left=x+w<=viewportWidth-8?x:x-w;
 const top=y-h>=8?y-h:y;
 return {left:Math.max(8,Math.min(left,viewportWidth-w-8)),top:Math.max(8,Math.min(top,viewportHeight-h-8))};
}

export class PlaylistActions {
  constructor({getPlaylists, getUser, getScope=getUser, refresh, saved, toast}) {
    Object.assign(this, {getPlaylists, getUser, getScope, refresh, saved, toast});
    this.menu = document.querySelector('#playlist-context');
    this.dialog = document.querySelector('#new-playlist-dialog');
    this.form = this.dialog.querySelector('form');
    this.name = this.form.elements.name;
    this.submit = this.form.querySelector('[type="submit"]');
    this.title = this.dialog.querySelector('#new-playlist-title');
    this.error = this.form.querySelector('[role="alert"]');
    this.deleteDialog=document.querySelector('#delete-playlist-dialog');
    this.deleteForm=this.deleteDialog.querySelector('form');
    this.deleteError=this.deleteForm.querySelector('[role="alert"]');
    this.deleteForm.addEventListener('submit',event=>{event.preventDefault();this.deletePlaylist();});
    this.deleteForm.querySelector('[data-delete-cancel]').addEventListener('click',()=>this.deleteDialog.close());
    this.deleteDialog.addEventListener('cancel',event=>{if(this.deleteBusy)event.preventDefault();});
    this.deleteDialog.addEventListener('close',()=>{if(!this.deleteBusy)this.deleting=null;this.deleteReturn?.isConnected&&this.deleteReturn.focus({preventScroll:true});});
    this.menu.addEventListener('click', event => {
      if (event.target.closest('[data-playlist-back]')) this.close(true);
      else if (event.target.closest('[data-playlist-new]')) this.openCreate();
      else {
        const button = event.target.closest('[data-playlist-destination]');
        if (button) this.append(button.dataset.playlistDestination);
      }
    });
    this.form.addEventListener('input', () => { this.submit.disabled = this.busy || !this.name.value.trim(); });
    this.form.addEventListener('submit', event => { event.preventDefault(); this.save(); });
    this.form.querySelector('[data-playlist-cancel]').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => this.returnAnchor?.isConnected && this.returnAnchor.focus({preventScroll:true}));
    this.mobile = matchMedia('(max-width:483px)');
    this.mobile.addEventListener('change', () => this.close());
    let menuViewportWidth=innerWidth,menuViewportHeight=innerHeight;window.addEventListener('resize',()=>{if(innerWidth===menuViewportWidth&&innerHeight===menuViewportHeight)return;menuViewportWidth=innerWidth;menuViewportHeight=innerHeight;this.dismissAll();});
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('.context-menu')) this.close();
    });
  }

  bind(parent, songs, returnAnchor) {
    this.close();
    if(this.parent){this.parent.removeEventListener('focusin',this.parentFocus);this.parent.removeEventListener('pointerover',this.parentPointer);}
    this.parent=parent;
    const trigger = parent.querySelector('[data-add-playlist]');
    if (!trigger) return;
    const open = focus => this.open(trigger, songs, returnAnchor, focus);
    trigger.addEventListener('click', event => { event.stopPropagation(); open(true); });
    trigger.addEventListener('pointerenter', () => { if (!this.mobile.matches) open(false); });
    this.parentFocus=event => { if (event.target !== trigger) this.close(); };
    this.parentPointer=event => {
      if (event.target.closest('button') && !event.target.closest('[data-add-playlist]')) this.close();
    };
    parent.addEventListener('focusin',this.parentFocus);
    parent.addEventListener('pointerover',this.parentPointer);
    trigger.playlistOpen = () => open(true);
  }

  renderChoices() {
    const user = this.getUser()?.toLocaleLowerCase();
    const playlists = this.getPlaylists().filter(item => item.owner?.toLocaleLowerCase() === user)
      .sort((a,b) => String(b.changed||b.created||'').localeCompare(String(a.changed||a.created||'')));
    this.menu.innerHTML = `<button role="menuitem" class="playlist-submenu-back" data-playlist-back>${chevron}Zur Playlist hinzufügen</button><button role="menuitem" data-playlist-new>${plus}Neue Playlist</button>${playlists.length?'<div class="playlist-choice-group">Zuletzt</div>':''}${playlists.map(item=>`<button role="menuitem" data-playlist-destination="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span></button>`).join('')}`;
  }

  open(trigger, songs, returnAnchor, focus) {
    if (trigger.disabled || !songs.length) return;
    this.close();
    this.trigger = trigger;
    this.songs = [...songs];
    this.returnAnchor = returnAnchor;
    const parent = trigger.closest('dialog[open]') || document.querySelector('#app');
    if (this.menu.parentElement !== parent) parent.append(this.menu);
    this.renderChoices();
    this.menu.hidden = false;
    this.menu.showPopover();
    trigger.setAttribute('aria-expanded','true');
    this.place();
    if (focus) this.menu.querySelector(this.mobile.matches?'[data-playlist-back]':'[data-playlist-new]').focus({preventScroll:true});
    // Keep destinations current if another client has edited the user's lists.
    const marker=this.marker=Symbol(), user=this.getUser(), scope=this.getScope();
    this.refresh().then(() => {
      if (this.marker!==marker || this.menu.hidden || !this.current(user,scope)) return;
      const active=document.activeElement, selected=active?.dataset.playlistDestination, wasNew=active?.hasAttribute('data-playlist-new'), wasBack=active?.hasAttribute('data-playlist-back');
      this.renderChoices();this.place();
      if(selected) Array.from(this.menu.querySelectorAll('[data-playlist-destination]')).find(button=>button.dataset.playlistDestination===selected)?.focus({preventScroll:true});
      else if(wasNew||wasBack) this.menu.querySelector(wasNew?'[data-playlist-new]':'[data-playlist-back]')?.focus({preventScroll:true});
    }).catch(() => {});
  }

  place() {
    const main = document.querySelector('#context'), r = this.trigger.getBoundingClientRect();
    if (this.mobile.matches) {
      main.classList.add('submenu-covered');
      this.menu.style.left = (innerWidth-this.menu.offsetWidth)/2+'px';
      this.menu.style.top = Math.max(8,innerHeight-25-this.menu.offsetHeight)+'px';
    } else {
      const box=main.getBoundingClientRect(), width=this.menu.offsetWidth;
      this.menu.style.left=Math.max(8,Math.min(box.right+width<=innerWidth-8?box.right:box.left-width,innerWidth-width-8))+'px';
      this.menu.style.top=Math.max(8,Math.min(r.top,innerHeight-this.menu.offsetHeight-8))+'px';
    }
  }

  close(restoreFocus=false) {
    this.marker=null;
    if (this.menu.matches(':popover-open')) this.menu.hidePopover();
    this.menu.hidden=true;
    document.querySelector('#context').classList.remove('submenu-covered');
    this.trigger?.setAttribute('aria-expanded','false');
    if(restoreFocus && this.trigger?.isConnected) this.trigger.focus({preventScroll:true});
  }

  dismissAll() {
    this.close();
    const main=document.querySelector('#context');
    if(main.matches(':popover-open')) main.hidePopover();
    main.hidden=true;
  }

  async write(path, body) {
    let response;
    try {response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
    catch {throw Error('Keine Verbindung zum Server. Die Playlist konnte nicht gespeichert werden.');}
    let result;try {result=await response.json();}catch {throw Error('Der Server hat keine gültige Antwort für die Playlist geliefert.');}
    if(!response.ok) throw Error(result.error||'Playlist konnte nicht gespeichert werden.');
    return result;
  }

  current(user,scope) { return this.getUser()===user && this.getScope()===scope; }

  reset() {
    this.deleting=null;this.deleteRequest=null;this.deleteBusy=false;this.deleteReturn=null;if(this.deleteDialog.open)this.deleteDialog.close();
    this.dismissAll();this.request=null;this.busy=false;this.editing=null;this.editReturn=null;this.returnAnchor=null;this.songs=[];
    if(this.parent){this.parent.removeEventListener('focusin',this.parentFocus);this.parent.removeEventListener('pointerover',this.parentPointer);this.parent=null;}
    if(this.dialog.open)this.dialog.close();
    this.trigger=null;this.menu.replaceChildren();document.querySelector('#context').replaceChildren();
    this.form.reset();this.error.textContent='';this.title.textContent='Neue Playlist';this.submit.textContent='Erstellen';this.submit.disabled=true;
    for(const field of this.form.querySelectorAll('input,textarea'))field.disabled=false;
  }

  async afterSaved(result, id, created, user, scope, operation='append') {
    if(!this.current(user,scope)) return;
    try { await this.saved(result,id,created,operation); }
    catch { if(this.current(user,scope))this.toast(result.warning||(operation==='delete'?'Playlist gelöscht. Die Anzeige konnte nicht aktualisiert werden; bitte neu laden.':'Gespeichert. Die Anzeige konnte nicht aktualisiert werden; bitte neu laden.')); return; }
    if(!this.current(user,scope)) return;
    if(operation==='edit'&&this.editReturn?.href===location.href&&!this.returnAnchor?.isConnected&&[document.body,document.documentElement].includes(document.activeElement)){
      const fresh=this.editReturn.detail?document.querySelector('[data-collection-menu]'):Array.from(document.querySelectorAll('[data-card-menu]')).find(button=>button.dataset.cardMenu===this.editReturn.card);
      this.returnAnchor=fresh||document.querySelector('main');this.returnAnchor?.focus({preventScroll:true});
    }
    this.toast(result.warning || (operation==='delete'?'Playlist gelöscht.':operation==='edit'?'Playlist gespeichert.':created?'Playlist erstellt.':'Zur Playlist hinzugefügt.'));
  }

  async append(id) {
    const songIds=this.songs.map(song=>song.id), user=this.getUser(),scope=this.getScope();
    this.dismissAll();
    this.returnAnchor?.isConnected && this.returnAnchor.focus({preventScroll:true});
    try { const result=await this.write('playlist/add',{playlistId:id,songIds}); await this.afterSaved(result,id,false,user,scope); }
    catch(error) { if(this.current(user,scope)) this.toast(error.message); }
  }

  openCreate() {
    if(this.busy){this.toast('Playlist wird noch gespeichert.');return;}
    this.dismissAll();this.editing=null;this.editReturn=null;
    this.form.reset();this.error.textContent='';this.submit.disabled=true;this.submit.textContent='Erstellen';this.title.textContent='Neue Playlist';
    this.dialog.showModal();this.dialog.focus({preventScroll:true});
  }

  openEdit(playlist,anchor) {
    if(this.busy){this.toast('Playlist wird noch gespeichert.');return;}
    if(!this.getUser()||!playlist?.id||typeof playlist.owner!=='string'||playlist.owner.toLocaleLowerCase()!==this.getUser().toLocaleLowerCase()){this.toast('Nur eigene Playlists können bearbeitet werden.');return;}
    this.dismissAll();this.editing={id:playlist.id};this.returnAnchor=anchor;this.editReturn={href:location.href,detail:anchor?.hasAttribute('data-collection-menu'),card:anchor?.dataset.cardMenu};
    this.form.reset();this.name.value=playlist.name||'';this.form.elements.comment.value=playlist.comment||'';this.form.elements.public.checked=playlist.public===true;
    this.error.textContent='';this.title.textContent='Playlist bearbeiten';this.submit.textContent='Fertig';this.submit.disabled=!this.name.value.trim();
    this.dialog.showModal();this.dialog.focus({preventScroll:true});
  }

  openDelete(playlist,songs,anchor) {
    if(this.deleteBusy)return;
    if(!this.getUser()||!playlist?.id||typeof playlist.owner!=='string'||playlist.owner.toLocaleLowerCase()!==this.getUser().toLocaleLowerCase()){this.toast('Nur eigene Playlists können gelöscht werden.');return;}
    this.dismissAll();this.deleteReturn=anchor;
    this.deleting={playlistId:playlist.id,expectedName:playlist.name||'',expectedChanged:playlist.changed||'',expectedSongIds:songs.map(song=>song.id),user:this.getUser(),scope:this.getScope()};
    this.deleteError.textContent='';
    this.deleteDialog.querySelector('#delete-playlist-message').textContent='Möchtest du die Playlist „'+(playlist.name||'Playlist')+'“ wirklich aus deiner Mediathek löschen? Deine Musiktitel bleiben erhalten.';
    for(const button of this.deleteForm.querySelectorAll('button'))button.disabled=false;
    this.deleteForm.querySelector('[type="submit"]').textContent='Löschen';
    this.deleteDialog.showModal();this.deleteForm.querySelector('[data-delete-cancel]').focus({preventScroll:true});
  }

  async deletePlaylist() {
    const pending=this.deleting;if(this.deleteBusy||!pending||!this.current(pending.user,pending.scope))return;
    const request=this.deleteRequest=Symbol();this.deleteBusy=true;this.deleteError.textContent='';
    for(const button of this.deleteForm.querySelectorAll('button'))button.disabled=true;
    this.deleteForm.querySelector('[type="submit"]').textContent='Löschen …';
    const {user,scope,...body}=pending;
    try {
      const result=await this.write('playlist/delete',body);
      if(this.deleteRequest!==request||!this.current(user,scope))return;
      this.deleting=null;this.deleteDialog.close();
      await this.afterSaved(result,pending.playlistId,false,user,scope,'delete');
    }catch(error){if(this.deleteRequest===request&&this.current(user,scope))this.deleteError.textContent=error.message;}
    finally{if(this.deleteRequest===request){this.deleteBusy=false;for(const button of this.deleteForm.querySelectorAll('button'))button.disabled=false;this.deleteForm.querySelector('[type="submit"]').textContent='Löschen';}}
  }

  async save() {
    if(this.busy || !this.form.reportValidity() || !this.name.value.trim()) return;
    const editing=this.editing, user=this.getUser(), scope=this.getScope(), request=this.request=Symbol();
    const body={name:this.name.value.trim(),comment:this.form.elements.comment.value,public:this.form.elements.public.checked};
    if(editing)body.playlistId=editing.id;else body.songIds=this.songs.map(song=>song.id);
    this.busy=true;this.submit.disabled=true;this.submit.textContent='Speichern …';this.error.textContent='';
    for(const field of this.form.querySelectorAll('input,textarea'))field.disabled=true;
    try {
      const result=await this.write(editing?'playlist/edit':'playlist',body);
      if(this.request!==request||!this.current(user,scope))return;
      this.dialog.close();
      await this.afterSaved(result,editing?.id||result.playlist?.id,!editing,user,scope,editing?'edit':'create');
    } catch(error) { if(this.request===request&&this.current(user,scope)){if(this.dialog.open)this.error.textContent=error.message;else this.toast(error.message);} }
    finally {if(this.request===request){this.busy=false;this.submit.disabled=!this.name.value.trim();this.submit.textContent=editing?'Fertig':'Erstellen';for(const field of this.form.querySelectorAll('input,textarea'))field.disabled=false;}}
  }

  handleKey(event) {
    if(this.dialog.open||this.deleteDialog.open) return true;
    if(event.key==='ArrowRight' && document.activeElement?.matches('[data-add-playlist]')) {
      event.preventDefault();document.activeElement.playlistOpen?.();return true;
    }
    if(this.menu.hidden) return false;
    if(event.key==='Escape'||event.key==='ArrowLeft') {event.preventDefault();this.close(true);return true;}
    if(this.menu.contains(document.activeElement)&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();const buttons=Array.from(this.menu.querySelectorAll('button')).filter(button=>!button.disabled&&getComputedStyle(button).display!=='none'),index=buttons.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[next]?.focus({preventScroll:true});return true;
    }
    return false;
  }
}

export function mediaShareUrl(base,kind,id) {
 if(!['song','album','artist','playlist','favorites'].includes(kind)||kind!=='favorites'&&(id==null||String(id)===''))throw new TypeError('Ungültiges Musikziel');
 const url=new URL(base);if(!['http:','https:'].includes(url.protocol))throw new TypeError('Ungültige Serveradresse');
 url.username='';url.password='';url.search='';url.hash=kind==='favorites'?'/favorites':'/'+kind+'/'+encodeURIComponent(String(id));return url.href;
}

export class MediaSharing {
 constructor({navigator,getBase}) {this.navigator=navigator;this.getBase=getBase;}
 get nativeAvailable(){return typeof this.navigator.share==='function';}
 async copy(kind,item){const url=mediaShareUrl(this.getBase(),kind,item.id);await this.navigator.clipboard.writeText(url);return {action:'copied',url};}
 async share(kind,item){
  const data={title:String(item.title||item.name||'Musik'),url:mediaShareUrl(this.getBase(),kind,item.id)};
  if(!this.nativeAvailable||typeof this.navigator.canShare==='function'&&!this.navigator.canShare(data))return this.copy(kind,item);
  try{await this.navigator.share(data);return {action:'shared',url:data.url};}
  catch(error){if(error?.name==='AbortError')return {action:'cancelled',url:data.url};throw error;}
 }
}
