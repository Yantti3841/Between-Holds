import {CLIMB,clamp,damp} from './config.js';
import {targetHold,targetGrip,hitRadius,footAt,visualPoint,visibleHolds,visibleRocks} from './route.js';
import {CharacterMotion} from './motion.js';
import {range} from './game.js';
import {MEMORY_OBJECTS} from './memories.js';
// Raster artwork is generated for this game; sprites are extracted at load time.
// Some generated sheets have baked neutral checker pixels. The render-time
// color key removes those pixels without replacing the illustrated subjects.
const files={forest:'assets/forest.png',sprites:'assets/sprites-clean.png',memories:'assets/memories-clean.png',cliff:'assets/forest-cliff-v15.png',backpack:'assets/backpack-rear-v15.png',extension:'assets/forest-cliff-expanded-v19.png'};
const imageLoad=url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('图片未能加载：'+url));i.src=url;});
function tile(img,box,key=false){
  const c=document.createElement('canvas');c.width=box[2];c.height=box[3];const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,...box,0,0,c.width,c.height);
  if(key){const pixels=x.getImageData(0,0,c.width,c.height),d=pixels.data;for(let i=0;i<d.length;i+=4){const delta=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);if(delta<8)d[i+3]=0;}x.putImageData(pixels,0,0);}
  return c;
}
export async function loadArt(){
  const [forest,sheet,memory,cliff,backpackImage,extension]=await Promise.all(Object.values(files).map(imageLoad));
  // Feather only the outermost 6% beyond the playable viewport, once at load.
  // Original forest/cliff pixels inside the game remain untouched.
  const edgeWidth=Math.round(cliff.width*.06),cliffEdge=tile(cliff,[cliff.width-edgeWidth,0,edgeWidth,cliff.height]);
  const edgeContext=cliffEdge.getContext('2d'),edgeFade=edgeContext.createLinearGradient(0,0,edgeWidth,0);
  edgeFade.addColorStop(0,'#000');edgeFade.addColorStop(1,'#0000');
  edgeContext.globalCompositeOperation='destination-in';edgeContext.fillStyle=edgeFade;edgeContext.fillRect(0,0,edgeWidth,cliff.height);
  const raw={idle:[115,100,290,370],climb:[555,95,302,375],reach:[969,73,277,397],slip:[1370,95,335,375],hold:[95,605,230,210],platform:[461,599,405,210],flag:[994,527,240,286],fern:[1333,568,382,252]};
  const sprites=Object.fromEntries(Object.entries(raw).map(([k,b])=>[k,tile(sheet,b,true)]));
  const objects={};['umbrella','bird','house','flowers','backpack','mushroom'].forEach((k,i)=>{objects[k]=tile(memory,[i%3*512,Math.floor(i/3)*512,512,512],true).toDataURL();});
  // Generated PNGs already have alpha; don't color-key their cream details.
  await Promise.all(MEMORY_OBJECTS.filter(o=>o.file).map(async o=>{
    await imageLoad(o.file);objects[o.id]=o.file;
  }));
  const head=tile(sheet,[144,151,149,120],true);
  // Preserve the generated alpha. Use only its occupied bounds when attaching
  // the sprite to the torso, so transparent export padding doesn't shrink it.
  const probe=document.createElement('canvas');probe.width=backpackImage.width;probe.height=backpackImage.height;
  const context=probe.getContext('2d',{willReadFrequently:true});context.drawImage(backpackImage,0,0);
  const pixels=context.getImageData(0,0,probe.width,probe.height).data;
  let left=probe.width,top=probe.height,right=0,bottom=0;
  for(let y=0;y<probe.height;y++)for(let x=0;x<probe.width;x++)if(pixels[(y*probe.width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const backpack={image:backpackImage,box:[left,top,right-left+1,bottom-top+1]};probe.width=0;probe.height=0;
  return {forest,sprites,objects,head,cliff,backpack,extension,cliffEdge};
}
export class World{
  constructor(canvas,art){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.art=art;this.position=0;this.camera=0;this.cameraX=0;this.zoom=1;this.lookTime=0;this.looked=new Set();this.state='home';this.reduced=false;this.paused=false;this.motion=0;this.total=10;this.run=null;this.pointer=null;this.hover=0;this.rig=new CharacterMotion();this.onResize=()=>this.resize();this.resize();window.addEventListener('resize',this.onResize);}
  resize(){
    this.w=innerWidth;this.h=innerHeight;const d=Math.min(devicePixelRatio||1,2);this.canvas.width=this.w*d;this.canvas.height=this.h*d;this.ctx.setTransform(d,0,0,d,0,0);
  }
  reset(run){this.run=run;this.camera=0;this.cameraX=0;this.zoom=1;this.lookTime=0;this.looked.clear();this.position=0;this.pointer=null;this.rig.reset(run);}
  layout(){const w=this.w,h=this.h,split=w<=600?.58:w<=900?.64:.68;return {width:w*split,scale:Math.max(.52,Math.min(1.5,h/550,w/800))*this.zoom,anchor:h*.43};}
  toScreen(p){const l=this.layout();return {x:l.width*.67+(p.x-this.cameraX)*l.scale,y:l.anchor+(p.y+this.camera)*l.scale};}
  targetScreen(){return this.toScreen(this.run?targetGrip(this.run):{x:0,y:0});}
  visible(){return this.run?visibleRocks(this.run,this.total).filter(p=>{const s=this.toScreen(p);return s.y>-20&&s.y<this.h+20;}):[];}
  aimAt(x,y,keyboard=false){
    if(!this.run)return;const l=this.layout();
    this.pointer=keyboard?null:{x,y};this.run.inputMode=keyboard?'keyboard':'pointer';
    const p=keyboard||this.run.charging?targetGrip(this.run):{x:(x-l.width*.67)/l.scale+this.cameraX,y:(y-l.anchor)/l.scale-this.camera};
    const target=targetGrip(this.run),radius=hitRadius(target),d=Math.hypot(p.x-target.x,p.y-target.y),snap=keyboard?1:d<radius?(.22*(1-d/radius)):0;
    this.run.aim={x:p.x+(target.x-p.x)*snap,y:p.y+(target.y-p.y)*snap};
  }
  environment(c,width,h,play,dt){
    const a=this.art;
    if(play&&this.run){
      // A single continuous panorama replaces the rectangular cliff overlay.
      // It shares the holds' world transform: no seam, tiling or texture sliding.
      const baseScale=this.layout().scale/this.zoom,pad=width*.08,drawWidth=width+pad*2;
      const routeHeight=-this.run.route.nodes.at(-1).y;
      const drawHeight=Math.max(h+routeHeight*baseScale+180,drawWidth*a.cliff.height/a.cliff.width),y=h+80-drawHeight;
      c.save();c.translate(width*.67,h*.43);c.scale(this.zoom,this.zoom);
      c.translate(-width*.67-this.cameraX*baseScale,-h*.43+this.camera*baseScale);
      // Static outpaint outside the playable area. Always cover its left half
      // with the exact original, so generation cannot move any game landmark.
      // Both images share world coordinates in intro AND play; no crossfade.
      c.imageSmoothingEnabled=false;
      c.drawImage(a.extension,-pad,y,drawWidth*2,drawHeight);
      const core=a.cliff.width-a.cliffEdge.width,coreWidth=drawWidth*core/a.cliff.width;
      c.drawImage(a.cliff,0,0,core,a.cliff.height,-pad,y,coreWidth,drawHeight);
      c.drawImage(a.cliffEdge,-pad+coreWidth,y,drawWidth-coreWidth,drawHeight);
      if(!this.reduced){c.fillStyle='#e4fff51c';for(let i=0;i<4;i++){
        const flow=(this.motion*(.075+i*.008)+i*.27)%1;
        c.fillRect(Math.round(-pad+drawWidth*(.350+i*.009)),Math.round(y+drawHeight*(.812+flow*.059)),2,4+i%2*2);
      }}c.restore();
    }else c.drawImage(a.forest,0,0,width,h+35);
    if(!play&&!this.reduced){
      // Highlights stay inside the painted distant waterfall, not in front of
      // the climber. Different speeds prevent a synchronized looping curtain.
      c.fillStyle='#e4fff525';
      for(let i=0;i<4;i++){
        const flow=(this.motion*(.075+i*.008)+i*.27)%1;
        c.fillRect(Math.round(width*(.470+i*.006)),Math.round((h+35)*(.741+flow*.079)),Math.max(1,width*.0012),3+i%2*2);
      }
    }
    if(this.reduced)return;
    for(let i=0;i<3;i++){
      const x=((i*.34*width+this.motion*(.7+i*.21))%(width+230))-115;
      c.fillStyle=`rgba(240,249,221,${.014+.009*Math.sin(this.motion*.071+i*1.9)})`;
      c.beginPath();c.ellipse(x,h*(.22+i*.19)+Math.sin(this.motion*(.05+i*.013)+i)*7,140+i*20,22+i*8,0,0,Math.PI*2);c.fill();
    }
    c.fillStyle='#eff9dc88';for(let i=0;i<17;i++){
      const xx=(i*79.6+this.motion*(1.4+i%4*.57)+Math.sin(this.motion*(.09+i*.004)+i*2.37)*7)%width;
      const yy=(i*97.3+this.motion*(.3+i%3*.11)+Math.sin(this.motion*(.17+i*.013)+i*1.73)*11)%h;
      c.globalAlpha=.35+.25*Math.sin(this.motion*.11+i);c.fillRect(Math.round(xx),Math.round(yy),2,2);
    }c.globalAlpha=1;
  }
  draw(dt){
    if(!this.paused)this.motion+=dt;const {ctx:c,w,h,art:a}=this;const play=['tutorial','playing','ready','intro'].includes(this.state);const l=this.layout(),width=play?l.width:w;
    if(play&&this.run&&!this.paused){
      const run=this.run,p=visualPoint(run),next=targetHold(run);
      if([3,6,9].includes(run.level)&&!this.looked.has(run.level)&&run.motion==='idle'){this.looked.add(run.level);this.lookTime=2.6;}
      // Freeze the camera for the whole held gesture. A small target must not
      // drift away from a stationary mouse while the player is charging.
      if(!run.charging&&this.state!=='intro'){
        this.lookTime=Math.max(0,this.lookTime-dt);
        const look=this.reduced?0:Math.sin(this.lookTime/2.6*Math.PI);
        this.zoom=damp(this.zoom,1-look*.075,2.6,dt);
        const anticipation=run.motion==='reach'?.045:0;
        this.camera=damp(this.camera,-p.y-(next.y-p.y)*anticipation-look*22,CLIMB.cameraDamping,dt);
        this.cameraX=damp(this.cameraX,p.x*.12,2,dt);
      }
      if(run.inputMode==='keyboard')run.aim=targetGrip(run);else if(this.pointer&&run.motion==='charge')this.aimAt(this.pointer.x,this.pointer.y);
      this.rig.update(run,dt,this.reduced);
    }
    c.clearRect(0,0,w,h);c.save();c.beginPath();c.rect(0,0,this.state==='intro'?w:width,h);c.clip();
    // One camera transform for every scene element, with a fixed composition.
    // The panel fades over it; neither the panorama nor the actor reflows.
    if(this.state==='intro'&&!this.reduced){
      const t=clamp(this.introProgress*5.6/3.2),ease=t*t*(3-2*t),z=.92+.08*ease;
      c.translate(width*.67,h*.43);c.scale(z,z);c.translate(-width*.67,-h*.43);
    }
    this.environment(c,width,h,play,dt);
    if(play&&this.run){
      const run=this.run,target=targetGrip(run),distance=Math.hypot(run.aim.x-target.x,run.aim.y-target.y);
      this.hover=damp(this.hover,distance<hitRadius(target)?1:0,9,this.paused?0:dt);
      const l=this.layout();c.save();c.translate(width*.67-this.cameraX*l.scale,l.anchor+this.camera*l.scale);c.scale(l.scale,l.scale);c.imageSmoothingEnabled=false;
      for(const p of visibleRocks(run,this.total)){
        const n=p.level,current=n===run.level+1&&p.side===run.activeHand,size=CLIMB.holdScale[p.size];
        const screenY=l.anchor+(p.y+this.camera)*l.scale;
        const fade=clamp((screenY+25)/75)*clamp((h+25-screenY)/65);
        c.globalAlpha=fade*(n>run.level+1?.63:1);
        if(current){c.globalAlpha=.12+this.hover*.15;c.fillStyle='#f5f3df';c.beginPath();c.arc(p.x,p.y,20,0,Math.PI*2);c.fill();c.globalAlpha=1;}
        c.globalAlpha=fade*(n>run.level+1?.63:1);c.drawImage(a.sprites.hold,p.x-size/2,p.y-size*.43,size,size*.88);
        if(n===this.total&&p.side==='right')c.drawImage(a.sprites.flag,p.x+21,p.y-49,25,34);
      }
      c.globalAlpha=1;
      for(const node of visibleHolds(run,this.total).filter(p=>!p.alternative)){
        for(const side of ['left','right']){const p=footAt(node,side);
          c.fillStyle='#3e7770';c.fillRect(p.x-3,p.y+3,12,4);
          c.fillStyle='#8eb69988';c.fillRect(p.x-1,p.y+1,10,2);
        }
      }
      this.rig.draw(c,a.head,a.backpack);
      if(run.level<this.total&&!run.resting){
        const r=range(run),good=run.charging&&run.held>=r.low&&run.held<=r.high;
        c.strokeStyle=good?'#fff7d5':`rgba(235,244,215,${.28+this.hover*.32})`;c.lineWidth=good?1.8:1;
        if(run.charging){
          c.beginPath();c.arc(target.x,target.y,24,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(run.held/((r.low+r.high)*.5)));c.stroke();
          if(good){c.fillStyle='#fff7d5';c.fillRect(target.x-1,target.y-31,2,2);}
        }else if(run.motion==='idle'){c.beginPath();c.arc(target.x,target.y,23,-2.5,-.7);c.stroke();}
      }
      c.restore();
      if(this.pointer&&run.charging){c.strokeStyle='#f0eed0aa';c.lineWidth=1;c.beginPath();c.arc(this.pointer.x,this.pointer.y,4+clamp(run.held)*3,0,Math.PI*2);c.stroke();}
      const fernSize=Math.min(width*.23,190),wind=this.reduced?0:Math.sin(this.motion*.37)*Math.sin(this.motion*.11+2)*CLIMB.environmentWindStrength;
      c.save();c.translate(15,h);c.rotate(wind*.016);c.drawImage(a.sprites.fern,-30,-fernSize*.65,fernSize,fernSize*.66);c.restore();
    }else{
      const sz=Math.max(55,Math.min(120,h*.14)),ground=(h+35)*.686;
      c.fillStyle='#174e4c35';c.beginPath();c.ellipse(width*.12+sz*.28,ground,sz*.18,2.5,0,0,Math.PI*2);c.fill();
      c.drawImage(a.sprites.idle,width*.12,ground-sz*(356/370),sz*.79,sz);
      const holdSize=Math.min(75,w*.055);for(let i=0;i<3;i++)c.drawImage(a.sprites.hold,width*.787,h*(.22+i*.21),holdSize,holdSize);
    }
    c.restore();
  }
  dispose(){window.removeEventListener('resize',this.onResize);this.canvas.width=0;this.canvas.height=0;this.run=null;}
}
