const lyricTimelines=new WeakMap();
export function selectLyrics(data) {
  const options=data?.lyricsList?.structuredLyrics;
  if(!Array.isArray(options))return {line:[]};
  const populated=options.filter(item=>Array.isArray(item?.line)&&item.line.some(line=>typeof line?.value==='string'&&line.value.trim()));
  const primary=populated.filter(item=>!item.kind||item.kind==='main');
  const candidates=primary.length?primary:populated;
  const timed=candidates.filter(item=>item.synced===true&&item.line.some(line=>typeof line?.start==='number'&&Number.isFinite(line.start)&&line.start>=0));
  // Prefer real word timing when a server includes both legacy and enhanced copies.
  return timed.find(item=>Array.isArray(item.cueLine)&&item.cueLine.some(layer=>Number.isInteger(layer?.index)&&layer.index>=0&&lyricCueLayers(item,layer.index).length))||timed[0]||candidates.find(item=>item.synced===true)||candidates[0]||{line:[]};
}

export function lyricPosition(lyrics, seconds, duration=0) {
  if(!lyrics?.synced||!Number.isFinite(seconds))return {index:-1,progress:0};
  const time=seconds*1000+(Number(lyrics.offset)||0),lines=lyrics.line||[];
  let timeline=lyricTimelines.get(lyrics);
  if(!timeline||timeline.lines!==lines){timeline={lines,entries:lines.map((line,index)=>({index,start:line.start,end:line.end})).filter(line=>typeof line.start==='number'&&Number.isFinite(line.start)&&line.start>=0).sort((a,b)=>a.start-b.start||a.index-b.index)};lyricTimelines.set(lyrics,timeline);}
  const entries=timeline.entries;
  const active=entries.findLast(line=>line.start<=time);
  if(!active)return {index:-1,progress:0};
  const end=Number.isFinite(active.end)&&active.end>active.start?active.end:entries.find(line=>line.start>active.start)?.start||(Number.isFinite(duration)&&duration>0?duration*1000:active.start);
  return {index:active.index,progress:end>active.start?Math.max(0,Math.min(1,(time-active.start)/(end-active.start))):0};
}

export function seekTimeAt(clientX,left,width,duration) {
  if(![clientX,left,width,duration].every(Number.isFinite)||width<=0||duration<=0)return null;
  return Math.max(0,Math.min(1,(clientX-left)/width))*duration;
}

// The native word fill starts immediately; its two-pixel lift follows 100 ms later.
// Keep the completed word raised, including while paused or seeking backwards.
export function lyricCueMotion(start,end,milliseconds,reducedMotion=false) {
  const duration=end-start,clamp=value=>Math.max(0,Math.min(1,value));
  const progress=duration>0?clamp((milliseconds-start)/duration):milliseconds>=start?1:0;
  const lift=reducedMotion||milliseconds<=start+100?0:duration>0?-2*clamp((milliseconds-start-100)/duration):-2;
  return {progress,lift,current:milliseconds>=start&&milliseconds<end};
}

const lyricGraphemes=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function lyricCueGlyphs(text,start,end) {
  // Long Latin words in the native reference receive a staggered letter wave.
  // Keep connected scripts and untimed phrases intact rather than breaking shaping.
  if(!lyricGraphemes||!Number.isFinite(start)||!Number.isFinite(end)||end-start<2000||typeof text!=='string'||!/^\p{Script=Latin}[\p{Script=Latin}\p{Mark}\p{Number}\p{Punctuation}]*$/u.test(text))return null;
  const glyphs=Array.from(lyricGraphemes.segment(text),entry=>entry.segment);
  return glyphs.length>1?glyphs:null;
}

export function lyricLetterMotion(start,end,index,count,milliseconds,reducedMotion=false) {
  const letterStart=start+index*(end-start)/count;
  const phase=Math.max(0,Math.min(2,(milliseconds-letterStart)/500));
  const pulse=phase<=1?phase:2-phase;
  const progress=phase<=1?phase*11/12:(11+phase-1)/12;
  return {
    progress,
    lift:reducedMotion?0:phase===0?0:phase<=1?-2.05*phase:-2-.05*pulse,
    scale:reducedMotion?1:1+.05*pulse,
    blur:reducedMotion?0:phase<=1?10*phase:4+6*pulse,
    glow:reducedMotion?0:.4*pulse,
    current:milliseconds>=letterStart&&milliseconds<letterStart+1000
  };
}

