import test from 'node:test';
import assert from 'node:assert/strict';
import {selectLyrics,lyricPosition,lyricCueLayers,lyricAlignment,lyricCueMotion,lyricCueGlyphs,lyricLetterMotion,seekTimeAt,PlayerScrubber,followLyric,stopLyricScroll} from './public/player-motion.js';

test('Long-note glyphs preserve graphemes and leave short cues, phrases and connected scripts intact',()=>{
 assert.deepEqual(lyricCueGlyphs('Ghetto',1000,3727),['G','h','e','t','t','o']);
 assert.deepEqual(lyricCueGlyphs('E\u0301cho',1000,3727),['E\u0301','c','h','o']);
 for(const text of ['مرحبا','long phrase','👨‍👩‍👧‍👦','A',''])assert.equal(lyricCueGlyphs(text,0,3000),null);
 assert.equal(lyricCueGlyphs('Pulverreste',0,1019),null);
 assert.equal(lyricCueGlyphs('Ghetto',undefined,3727),null);
});

test('Long-note letters follow the measured rise, glow and release without inventing word timings',()=>{
 const rising=lyricLetterMotion(1000,3727,0,6,1227);
 assert.ok(Math.abs(rising.scale-1.0227)<1e-9);
 assert.ok(Math.abs(rising.lift+.9307)<1e-9);
 assert.ok(Math.abs(rising.blur-4.54)<1e-9);
 assert.ok(Math.abs(rising.glow-.1816)<1e-9);
 assert.ok(Math.abs((rising.progress*120-20)-29.94)<1e-9);
 const falling=lyricLetterMotion(1000,3727,1,6,1000+454.5+772.5);
 assert.ok(Math.abs(falling.scale-1.02275)<1e-9);
 assert.ok(Math.abs(falling.lift+2.02275)<1e-9);
 assert.ok(Math.abs(falling.blur-6.73)<1e-9);
 assert.ok(Math.abs(falling.glow-.182)<1e-9);
 const future=lyricLetterMotion(1000,3727,5,6,2000);
 assert.equal(future.progress,0);assert.equal(future.scale,1);assert.equal(future.lift,0);
 const ended=lyricLetterMotion(1000,3727,0,6,2500);
 assert.equal(ended.progress,1);assert.equal(ended.scale,1);assert.equal(ended.lift,-2);assert.equal(ended.glow,0);
 const reduced=lyricLetterMotion(1000,3727,0,6,1227,true);
 assert.equal(reduced.progress,rising.progress);assert.equal(reduced.scale,1);assert.equal(reduced.lift,0);assert.equal(reduced.glow,0);
});

test('Word lift follows the recorded 100 ms delay and holds its endpoint across pauses and seeks',()=>{
 // Original captures: duration, gradient first stop (%), rendered translateY (px).
 for(const [duration,gradient,lift] of [[296,55.44594594655007,-.581757],[335,73.92,-.968532],[571,92.39,-1.52303]]){
  const elapsed=(gradient+20)/120*duration;
  assert.ok(Math.abs(lyricCueMotion(1000,1000+duration,1000+elapsed).lift-lift)<.001);
 }
 assert.deepEqual(lyricCueMotion(1000,1500,1050),{progress:.1,lift:0,current:true});
 assert.deepEqual(lyricCueMotion(1000,1500,1750),{progress:1,lift:-2,current:false});
 assert.deepEqual(lyricCueMotion(1000,1500,900),{progress:0,lift:0,current:false});
 assert.deepEqual(lyricCueMotion(1000,1500,1250,true),{progress:.5,lift:0,current:true});
 assert.deepEqual(lyricCueMotion(1000,1000,1200),{progress:1,lift:-2,current:false});
});

