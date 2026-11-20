export function albumCoverTone(pixels, size = 32) {
  const buckets = new Map();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < .1) continue;
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const x = (i / 4) % size, y = Math.floor(i / 4 / size);
    const weight = alpha * (x < 4 || x >= size - 4 || y < 4 || y >= size - 4 ? 2 : 1);
    const key = rgb.map(channel => Math.floor(channel / 32)).join(',');
    const bucket = buckets.get(key) || {sum: [0, 0, 0], weight: 0};
    rgb.forEach((channel, index) => bucket.sum[index] += channel * weight);
    bucket.weight += weight;
    buckets.set(key, bucket);
  }
  const strongest = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  const color = strongest ? strongest.sum.map(channel => Math.round(channel / strongest.weight)) : [86, 86, 91];
  const linear = color.map(channel => {const value = channel / 255;return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;});
  return {color, light: linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 > .42};
}

// Apple uses additive vibrant text colors on its dark collection surfaces.
export function playlistPalette({color,light}) {
 const secondary=light?'rgba(0,0,0,.56)':'rgb('+color.map((c,i)=>Math.min(255,c+[161,161,166][i])).join(' ')+')';
 const sidebar=light?color:color.map((c,i)=>Math.round(c*.4+[38,38,40][i]*.6));
 return {secondary,sidebar};
}