// OpenSubsonic v2 cue offsets address UTF-8 bytes, not JS UTF-16 positions.
// Decode the original text instead of searching for possibly repeated words.
export function lyricCueLayers(lyrics,index) {
  if(!lyrics?.synced||!Array.isArray(lyrics.cueLine))return [];
  const layers=[];
  for(const layer of lyrics.cueLine.filter(layer=>layer?.index===index)){
    if(typeof layer.value!=='string'||!Array.isArray(layer.cue)||!layer.cue.length)continue;
    try{
      const bytes=new TextEncoder().encode(layer.value),decode=new TextDecoder('utf-8',{fatal:true}),segments=[];
      let cursor=0,previousTime=-Infinity;
      for(let i=0;i<layer.cue.length;i++){
        const cue=layer.cue[i],from=cue.byteStart,to=cue.byteEnd;
        if(!Number.isInteger(from)||!Number.isInteger(to)||from<cursor||to<from||to>=bytes.length||!Number.isFinite(cue.start)||cue.start<0||cue.start<previousTime)throw Error('Invalid lyric cue');
        const end=cue.end??layer.cue[i+1]?.start??layer.end??lyrics.line?.[index]?.end??cue.start;
        if(!Number.isFinite(end)||end<cue.start)throw Error('Invalid cue end');
        if(from>cursor)segments.push({text:decode.decode(bytes.slice(cursor,from))});
        segments.push({text:decode.decode(bytes.slice(from,to+1)),start:cue.start,end});cursor=to+1;previousTime=end;
      }
      if(cursor<bytes.length)segments.push({text:decode.decode(bytes.slice(cursor))});
      const agent=lyrics.agents?.find(agent=>agent.id===layer.agentId);
      layers.push({segments,secondary:!!agent&&agent.role!=='main',agentId:layer.agentId});
    }catch{return [];/* Keep the complete fallback line when any layer is malformed. */}
  }
  return layers.sort((a,b)=>Number(a.secondary)-Number(b.secondary));
}

export function lyricAlignment(lyrics,index) {
  const voices=Array.isArray(lyrics?.agents)?lyrics.agents.filter(agent=>agent?.role==='main'):[];
  const voice=lyricCueLayers(lyrics,index).find(layer=>!layer.secondary)?.agentId;
  return voices.length>1&&voices.findIndex(agent=>agent.id===voice)>0?'right':'left';
}

const scrolls=new WeakMap();
export function followLyric(container,line,{instant=false,anchor=.5,align='center'}={}) {
  stopLyricScroll(container);
  const viewport=container.getBoundingClientRect(),bounds=line.getBoundingClientRect();
  const initialOffset=line.offsetTop,initialHeight=line.offsetHeight,initialViewport=container.clientHeight;
  // Active lyric rows scale around their vertical centre. Anchor the layout
  // edge, not its transient scaled edge, so opening and changing lines agree.
  const edge=align==='start'?(bounds.height-initialHeight)/2:bounds.height/2;
  const desired=bounds.top+edge-viewport.top+container.scrollTop-initialViewport*anchor;
  // CSS padding/margin transitions keep changing layout after the active class
  // switches. Follow those layout offsets, excluding each row's visual spring.
  const destination=()=>Math.max(0,Math.min(container.scrollHeight-container.clientHeight,
    desired+line.offsetTop-initialOffset+(align==='start'?0:(line.offsetHeight-initialHeight)/2)-(container.clientHeight-initialViewport)*anchor));
  const top=destination();
  // Explicit instant writes prevent CSS scroll-behavior from adding a second
  // animation underneath the measured timeline.
  const position=top=>container.scrollTo({top,behavior:'instant'});
  if(instant){position(top);scrolls.delete(container);return;}
  const motion={frame:0,start:performance.now(),from:container.scrollTop};scrolls.set(container,motion);
  const tick=now=>{
    if(!container.isConnected||!line.isConnected){stopLyricScroll(container);return;}
    // Seven recorded native transitions fit a monotone ease-in-out movement
    // around 350 ms. Adjacent rows retain their relative position throughout.
    const t=Math.max(0,Math.min(1,(now-motion.start)/350)),ease=t<.5?2*t*t:1-2*(1-t)**2;
    const target=destination();
    position(t===1?target:motion.from+(target-motion.from)*ease);
    if(t<1)motion.frame=requestAnimationFrame(tick);else scrolls.delete(container);
  };
  motion.frame=requestAnimationFrame(tick);
}
export function stopLyricScroll(container){const motion=scrolls.get(container);if(motion)cancelAnimationFrame(motion.frame);scrolls.delete(container);}

