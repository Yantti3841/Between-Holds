import {CLIMB} from './config.js';

export class Sound {
  constructor(){this.ctx=null;this.volume=CLIMB.audioVolume;this.muted=false;this.ambient=true;this.paused=false;this.hidden=false;this.mode='home';this.resting=false;this.nextNote=0;this.note=0;this.nextBreath=0;this.lastHover=0;this.played={};}
  async unlock(){
    if(!this.ctx){
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      this.ctx=new C();const ctx=this.ctx;
      this.bus=ctx.createGain();this.bus.gain.value=0;
      this.compressor=ctx.createDynamicsCompressor();this.compressor.threshold.value=-15;this.compressor.ratio.value=3;
      this.bus.connect(this.compressor);this.compressor.connect(ctx.destination);
      this.music=ctx.createGain();this.music.gain.value=0;this.music.connect(this.bus);
      this.fx=ctx.createGain();this.fx.gain.value=1.7;this.fx.connect(this.bus);
      this.wind=ctx.createGain();this.wind.gain.value=0;this.wind.connect(this.bus);
      this.noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);
      const data=this.noiseBuffer.getChannelData(0);let prior=0;
      for(let i=0;i<data.length;i++){prior=(prior+(Math.random()*2-1)*.06)/1.025;data[i]=prior*3;}
      const air=ctx.createBufferSource(),filter=ctx.createBiquadFilter();this.air=air;this.airFilter=filter;air.buffer=this.noiseBuffer;air.loop=true;filter.type='lowpass';filter.frequency.value=650;air.connect(filter);filter.connect(this.wind);air.start();
      this.nextNote=ctx.currentTime+.07;
    }
    if(this.ctx.state==='suspended')await this.ctx.resume().catch(()=>{});
    this.apply();
  }
  apply(){
    if(!this.ctx)return;const now=this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(this.muted||this.hidden?0:this.volume,now,.09);
    const inClimb=['playing','tutorial'].includes(this.mode);
    this.music.gain.setTargetAtTime(this.ambient?(this.paused?.13:this.resting?.21:inClimb?CLIMB.climbingMusicVolume:CLIMB.musicVolume):0,now,.35);
    this.wind.gain.setTargetAtTime(this.ambient?(inClimb?.007:.004):0,now,.4);
  }
  setMode(mode,resting=false,paused=false){if(this.mode===mode&&this.resting===resting&&this.paused===paused)return;this.mode=mode;this.resting=resting;this.paused=paused;this.apply();}
  tone(frequency,volume,duration=.18,delay=0,bus=this.fx,type='sine'){
    if(!this.ctx)return;const ctx=this.ctx,at=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.value=frequency;o.connect(g);g.connect(bus);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    o.start(at);o.stop(at+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  texture(kind,volume=.12,duration=.15){
    if(!this.ctx)return;const ctx=this.ctx,at=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();
    source.buffer=this.noiseBuffer;filter.type='bandpass';filter.frequency.value=kind==='foot'?260:kind==='breath'?850:kind==='cloth'?1100:620;filter.Q.value=.65;
    source.connect(filter);filter.connect(g);g.connect(this.fx);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+Math.min(.055,duration*.2));g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.start(at,Math.random());source.stop(at+duration+.02);source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};
  }
  ui(kind='click'){
    if(!this.ctx||this.hidden)return;const now=this.ctx.currentTime;if(kind==='hover'&&now-this.lastHover<.15)return;this.lastHover=now;
    this.played['ui-'+kind]=(this.played['ui-'+kind]||0)+1;
    this.tone(kind==='hover'?440:330,kind==='hover'?.019:.065,kind==='hover'?.085:.15);
    if(kind!=='hover')this.tone(495,.025,.2,.025);
  }
  event(kind){
    if(!this.ctx||this.paused||this.hidden)return;this.played[kind]=(this.played[kind]||0)+1;
    if(kind==='grab'||kind==='crux-grab'){const boost=kind==='crux-grab'?1.18:1;this.texture('rock',.23*boost,.16);this.tone(148,.055*boost,.13);}
    else if(kind==='brush')this.texture('rock',.105,.22);
    else if(kind==='foot'){this.texture('foot',.16,.15);this.tone(98,.025,.13);}
    else if(kind==='cloth'){this.texture('cloth',.08,.22);this.effort('push');}
    else if(kind==='slip')this.texture('rock',.16,.36);
    else this.texture('rock',.08,.2);
  }
  effort(kind){
    if(!this.ctx||this.paused||this.hidden)return;
    this.played['effort-'+kind]=(this.played['effort-'+kind]||0)+1;
    if(kind==='inhale'){this.texture('breath',.10,.21);return;}
    // Short voiced exhalation: a falling glottal pitch through mouth formants,
    // plus breath. No persistent low-frequency drone and no spoken words.
    const ctx=this.ctx,now=ctx.currentTime,source=ctx.createOscillator(),gain=ctx.createGain(),cut=ctx.createBiquadFilter();
    source.type='sawtooth';source.frequency.setValueAtTime(162,now);source.frequency.exponentialRampToValueAtTime(118,now+.24);
    cut.type='highpass';cut.frequency.value=190;source.connect(cut);gain.connect(this.fx);
    const filters=[{hz:460,q:2.8,level:.38},{hz:1180,q:4,level:.15},{hz:2350,q:5,level:.025}].map(v=>{
      const filter=ctx.createBiquadFilter(),g=ctx.createGain();filter.type='bandpass';filter.frequency.value=v.hz;filter.Q.value=v.q;g.gain.value=v.level;cut.connect(filter);filter.connect(g);g.connect(gain);return [filter,g];
    });
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.35,now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+.28);
    source.start(now);source.stop(now+.3);this.texture('breath',.11,.26);
    source.onended=()=>{source.disconnect();cut.disconnect();gain.disconnect();filters.flat().forEach(n=>n.disconnect());};
  }
  chime(kind){
    if(!this.ctx||this.hidden||this.paused)return;
    this.played['chime-'+kind]=(this.played['chime-'+kind]||0)+1;
    const notes={
      failure:[330,262,196],summit:[392,494,587,784],
      start:[392,587],success:[523,659],early:[330,277],
      memory:[660],ready:[784],countdown:[440],warning:[220],results:[392,494,587],guide:[494]
    }[kind]||[392];
    notes.forEach((hz,i)=>this.tone(hz,kind==='memory'?.035:.08,kind==='failure'?.42:.23,i*.14,this.fx,'triangle'));
  }
  update(run){
    if(!this.ctx||this.ctx.state!=='running')return;
    const now=this.ctx.currentTime;
    if(this.lastRun!==run){this.lastRun=run;this.effortHold=-1;}
    if(run?.charging&&!this.paused&&!run.resting&&run.held>.22&&this.effortHold!==run.pressSerial){this.effortHold=run.pressSerial;this.effort('inhale');}
    // One scheduler shares the rendering loop; no per-note timers accumulate.
    if(now>=this.nextNote){
      const melody=[293.66,369.99,440,369.99,493.88,440,369.99,0,329.63,392,493.88,392,440,369.99,293.66,0];
      const chords=[146.83,130.81,164.81,146.83],f=melody[this.note%melody.length];
      if(this.ambient&&!this.hidden){
        if(f){this.tone(f,.37,.7,0,this.music,'triangle');this.tone(f*2,.065,.38,.009,this.music);}
        if(this.note%4===0)this.tone(chords[Math.floor(this.note/4)%4],.17,1.5,0,this.music);
      }
      this.note++;this.nextNote=now+(this.resting?.53:.38);
    }
    if(run&&!run.ended&&!this.paused&&now>=this.nextBreath){this.texture('breath',this.resting?.022:.035,.9);this.nextBreath=now+(this.resting?10:7)+Math.random()*3;}
  }
  snapshot(){return {state:this.ctx?.state||'locked',mode:this.mode,resting:this.resting,paused:this.paused,muted:this.muted,volume:this.volume,musicGain:this.music?.gain.value||0,played:{...this.played}};}
  dispose(){if(!this.ctx)return;this.air?.stop();this.air?.disconnect();this.airFilter?.disconnect();this.ctx.close().catch(()=>{});this.ctx=null;this.lastRun=null;}
}