export function coverMotionPalette(pixels) {
      const buckets = new Map();
      for (let i = 0; i < pixels.length; i += 4) {
        if(pixels[i+3]<16)continue;
        const color = [pixels[i], pixels[i + 1], pixels[i + 2]];
        const high = Math.max(...color), low = Math.min(...color);
        if (high < 22 || low > 235) continue;
        const key = color.map(value => Math.floor(value / 40)).join(',');
        const bucket = buckets.get(key) || {sum: [0, 0, 0], count: 0, weight: 0};
        color.forEach((value, channel) => bucket.sum[channel] += value);
        bucket.count++;
        bucket.weight += 1 + (high - low) / 100;
        buckets.set(key, bucket);
      }
      let colors = [...buckets.values()].sort((a, b) => b.weight - a.weight)
        .map(bucket => bucket.sum.map(value => value / bucket.count));
      const hue=color=>{const [r,g,b]=color,high=Math.max(...color),low=Math.min(...color),d=high-low;return ((high===r?(g-b)/d:high===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;};
      const sameHue=(color,dominant)=>{const difference=Math.abs(hue(color)-dominant);return Math.min(difference,360-difference)<45;};
      // Mostly neutral artwork still needs its grey fields. Discarding every
      // neutral bucket turned the small skin-colour accent into an orange wash.
      const neutralBuckets=[...buckets.values()].filter(bucket=>{const color=bucket.sum.map(value=>value/bucket.count);return (Math.max(...color)-Math.min(...color))/Math.max(...color)<=.15;});
      const neutralCount=neutralBuckets.reduce((sum,bucket)=>sum+bucket.count,0),totalCount=[...buckets.values()].reduce((sum,bucket)=>sum+bucket.count,0);
      if(neutralCount>totalCount/2){
        const neutral=neutralBuckets.sort((a,b)=>b.count-a.count).map(bucket=>bucket.sum.map(value=>value/bucket.count));
        const chromatic=colors.filter(color=>(Math.max(...color)-Math.min(...color))/Math.max(...color)>.15);
        const accents=chromatic.filter(color=>sameHue(color,hue(chromatic[0])));
        const fields=[];
        const shadowDominant=neutral.length>0&&Math.max(...neutral[0])<40;
        const add=color=>{if(fields.every(other=>color.reduce((sum,value,i)=>sum+(value-other[i])**2,0)>250))fields.push(color);};
        for(const color of neutral){
          // The darkest quantisation bucket is already represented by the
          // shader's shadow pool. Using it as another anchor, then dimming the
          // remaining greys, erased the visible neutral fields of dark covers.
          if(shadowDominant&&Math.max(...color)<40)continue;
          const scale=shadowDominant?Math.min(1,115/Math.max(...color)):Math.min(.55,75/Math.max(...color));
          add(color.map(value=>Math.round(value*scale)));
          if(fields.length===3)break;
        }
        for(const color of accents){
          const low=Math.min(...color),range=Math.max(...color)-low;
          add(color.map(value=>Math.round(13+(value-low)/range*102)));
          if(fields.length===5)break;
        }
        // Spread accents between neutral anchors instead of grouping each kind.
        if(fields.length>3)[fields[1],fields[3]]=[fields[3],fields[1]];
        return fields.length?fields:null;
      }
      // Small colour casts in nearly grey fabric/JPEG pixels are not accents:
      // normalising them to full chroma creates bright colours absent in art.
      const chromatic=colors.filter(color=>Math.max(...color)>22&&(Math.max(...color)-Math.min(...color))/Math.max(...color)>.15);
      if(chromatic.length){
        const dominant=hue(chromatic[0]);
        colors=chromatic.filter(color=>sameHue(color,dominant));
      }
      const distinct=[];
      for(const color of colors){
        const average=color.reduce((sum,value)=>sum+value,0)/3,low=Math.min(...color),range=Math.max(...color)-low;
        const saturated=chromatic.length?color.map(value=>13+(value-low)/Math.max(1,range)*217):color.map(value=>Math.max(0,Math.min(235,average+(value-average)*2.2)));
        const luminance=saturated[0]*.2126+saturated[1]*.7152+saturated[2]*.0722,scale=Math.min(230/Math.max(...saturated,1),115/Math.max(luminance,1));
        const rendered=saturated.map(value=>Math.min(255,Math.round(value*scale)));
        if(distinct.every(other=>rendered.reduce((sum,value,i)=>sum+(value-other[i])**2,0)>1800))distinct.push(rendered);
        if(distinct.length===5)break;
      }
      return distinct.length?distinct:null;
}

// A warped colour field keeps saturated regions and dark pools separate instead
// of whitening every overlapping radial gradient through additive blending.
export function paintAmbientField(data,width,height,time,palette) {
  const sourceColours=palette.length?palette:[[35,40,45]];
  // Blue reference frames have broad, restrained fields rather than small
  // electric-cyan highlights. Lower their peaks before energy weighting so
  // dimmer areas retain coverage. Blend continuously during cover changes;
  // neutral and warm palettes keep their existing tones.
  const blueWeight=Math.max(0,Math.min(1,...sourceColours.map(([r,g,b])=>(b-Math.max(r,g)-10)/Math.max(1,b*.25))));
  const scale=1-.45*blueWeight,greenScale=1-.5*blueWeight;
  const colours=blueWeight?sourceColours.map(colour=>colour.map((value,channel)=>13+(value-13)*scale*(channel===1?greenScale:1))):sourceColours;
  const peak=Math.max(14,...colours.flat())-13;
  // Neutral fields are lower-energy than saturated accents. The stronger colour
  // cutoff otherwise removes the greys we deliberately retained from the cover.
  const neutral=colours.filter(color=>(Math.max(...color)-Math.min(...color))/Math.max(1,...color)<=.15).length;
  const blackPoint=neutral>colours.length/2?.08:.2;
  const anchors=[[.06,.15],[.88,.2],[.42,.92],[.16,.65],[.94,.9]].map(([x,y],i)=>({
    x:x+Math.sin(time*(.13+i*.017)+i*1.7)*.3,
    y:y+Math.cos(time*(.17+i*.013)+i*2.1)*.28,
    radius:.3+.08*Math.sin(time*.15+i),colour:colours[i%colours.length],
    strength:2.4*Math.min(2.1,80/Math.max(1,colours[i%colours.length].reduce((sum,value,j)=>sum+value*[.2126,.7152,.0722][j],0)))
  }));
  const darkX=.55+Math.sin(time*.14)*.3,darkY=.48+Math.cos(time*.19)*.25;
  // These three waves depend on only one axis. Evaluate them once per row or
  // column rather than repeating the same trigonometry for every output pixel.
  const rowX=new Float64Array(height),rowY=new Float64Array(height),columnY=new Float64Array(width);
  for(let y=0;y<height;y++){const v=y/height;rowX[y]=.19*Math.sin(v*5.1+time*.23);rowY[y]=.08*Math.cos(v*5.3+time*.13);}
  for(let x=0;x<width;x++)columnY[x]=.17*Math.sin(x/width*4.5-time*.21);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width,v=y/height;
    const wx=u+rowX[y]+.09*Math.cos(u*4.3-v*3.7-time*.17);
    const wy=v+columnY[x]+rowY[y];
    const dark=8*Math.exp(-((wx-darkX)**2+(wy-darkY)**2)/.16);
    let weight=.36+dark,r=13*weight,g=13*weight,b=13*weight;
    for(const anchor of anchors){
      const w=anchor.strength*Math.exp(-((wx-anchor.x)**2+(wy-anchor.y)**2)/(anchor.radius**2));
      weight+=w;r+=anchor.colour[0]*w;g+=anchor.colour[1]*w;b+=anchor.colour[2]*w;
    }
    const energy=Math.max(0,(Math.max(r,g,b)/weight-13)/peak),level=Math.max(0,Math.min(1,(energy-blackPoint)/(.95-blackPoint)));
    const scale=energy?level*level*(3-2*level)/energy:0;
    const i=(y*width+x)*4;data[i]=13+(r/weight-13)*scale;data[i+1]=13+(g/weight-13)*scale;data[i+2]=13+(b/weight-13)*scale;data[i+3]=255;
  }
}

export class AmbientBackdrop {
  constructor(canvas, dialog) {
    this.canvas = canvas;
    this.dialog = dialog;
    this.context = canvas.getContext('2d', {alpha: false});
    this.palette = [[60, 65, 70], [34, 42, 50], [45, 52, 58]];
    this.target = this.palette;
    this.frame = 0;
    this.lastTime = null;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.tick = this.tick.bind(this);
    this.resume = this.resume.bind(this);
    this.resize = this.resize.bind(this);
    this.resize();
    addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.resume);
    this.motion.addEventListener('change', this.resume);
    dialog.addEventListener('close', () => this.stop());
  }

  resize() {
    this.canvas.width = Math.max(96, Math.min(240, Math.round(innerWidth / 8)));
    this.canvas.height = Math.max(72, Math.min(160, Math.round(innerHeight / 8)));
    this.draw(performance.now() / 1000);
  }

  setCover(image) {
    if (!image.complete || !image.naturalWidth) return;
    const sample = document.createElement('canvas');
    sample.width = sample.height = 32;
    const context = sample.getContext('2d', {willReadFrequently: true});
    try {
      context.drawImage(image, 0, 0, 32, 32);
      const pixels = context.getImageData(0, 0, 32, 32).data;
      const palette=coverMotionPalette(pixels);
      this.target=palette||[[60,65,70],[34,42,50],[45,52,58]];
    } catch {
      // The neutral backdrop remains available if a cover cannot be sampled.
    }
    if (!this.dialog.open || this.motion.matches) this.palette = this.target.map(color => [...color]);
    this.resume();
  }

  resume() {
    this.stop();
    if (!this.dialog.open || document.hidden) return;
    if (this.motion.matches) {
      this.palette = this.target.map(color => [...color]);
      this.draw(0);
    } else this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = null;
  }

  reset() {
    this.stop();
    this.target = this.palette = [[60, 65, 70], [34, 42, 50], [45, 52, 58]];
    this.draw(0);
  }

  tick(time) {
    if (!this.dialog.open || document.hidden) return this.stop();
    // Follow the display cadence. A fixed 32ms gate dropped every other frame
    // on 60Hz screens; elapsed-time blending keeps cover fades equally paced
    // on different refresh rates and after a temporarily stalled frame.
    const elapsed = this.lastTime === null ? 0 : Math.max(0, Math.min(100, time - this.lastTime));
    const blend = 1 - Math.pow(.96, elapsed / 32);
    this.lastTime = time;
    this.palette = this.target.map((color, i) => color.map((value, channel) => {
      const previous = this.palette[i % this.palette.length][channel];
      return previous + (value - previous) * blend;
    }));
    this.draw(time / 1000);
    this.frame = requestAnimationFrame(this.tick);
  }

  draw(time) {
    const context = this.context;
    if (!context) return;
    const width=this.canvas.width,height=this.canvas.height;
    if(!this.pixels||this.pixels.width!==width||this.pixels.height!==height)this.pixels=context.createImageData(width,height);
    paintAmbientField(this.pixels.data,width,height,time,this.palette);
    context.putImageData(this.pixels,0,0);
  }
}