// Preview a drag locally; the stream is sought once, on release. Timeupdate
// cannot fight the pointer. Playback continues during the preview, and cancelling
// leaves that running stream (or an already paused stream) untouched.
export class PlayerScrubber {
  constructor(audio,inputs,{preview,format,enabled=()=>true,tooltipFor=()=>true}={}) {
    this.audio=audio;this.inputs=inputs;this.preview=preview;this.format=format;this.enabled=enabled;this.tooltipFor=tooltipFor;this.drag=null;
    this.tip=document.createElement('output');this.tip.className='seek-preview';this.tip.setAttribute('popover','manual');this.tip.setAttribute('aria-hidden','true');
    for(const input of inputs){
      input.addEventListener('pointerdown',event=>{
        if(event.button!==0||!enabled()||this.drag)return;
        const duration=audio.duration,rect=input.getBoundingClientRect(),position=seekTimeAt(event.clientX,rect.left,rect.width,duration);
        if(position===null)return;
        event.preventDefault();input.classList.add('pointer-focus');input.focus({preventScroll:true});
        this.drag={input,id:event.pointerId,duration,rect,position};
        input.setPointerCapture(event.pointerId);input.classList.add('is-scrubbing');
        if(this.tooltipFor(input)){(input.closest('dialog')||document.body).append(this.tip);this.tip.showPopover();}this.update(position,event.clientX);
      });
      input.addEventListener('pointermove',event=>{if(this.drag?.input!==input||this.drag.id!==event.pointerId)return;const d=this.drag;this.update(seekTimeAt(event.clientX,d.rect.left,d.rect.width,d.duration),event.clientX);});
      input.addEventListener('pointerup',event=>{if(this.drag?.input===input&&this.drag.id===event.pointerId)this.finish(true);});
      input.addEventListener('pointercancel',()=>{if(this.drag?.input===input)this.finish(false);});
      input.addEventListener('lostpointercapture',()=>{if(this.drag?.input===input)this.finish(false);});
      input.addEventListener('input',()=>{
        if(this.drag||!enabled()||!Number.isFinite(audio.duration)||audio.duration<=0)return;
        const seconds=Number(input.value);if(!Number.isFinite(seconds))return;
        audio.currentTime=Math.max(0,Math.min(audio.duration,seconds));this.render(audio.currentTime);preview?.(audio.currentTime);
      });
      input.addEventListener('keydown',event=>{input.classList.remove('pointer-focus');if(event.key==='Escape'&&this.drag){event.preventDefault();event.stopPropagation();this.finish(false);}});
      input.addEventListener('blur',()=>input.classList.remove('pointer-focus'));
    }
    audio.addEventListener('loadstart',()=>this.finish(false));
    addEventListener('blur',()=>this.finish(false));
  }
  get active(){return !!this.drag;}
  get position(){return this.drag?.position??this.audio.currentTime;}
  render(seconds){
    if(this.drag)seconds=this.drag.position;
    const duration=this.drag?.duration||this.audio.duration,percent=Number.isFinite(duration)&&duration>0?Math.max(0,Math.min(100,seconds/duration*100)):0;
    for(const input of this.inputs){
      // Native range keyboard steps are seconds, independent of track length.
      // Only the visual fill is a percentage; pointer previews retain precision.
      input.max=Number.isFinite(duration)&&duration>0?Math.max(1,Math.floor(duration)):1;
      input.step=1;input.value=Math.max(0,Math.min(Number(input.max),Math.floor(seconds)||0));
      input.style.setProperty('--range-progress',percent+'%');
      if(this.format)input.setAttribute('aria-valuetext',this.format(seconds)+' von '+this.format(Number.isFinite(duration)?duration:0));
    }
  }
  update(position,x){
    if(!this.drag||position===null)return;this.drag.position=position;this.render(position);this.preview?.(position);
    if(!this.tooltipFor(this.drag.input))return;
    const rect=this.drag.rect;this.tip.textContent=this.format?.(position)||String(Math.round(position));
    this.tip.style.left=Math.max(42,Math.min(innerWidth-42,Math.max(rect.left,Math.min(rect.right,x))))+'px';this.tip.style.top=Math.max(8,rect.top-40)+'px';
  }
  finish(commit){
    const drag=this.drag;if(!drag)return;this.drag=null;drag.input.classList.remove('is-scrubbing');this.tip.hidePopover();
    if(drag.input.hasPointerCapture(drag.id))drag.input.releasePointerCapture(drag.id);
    if(commit)this.audio.currentTime=drag.position;
    this.render(this.audio.currentTime);this.preview?.(this.audio.currentTime);
  }
}
