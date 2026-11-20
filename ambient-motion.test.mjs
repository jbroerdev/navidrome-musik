import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paintAmbientField,coverMotionPalette,AmbientBackdrop} from './public/ambient-backdrop.js';

test('Backdrop draws every display frame and cover fades use elapsed time',()=>{
 const previousDocument=globalThis.document,previousRAF=globalThis.requestAnimationFrame;
 try {
  globalThis.document={hidden:false};globalThis.requestAnimationFrame=()=>1;
  const run=rate=>{
   const frames=[];
   const backdrop=Object.assign(Object.create(AmbientBackdrop.prototype),{dialog:{open:true},lastTime:null,palette:[[10,20,30]],target:[[110,120,130]],draw:time=>frames.push(time)});
   for(let frame=0;frame<=rate;frame++)backdrop.tick(frame*1000/rate);
   return {frames,palette:backdrop.palette};
  };
  const slow=run(30),normal=run(60),fast=run(120);
  assert.equal(normal.frames.length,61);
  assert.equal(fast.frames.length,121);
  for(let channel=0;channel<3;channel++){
   assert.ok(Math.abs(slow.palette[0][channel]-normal.palette[0][channel])<1e-9);
   assert.ok(Math.abs(fast.palette[0][channel]-normal.palette[0][channel])<1e-9);
  }
  assert.ok(normal.palette[0][0]>75&&normal.palette[0][0]<90);
 } finally {
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRAF;
 }
});

test('Dark cover blues and chromatic violet accents survive palette extraction',()=>{
 const pixels=[];
 for(const [colour,count]of [[[10,20,50,255],100],[[70,130,190,255],50],[[40,30,80,255],15],[[255,0,0,0],200]])for(let i=0;i<count;i++)pixels.push(...colour);
 const palette=coverMotionPalette(pixels);
 assert.ok(palette.some(([r,g,b])=>b>180&&g<40));
 assert.ok(palette.every(colour=>colour.every(value=>Number.isFinite(value)&&value>=0&&value<=255)));
 assert.ok(palette.every(([r,,b])=>b>r));
 assert.equal(coverMotionPalette([255,255,255,255,0,0,0,0]),null);
});

test('Nearly grey cover pixels cannot become a saturated purple accent beside blue artwork',()=>{
 const pixels=[];
 for(const [colour,count]of [[[18,30,52,255],100],[[98,145,184,255],50],[[93,91,98,255],30]])for(let i=0;i<count;i++)pixels.push(...colour);
 const palette=coverMotionPalette(pixels);
 assert.ok(palette.length>0);
 assert.ok(palette.every(([r,,b])=>r<20&&b>180));
});

test('Ambient fields deform over time without changing the cover palette into white',()=>{
 const width=48,height=32,palette=[[0,55,190],[10,25,95],[15,100,160]],a=new Uint8ClampedArray(width*height*4),b=new Uint8ClampedArray(a.length),copy=new Uint8ClampedArray(a.length);
 paintAmbientField(a,width,height,0,palette);paintAmbientField(b,width,height,4,palette);paintAmbientField(copy,width,height,0,palette);
 assert.deepEqual(a,copy);assert.notDeepEqual(a,b);
 let change=0;for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],255);assert.ok(a[i]<20);assert.ok(a[i+2]<=190);change+=Math.abs(a[i+2]-b[i+2]);}
 assert.ok(change/(width*height)>5);
});

test('Mostly grey artwork retains neutral fields beside its small warm accent',()=>{
 const pixels=[];
 for(const [colour,count] of [[[65,63,62,255],210],[[99,97,98,255],200],[[140,139,139,255],180],[[92,70,59,255],45],[[91,54,34,255],25]])for(let i=0;i<count;i++)pixels.push(...colour);
 const palette=coverMotionPalette(pixels);
 assert.ok(palette.some(color=>Math.max(...color)-Math.min(...color)<8&&Math.max(...color)>40));
 assert.ok(palette.some(([r,g,b])=>r>g+30&&g>b));
 assert.ok(palette.every(color=>Math.max(...color)<=115));
 const data=new Uint8ClampedArray(48*32*4);paintAmbientField(data,48,32,2,palette);
 let neutral=0,warm=0;
 for(let i=0;i<data.length;i+=4){const c=[data[i],data[i+1],data[i+2]];if(Math.max(...c)>25&&Math.max(...c)-Math.min(...c)<12)neutral++;if(c[0]>c[2]+15)warm++;}
 assert.ok(neutral>20&&warm>20);
});
test('An empty cover palette still renders an opaque neutral background',()=>{
 const data=new Uint8ClampedArray(16*12*4);paintAmbientField(data,16,12,1,[]);
 for(let i=0;i<data.length;i+=4){assert.equal(data[i+3],255);assert.ok(data[i+2]>=data[i]);}
});