test('Lyric follow tracks changing layout during a line transition and cancels a detached row',t=>{
 const previousRAF=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
 let callback,cancelled=0;t.mock.method(performance,'now',()=>0);
 globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};globalThis.cancelAnimationFrame=()=>cancelled++;
 t.after(()=>{if(previousRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRAF;if(previousCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previousCancel;});
 for(const align of ['start','center']){
  const container={scrollTop:0,clientHeight:200,scrollHeight:2000,isConnected:true,getBoundingClientRect:()=>({top:0,bottom:200}),scrollTo({top,behavior}){assert.equal(behavior,'instant');this.scrollTop=top;}};
  const line={offsetTop:600,offsetHeight:60,isConnected:true,dataset:{line:'5'},getBoundingClientRect:()=>({top:600,height:60})};
  followLyric(container,line,{anchor:.5,align});
  line.offsetTop=576;line.offsetHeight=84;callback(850);
  assert.equal(container.scrollTop,align==='start'?476:518);
  followLyric(container,line);line.isConnected=false;callback(900);assert.ok(cancelled>0);
  stopLyricScroll(container);
 }
});

test('Opening an already scaled lyric and switching into it preserve the same layout anchor',t=>{
 const previousRAF=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
 let callback;t.mock.method(performance,'now',()=>0);
 globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};
 t.after(()=>{if(previousRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRAF;if(previousCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previousCancel;});
 for(const scale of [1,1.025,1.05]){
  const container={scrollTop:0,clientHeight:200,scrollHeight:2000,isConnected:true,getBoundingClientRect:()=>({top:0}),scrollTo({top}){this.scrollTop=top;}};
  const line={offsetTop:600,offsetHeight:60,isConnected:true,getBoundingClientRect:()=>({top:600-(60*scale-60)/2,height:60*scale})};
  followLyric(container,line,{anchor:.5,align:'start'});
  line.offsetTop=576;line.offsetHeight=84;callback(350);
  assert.equal(container.scrollTop,476);
  stopLyricScroll(container);
 }
});

test('Duet alignment uses supplied vocal agents and never guesses a singer from text',()=>{
 const lyrics={synced:true,line:[{start:0,end:1000,value:'Echo'}],agents:[{id:'a',role:'main'},{id:'b',role:'main'},{id:'c',role:'background'}],cueLine:[{index:0,agentId:'b',value:'Echo',cue:[{start:0,end:1000,byteStart:0,byteEnd:3}]}]};
 assert.equal(lyricAlignment(lyrics,0),'right');
 assert.equal(lyricAlignment({...lyrics,agents:[{id:'b',role:'main'}]},0),'left');
 assert.equal(lyricAlignment({...lyrics,cueLine:[{...lyrics.cueLine[0],agentId:'a'}]},0),'left');
 assert.equal(lyricAlignment({...lyrics,cueLine:[]},0),'left');
});

test('Lyric follow reaches its anchor monotonically without a second native smooth scroll or row bounce',t=>{
 const previousRAF=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
 let callback;t.mock.method(performance,'now',()=>0);
 globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};
 t.after(()=>{if(previousRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRAF;if(previousCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previousCancel;});
 for(const [from,target] of [[0,530],[800,530]]){
  const positions=[],container={scrollTop:from,clientHeight:200,scrollHeight:2000,isConnected:true,getBoundingClientRect:()=>({top:0,bottom:200}),scrollTo({top,behavior}){assert.equal(behavior,'instant');positions.push(top);this.scrollTop=top;},querySelectorAll(){throw Error('Rows must not receive an independent translation');}};
  const line={offsetTop:600,offsetHeight:60,isConnected:true,dataset:{line:'5'},getBoundingClientRect:()=>({top:600-from,height:60})};
  followLyric(container,line);
  for(const time of [0,87.5,175,262.5,350])callback(time);
  assert.deepEqual(positions,[from,from+(target-from)*.125,from+(target-from)*.5,from+(target-from)*.875,target]);
  stopLyricScroll(container);
 }
});

test('Empty lyric tracks cannot hide populated lyrics, and selecting preserves text and gaps',()=>{
 const track={synced:true,line:[{start:0,value:'  Song text  '},{start:1000,value:''},{start:2000,value:'Next'}]};
 const entries=[null,{synced:true,line:[]},{kind:'main',synced:true,line:[{start:0,value:'  '}]},track];
 const before=JSON.stringify(entries);
 assert.equal(selectLyrics({lyricsList:{structuredLyrics:entries}}),track);
 assert.equal(JSON.stringify(entries),before);
 for(const data of [undefined,{}, {lyricsList:{structuredLyrics:{}}},{lyricsList:{structuredLyrics:entries.slice(0,3)}}])assert.deepEqual(selectLyrics(data),{line:[]});
});

test('Primary text takes precedence over translations; secondary text remains a usable fallback',()=>{
 const translation={kind:'translation',synced:true,line:[{start:0,value:'Translation'}]};
 const main={kind:'main',synced:false,line:[{value:'Original'}]};
 const legacy={synced:true,line:[{start:0,value:'Legacy original'}]};
 assert.equal(selectLyrics({lyricsList:{structuredLyrics:[translation,main]}}),main);
 assert.equal(selectLyrics({lyricsList:{structuredLyrics:[translation,legacy]}}),legacy);
 assert.equal(selectLyrics({lyricsList:{structuredLyrics:[translation]}}),translation);
});

test('Valid enhanced word timings win over a legacy copy without accepting malformed cues',()=>{
 const plain={kind:'main',synced:true,line:[{start:0,end:1000,value:'Echo'}]};
 const malformed={...plain,cueLine:[null,{index:0,value:'Echo',cue:[{start:0,end:1000,byteStart:0,byteEnd:40}]}]};
 const enhanced={...plain,cueLine:[{index:0,value:'Echo',cue:[{start:0,end:1000,byteStart:0,byteEnd:3}]}]};
 assert.equal(selectLyrics({lyricsList:{structuredLyrics:[plain,malformed,enhanced]}}),enhanced);
 assert.equal(selectLyrics({lyricsList:{structuredLyrics:[plain,malformed]}}),plain);
});

test('An invalid synced timestamp does not displace genuinely timed lyrics',()=>{
 const invalid={synced:true,line:[{start:'100',value:'Invalid time'}]};
 const valid={synced:true,line:[{start:100,value:'Timed'}]};
 assert.equal(selectLyrics({lyricsList:{structuredLyrics:[invalid,valid]}}),valid);
});

test('Lyrics locate the current line after forward/backward seeks and apply millisecond offsets',()=>{
 const lyrics={synced:true,offset:500,line:[{start:1000,value:'first'},{start:5000,value:'next'},{start:10000,value:'last'}]};
 assert.equal(lyricPosition(lyrics,0,20).index,-1);
 assert.equal(lyricPosition(lyrics,.5,20).index,0);
 assert.deepEqual(lyricPosition(lyrics,7,20),{index:1,progress:.5});
 assert.equal(lyricPosition(lyrics,15,20).index,2);
 assert.equal(lyricPosition(lyrics,2,20).index,0);
 assert.equal(lyricPosition(lyrics,100,20).progress,1);
 assert.equal(lyricPosition({synced:true,line:[{start:0,end:2000},{start:10000}]},4,20).progress,1);
});

test('Untimed lyrics do not invent playback positions; malformed timestamps are skipped',()=>{
 assert.equal(lyricPosition({synced:false,line:[{start:0}]},10).index,-1);
 assert.equal(lyricPosition(null,10).index,-1);
 assert.equal(lyricPosition({synced:true,line:[{value:'no time'},{start:NaN},{start:-1},{start:4000},{start:1000}]},2).index,4);
 assert.deepEqual(lyricPosition({synced:true,line:[{start:0}]},5),{index:0,progress:0});
});

test('Seeking clamps outside the bar and rejects unseekable durations',()=>{
 assert.equal(seekTimeAt(200,100,200,120),60);
 assert.equal(seekTimeAt(-100,100,200,120),0);
 assert.equal(seekTimeAt(700,100,200,120),120);
 for(const [width,duration] of [[0,120],[200,0],[200,Infinity],[200,NaN]])assert.equal(seekTimeAt(200,100,width,duration),null);
});

function setup(t){
 const saved={document:globalThis.document,addEventListener:globalThis.addEventListener,innerWidth:globalThis.innerWidth};
 const tip={style:{},setAttribute(){},showPopover(){this.open=true;},hidePopover(){this.open=false;}};
 globalThis.document={createElement:()=>tip,body:{append(){}}};globalThis.addEventListener=()=>{};globalThis.innerWidth=1000;
 t.after(()=>{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 class Input extends EventTarget{constructor(){super();this.value=0;this.style={setProperty(){}};this.classList={add(){},remove(){}};this.attributes={};}setAttribute(k,v){this.attributes[k]=v;}getBoundingClientRect(){return {left:100,right:300,width:200,top:200};}focus(){}closest(){return null;}setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=null;}}
 class Audio extends EventTarget{constructor(){super();this.duration=100;this.paused=false;this._time=20;this.seeks=[];this.plays=0;}get currentTime(){return this._time;}set currentTime(value){this._time=value;this.seeks.push(value);}pause(){this.paused=true;}play(){this.paused=false;this.plays++;return Promise.resolve();}}
 const audio=new Audio(),input=new Input(),other=new Input(),previews=[];
 const scrubber=new PlayerScrubber(audio,[input,other],{preview:time=>previews.push(time),format:time=>String(time)});
 const pointer=(type,x=200)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{button:0,clientX:x,pointerId:1});input.dispatchEvent(event);};
 return {audio,input,other,tip,scrubber,pointer,previews};
}

test('A captured drag previews both sliders, resists clock updates and seeks the stream only on release',t=>{
 const {audio,input,other,tip,scrubber,pointer}=setup(t);
 pointer('pointerdown');assert.equal(audio.paused,false);assert.equal(scrubber.active,true);assert.equal(input.value,50);assert.equal(other.value,50);assert.equal(tip.open,true);assert.deepEqual(audio.seeks,[]);
 scrubber.render(audio.currentTime);assert.equal(input.value,50);
 pointer('pointermove',400);assert.equal(input.value,100);assert.deepEqual(audio.seeks,[]);
 pointer('pointerup',400);assert.deepEqual(audio.seeks,[100]);assert.equal(audio.paused,false);assert.equal(audio.plays,0);assert.equal(scrubber.active,false);assert.equal(tip.open,false);
});

test('Cancelling a drag leaves the stream running at its current position without restarting playback',t=>{
 const {audio,scrubber,pointer}=setup(t);audio.paused=true;
 pointer('pointerdown');pointer('pointermove',280);pointer('pointercancel');
 assert.equal(audio.currentTime,20);assert.deepEqual(audio.seeks,[]);assert.equal(audio.paused,true);assert.equal(audio.plays,0);assert.equal(scrubber.active,false);
 audio.paused=false;pointer('pointerdown');audio._time=23;pointer('pointercancel');assert.equal(audio.currentTime,23);assert.equal(audio.paused,false);assert.equal(audio.plays,0);assert.deepEqual(audio.seeks,[]);
});

test('Releasing a drag preserves a pause or playback change made while the pointer was held',t=>{
 const {audio,pointer}=setup(t);
 pointer('pointerdown');audio.paused=true;pointer('pointerup');assert.equal(audio.paused,true);assert.equal(audio.plays,0);
 pointer('pointerdown');audio.paused=false;pointer('pointerup');assert.equal(audio.paused,false);assert.equal(audio.plays,0);
});

test('Keyboard seeking remains immediate and a new stream cancels a pending drag without resuming it',t=>{
 const {audio,input,scrubber,pointer}=setup(t);input.value=35;input.dispatchEvent(new Event('input'));assert.deepEqual(audio.seeks,[35]);
 pointer('pointerdown');audio.dispatchEvent(new Event('loadstart'));assert.equal(scrubber.active,false);assert.equal(audio.plays,0);
 audio.duration=Infinity;pointer('pointerdown');assert.equal(scrubber.active,false);
});

test('Timeline values use seconds for long tracks while pointer seeks retain subsecond precision',t=>{
 const {audio,input,other,scrubber,pointer}=setup(t);audio.duration=240.75;
 scrubber.render(31.4);assert.equal(input.max,240);assert.equal(input.step,1);assert.equal(input.value,31);assert.equal(other.value,31);
 input.value=32;input.dispatchEvent(new Event('input'));assert.equal(audio.currentTime,32);
 pointer('pointerdown',200);assert.equal(scrubber.position,120.375);assert.equal(input.value,120);
 pointer('pointerup',200);assert.equal(audio.currentTime,120.375);
 input.value=999;input.dispatchEvent(new Event('input'));assert.equal(audio.currentTime,240.75);
 input.value='invalid';input.dispatchEvent(new Event('input'));assert.equal(audio.currentTime,240.75);
});


test('Word cues use inclusive UTF-8 offsets and preserve repeated words, emoji and whitespace',()=>{
 const value='夜 🌙 夜',lyrics={synced:true,line:[{start:0,value}],cueLine:[{index:0,value,cue:[{start:0,end:1000,byteStart:0,byteEnd:2,value:'do not substitute'},{start:1000,end:2000,byteStart:4,byteEnd:7},{start:2000,end:3000,byteStart:9,byteEnd:11}]}]};
 const [layer]=lyricCueLayers(lyrics,0);assert.deepEqual(layer.segments.map(s=>s.text),['夜',' ','🌙',' ','夜']);assert.equal(layer.segments[2].start,1000);assert.equal(layer.segments[4].end,3000);
});

test('Malformed or unsynced word cues fall back instead of estimating missing word positions',()=>{
 const lyrics={synced:true,line:[{start:0,value:'夜'}],cueLine:[{index:0,value:'夜',cue:[{start:0,end:100,byteStart:1,byteEnd:2}]}]};
 assert.deepEqual(lyricCueLayers(lyrics,0),[]);
 assert.deepEqual(lyricCueLayers({...lyrics,synced:false},0),[]);
 assert.deepEqual(lyricCueLayers({synced:true,line:[{start:0,value:'plain'}]},0),[]);
 assert.deepEqual(lyricCueLayers({...lyrics,cueLine:[{index:0,value:'abc',cue:[{start:200,end:100,byteStart:0,byteEnd:2}]}]},0),[]);
});

test('Independent vocal layers retain their own text and inferred ends use supplied timestamps only',()=>{
 const lyrics={synced:true,line:[{start:0,end:2000,value:'A B'}],agents:[{id:'background',role:'background'},{id:'lead',role:'main'}],cueLine:[{index:0,agentId:'background',value:'B',cue:[{start:0,byteStart:0,byteEnd:0}]},{index:0,agentId:'lead',value:'A',cue:[{start:0,end:1500,byteStart:0,byteEnd:0}]}]};
 const layers=lyricCueLayers(lyrics,0);assert.equal(layers[0].agentId,'lead');assert.equal(layers[1].segments[0].end,2000);assert.equal(layers[1].secondary,true);
});
