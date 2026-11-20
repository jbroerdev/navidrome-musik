// Positions, rather than song IDs, keep repeated playlist entries independent.
export class RowSelection {
  constructor() { this.indices=new Set(); this.anchor=null; }
  select(index,{extend=false,toggle=false}={}) {
    if(extend && this.anchor!==null) {
      const start=Math.min(this.anchor,index),end=Math.max(this.anchor,index);
      this.indices=new Set(Array.from({length:end-start+1},(_,i)=>start+i));
    } else if(toggle) {
      if(this.indices.has(index))this.indices.delete(index);else this.indices.add(index);
      this.anchor=index;
    } else { this.indices=new Set([index]);this.anchor=index; }
  }
  all(count) { this.indices=new Set(Array.from({length:count},(_,i)=>i));this.anchor=0; }
  songs(items) { return [...this.indices].sort((a,b)=>a-b).map(i=>items[i]).filter(Boolean); }
}

export class TableSelection {
  constructor(root,{getSongs,play}) {
    this.getSongs=getSongs;this.states=new WeakMap();
    const rowFor=target=>target.closest('.song-table tbody tr[data-row-index]');
    root.addEventListener('mousedown',event=>{
      if(event.shiftKey&&rowFor(event.target)&&!event.target.closest('button,a,input'))event.preventDefault();
    });
    root.addEventListener('click',event=>{
      const row=rowFor(event.target);if(!row)return;
      const table=row.closest('table'),state=this.state(table),index=Number(row.dataset.rowIndex);
      if(event.target.closest('[data-menu]')) {
        if(!state.indices.has(index)){state.select(index);this.sync(table);}
        return;
      }
      if(event.target.closest('button,a,input'))return;
      state.select(index,{extend:event.shiftKey,toggle:event.metaKey});this.sync(table);row.focus({preventScroll:true});
    },true);
    root.addEventListener('dblclick',event=>{
      const row=rowFor(event.target);if(row&&!event.target.closest('button,a,input'))play(getSongs(row.closest('table')),Number(row.dataset.rowIndex));
    });
    root.addEventListener('keydown',event=>{
      const row=rowFor(event.target);if(!row||event.target!==row||event.altKey)return;
      const table=row.closest('table'),state=this.state(table),rows=[...table.querySelectorAll('tbody tr[data-row-index]')];
      let target;
      if(event.metaKey&&event.key.toLowerCase()==='a') {state.all(getSongs(table).length);target=rows.at(-1);}
      else if(!event.metaKey&&!event.ctrlKey&&['ArrowUp','ArrowDown'].includes(event.key)) {
        const next=Math.max(0,Math.min(rows.length-1,Number(row.dataset.rowIndex)+(event.key==='ArrowDown'?1:-1)));
        state.select(next,{extend:event.shiftKey});target=rows[next];
      } else return;
      event.preventDefault();event.stopPropagation();this.sync(table);
      if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}
    });
  }
  state(table) { if(!this.states.has(table))this.states.set(table,new RowSelection());return this.states.get(table); }
  sync(table) {
    const state=this.states.get(table);if(!state)return;
    for(const row of table.querySelectorAll('tbody tr[data-row-index]')) {
      const selected=state.indices.has(Number(row.dataset.rowIndex));row.classList.toggle('row-selected',selected);row.setAttribute('aria-selected',String(selected));
    }
  }
  indicesFor(anchor) {
    const table=anchor.closest('.song-table');return table?[...this.state(table).indices].sort((a,b)=>a-b):[];
  }
  songsFor(anchor) {
    const table=anchor.closest('.song-table');return table?this.state(table).songs(this.getSongs(table)):undefined;
  }
  focusSong(table,id) {
    if(!table||!id)return false;
    const row=[...table.querySelectorAll('tbody tr[data-row-index]')].find(row=>row.dataset.songId===id);
    if(!row)return false;
    this.state(table).select(Number(row.dataset.rowIndex));this.sync(table);row.focus({preventScroll:true});row.scrollIntoView({block:'nearest'});return true;
  }
}