test('Dark neutral artwork keeps visible grey fields around its warm accent',()=>{
 const pixels=[];
 for(const [colour,count] of [[[29,29,27,255],500],[[60,56,53,255],220],[[160,150,145,255],150],[[90,60,30,255],80]])for(let i=0;i<count;i++)pixels.push(...colour);
 const palette=coverMotionPalette(pixels),levels=[];
 for(let time=0;time<=60;time+=3){
  const width=48,height=64,data=new Uint8ClampedArray(width*height*4);
  paintAmbientField(data,width,height,time,palette);
  for(let y=0;y<height;y++)for(const x of [1,2,45,46]){
   const i=(y*width+x)*4;
   levels.push(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722);
  }
 }
 levels.sort((a,b)=>a-b);
 const average=levels.reduce((sum,value)=>sum+value,0)/levels.length;
 // Broad bounds from the matched native-cover comparison allow field phase
 // differences while catching the former almost-black border at every phase.
 assert.ok(average>25&&average<65);
 assert.ok(levels[Math.floor(levels.length*.9)]>50&&levels[Math.floor(levels.length*.9)]<100);
});

test('Other neutral artwork retains its measured grey coverage without washing out',()=>{
 const pixels=JSON.parse(readFileSync(new URL('./test-fixtures/neutral-cover.json',import.meta.url),'utf8'));
 const palette=coverMotionPalette(pixels);let count=0,green=0,neutral=0;
 for(let time=0;time<60;time+=2){
  const width=80,height=38,data=new Uint8ClampedArray(width*height*4);
  paintAmbientField(data,width,height,time,palette);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const u=x/width,v=y/height;
   if(!((u<.096&&v>.055&&v<.937)||(u>.443&&v<.066)||(u>.443&&u<.9375&&v>.937)))continue;
   const i=(y*width+x)*4,c=[data[i],data[i+1],data[i+2]];
   count++;green+=c[1];
   if(Math.max(...c)>25&&Math.max(...c)-Math.min(...c)<12)neutral++;
  }
 }
 // Recorded native fields average ~21 in green and ~16% visible neutral
 // coverage. Bounds allow phase/sampling differences, but reject a grey wash.
 assert.ok(green/count>15&&green/count<27);
 assert.ok(neutral/count>.06&&neutral/count<.3);
});

test('Blue fields keep reference highlight levels without losing broad colour coverage',()=>{
 const width=80,height=53,palette=[[13,91,230],[12,135,220]],peaks=[];
 let n=0,blue=0,green=0,dark=0;
 for(let time=0;time<=60;time+=3){
  const data=new Uint8ClampedArray(width*height*4);paintAmbientField(data,width,height,time,palette);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const u=x/width,v=y/height;
   if(!((u<.096&&v>.055&&v<.937)||(u>.443&&v<.066)||(u>.443&&u<.9375&&v>.937)))continue;
   const i=(y*width+x)*4,luma=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
   n++;blue+=data[i+2];green+=data[i+1];if(luma<20)dark++;peaks.push(Math.max(data[i],data[i+1],data[i+2]));
  }
 }
 peaks.sort((a,b)=>a-b);
 // Bounds come from two native screenshot series, with room for phase and
 // sampling differences. They do not require a particular field geometry.
 assert.ok(peaks[Math.floor(peaks.length*.95)]>=110&&peaks[Math.floor(peaks.length*.95)]<=140);
 assert.ok(blue/n>60&&blue/n<90);
 assert.ok(green/n>18&&green/n<35);
 assert.ok(dark/n>.2&&dark/n<.5);
});
