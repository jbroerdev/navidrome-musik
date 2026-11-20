export class PlaybackQueue {
  constructor({random = Math.random} = {}) {
    this.random = random;
    this.clear();
  }

  clear() {
    this.items = [];
    this.index = -1;
    this.shuffle = false;
    this.repeat = 0;
    this.history = [];
    this.future = [];
    this.bag = [];
  }

  shuffledIndices() {
    const indices = this.items.map((_, index) => index);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  replace(items, index = 0) {
    this.items = [...items];
    this.index = -1;
    this.history = [];
    this.future = [];
    this.bag = this.shuffledIndices();
    return this.select(this.items.length ? Math.max(0, Math.min(index, this.items.length - 1)) : -1);
  }

  activate(items, index) {
    const song = items[index];
    if (!song || !Number.isInteger(index)) return null;
    if (song.id != null && song.id === this.items[this.index]?.id) return {action:'toggle', index:this.index};
    return {action:'play', index:this.replace(items,index)};
  }

  setShuffle(enabled) {
    if (this.shuffle === Boolean(enabled)) return;
    this.shuffle = Boolean(enabled);
    this.future = [];
    this.bag = this.shuffledIndices().filter(index => index !== this.index);
  }

  select(index, {record = true, preserveFuture = false} = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return null;
    if (index === this.index) return index;
    if (record && this.index >= 0) this.history.push(this.index);
    if (!preserveFuture) this.future = [];
    if (this.index < 0 && !this.bag.length) this.bag = this.shuffledIndices();
    this.index = index;
    this.bag = this.bag.filter(value => value !== index);
    return index;
  }

  next({automatic = false} = {}) {
    if (!this.items.length) return null;
    if (this.index < 0) return this.select(0);
    if (automatic && this.repeat === 2) return this.index;
    if (this.future.length) return this.select(this.future.pop(), {preserveFuture: true});
    if (this.shuffle) {
      if (!this.bag.length) {
        if (!this.repeat) return null;
        this.bag = this.shuffledIndices();
        if (this.bag.length > 1 && this.bag[0] === this.index) {
          [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
        }
      }
      return this.select(this.bag[0]);
    }
    if (this.index + 1 < this.items.length) return this.select(this.index + 1);
    return this.repeat ? this.select(0) : null;
  }

  previous() {
    if (this.index < 0) return null;
    const target = this.history.length ? this.history.pop() : this.shuffle ? this.index : Math.max(0, this.index - 1);
    if (target !== this.index) this.future.push(this.index);
    return this.select(target, {record: false, preserveFuture: true});
  }

  upcoming() {
    if (this.index < 0) return this.items.map((_, index) => index);
    const future = [...this.future].reverse();
    if (this.shuffle) return [...future, ...this.bag];
    const tail = this.future.length ? this.future[0] : this.index;
    return [...future, ...this.items.map((_, index) => index).filter(index => index > tail)];
  }

  insert(item, position = this.items.length, {next = false} = {}) {
    position = Math.max(0, Math.min(position, this.items.length));
    const shift = indices => indices.map(index => index >= position ? index + 1 : index);
    this.history = shift(this.history);
    this.future = shift(this.future);
    this.bag = shift(this.bag);
    if (this.index >= position) this.index++;
    this.items.splice(position, 0, item);
    if (this.index >= 0) {
      if (next && (this.shuffle || this.future.length)) this.future.push(position);
      else if (this.shuffle) this.bag.push(position);
    }
    return position;
  }

  addMany(items, {next = false} = {}) {
    if (next) {
      // Insert in reverse so both the normal queue and shuffle's future stack
      // play the collection in its original order, immediately after this song.
      for (const item of [...items].reverse()) this.insert(item, this.index + 1, {next: true});
    } else {
      for (const item of items) this.insert(item);
    }
  }

  clearUpcoming() {
    for (const index of [...new Set(this.upcoming())].sort((a, b) => b - a)) this.remove(index);
  }

  remove(index) {
    if (index < 0 || index >= this.items.length || index === this.index) return false;
    const shift = indices => indices.filter(value => value !== index).map(value => value > index ? value - 1 : value);
    this.history = shift(this.history);
    this.future = shift(this.future);
    this.bag = shift(this.bag);
    this.items.splice(index, 1);
    if (this.index > index) this.index--;
    return true;
  }
}


// Listening time is monotonic elapsed playback, never the seek position.
export class ScrobbleTracker {
 constructor({report,now=()=>performance.now(),wall=Date.now,makeId=()=>crypto.randomUUID()}={}){Object.assign(this,{report,now,wall,makeId});this.reset();}
 reset(){this.song=null;this.active=false;this.last=this.now();this.listened=0;this.submitted=false;this.startedAt=null;this.playId=null;}
 start(song){this.finish();if(!song?.id)return;this.song={id:song.id,duration:Number(song.duration)||0};this.playId=this.makeId();this.last=this.now();}
 emit(submission){this.report?.({id:this.song.id,playId:this.playId,time:submission?this.startedAt:this.wall(),submission});}
 sample(duration){
  const at=this.now();if(this.active)this.listened+=Math.max(0,(at-this.last)/1000);this.last=at;
  if(this.song&&Number.isFinite(duration)&&duration>0)this.song.duration=duration;
  if(this.song&&!this.submitted&&this.startedAt!==null&&this.song.duration>=30&&this.listened>=Math.max(30,Math.min(this.song.duration/2,240))){this.submitted=true;this.emit(true);}
 }
 resume(){if(!this.song||this.active)return;this.last=this.now();this.active=true;if(this.startedAt===null)this.startedAt=this.wall();this.emit(false);}
 pause(duration){this.sample(duration);this.active=false;}
 finish(duration){this.pause(duration);this.reset();}
}
