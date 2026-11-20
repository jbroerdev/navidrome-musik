// The destination is a gap in the original list, before any entries are lifted.
export function movePlaylistEntries(length, indices, boundary) {
  if(!Number.isInteger(length)||length<0||!Array.isArray(indices)||!indices.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=length)||!Number.isInteger(boundary)||boundary<0||boundary>length)throw Error('Ungültige Titelauswahl.');
  const selected=[...indices].sort((a,b)=>a-b),set=new Set(selected),remaining=Array.from({length},(_,i)=>i).filter(i=>!set.has(i));
  const insertion=boundary-selected.filter(i=>i<boundary).length;
  remaining.splice(insertion,0,...selected);return remaining;
}

export class PlaylistReorder {
  constructor(root,{context,selection,save,failed}) {
    this.root=root;this.context=context;this.selection=selection;this.save=save;this.failed=failed;this.drag=null;this.busy=false;
    const rowFor=target=>target.closest?.('table[data-reorder-playlist] tbody tr[data-row-index]');
    root.addEventListener('dragstart',event=>{
      const row=rowFor(event.target),context=this.context();
      if(!row||!context||this.busy){if(row)event.preventDefault();return;}
      const table=row.closest('table'),index=Number(row.dataset.rowIndex),selected=selection.state(table);
      if(!selected.indices.has(index)){selected.select(index);selection.sync(table);}
      this.drag={...context,songIds:[...context.songIds],indices:[...selected.indices].sort((a,b)=>a-b),table};
      event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-musik-playlist',context.id);
      event.dataTransfer.setData('text/plain',row.querySelector('.song-name-text')?.textContent||'');
    });
    root.addEventListener('dragover',event=>{
      const row=rowFor(event.target),context=this.context();if(!row||!this.matches(context)||row.closest('table')!==this.drag.table)return;
      event.preventDefault();event.dataTransfer.dropEffect='move';this.clearMarkers();
      const after=event.clientY>=row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
      row.classList.add(after?'reorder-after':'reorder-before');this.drag.boundary=Number(row.dataset.rowIndex)+(after?1:0);
    });
    root.addEventListener('drop',async event=>{
      const row=rowFor(event.target),context=this.context(),drag=this.drag;
      if(!row||!this.matches(context)||row.closest('table')!==drag.table)return;
      event.preventDefault();const after=event.clientY>=row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
      const order=movePlaylistEntries(drag.songIds.length,drag.indices,Number(row.dataset.rowIndex)+(after?1:0));
      this.cancel();if(order.every((index,i)=>index===i))return;
      this.busy=true;drag.table.setAttribute('aria-busy','true');
      try{await this.save({...drag,table:undefined,order});}catch(error){this.failed(error,drag);}finally{this.busy=false;drag.table.removeAttribute('aria-busy');}
    });
    root.addEventListener('dragend',()=>this.cancel());
    root.addEventListener('dragleave',event=>{if(!root.contains(event.relatedTarget))this.clearMarkers();});
  }
  matches(context){const d=this.drag;return !!d&&!!context&&context.id===d.id&&context.scope===d.scope&&context.songIds.length===d.songIds.length&&context.songIds.every((id,i)=>id===d.songIds[i]);}
  clearMarkers(){for(const row of this.root.querySelectorAll('.reorder-before,.reorder-after'))row.classList.remove('reorder-before','reorder-after');}
  cancel(){this.clearMarkers();this.drag=null;}
}
