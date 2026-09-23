import {CLIMB,clamp,smooth,mix,damp} from './config.js';
import {pointAt,targetHold,grip,restBody,footAt,visualPoint} from './route.js';
const pointMix=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});
const copy=p=>({x:p.x,y:p.y});
export function solveLimb(root,target,upper,lower,bend=1){
  const dx=target.x-root.x,dy=target.y-root.y,raw=Math.max(.001,Math.hypot(dx,dy));
  const distance=clamp(raw,Math.abs(upper-lower)+.01,upper+lower-.01),ux=dx/raw,uy=dy/raw;
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  const height=Math.sqrt(Math.max(0,upper*upper-along*along));
  return {joint:{x:root.x+ux*along-uy*height*bend,y:root.y+uy*along+ux*height*bend},end:{x:root.x+ux*distance,y:root.y+uy*distance}};
}
// Mirrored anatomical bend directions stay continuous as a hand passes its
// shoulder height. Picking the outermost IK solution each frame flips elbows.
export function solveOutward(root,target,upper,lower,side,leg=false){
  const bend=(side==='left'?-1:1)*(leg?-1:1);
  return solveLimb(root,target,upper,lower,bend);
}
// World-space anchors, a constrained torso spring and fixed-length two-bone
// limbs. The support hand transfers only AFTER the new hand bears the load.
export class CharacterMotion {
  constructor(){this.reset();}
  reset(run){
    const p=run?pointAt(run,0):{x:0,y:0};this.body=restBody(p);this.velocity={x:0,y:0};
    this.hands={left:grip(p,'left'),right:grip(p,'right')};this.feet={left:footAt(p,'left'),right:footAt(p,'right')};
    this.phase='idle';this.clock=0;this.tilt=0;this.shoulderLift=0;this.restBlend=0;this.activeHand='right';this.contact={left:true,right:true};
  }
  shoulder(side,body=this.body){return {x:body.x+(side==='right'?1:-1)*CLIMB.shoulderWidth/2,y:body.y-38-(side===this.activeHand?this.shoulderLift:0)};}
  constrain(body,anchors){
    for(let pass=0;pass<16;pass++)for(const [side,anchor] of anchors){
      // Each hand stays on its own side of the head. This is a pose constraint,
      // not merely drawing the head on top of an intersecting arm.
      body.x=side==='left'?Math.max(body.x,anchor.x+CLIMB.headClearance):Math.min(body.x,anchor.x-CLIMB.headClearance);
      const root=this.shoulder(side,body),dx=anchor.x-root.x,dy=anchor.y-root.y,d=Math.hypot(dx,dy),max=CLIMB.upperArm+CLIMB.forearm-.5;
      if(d>max){body.x+=dx*(d-max)/d;body.y+=dy*(d-max)/d;}
    }return body;
  }
  freeHand(side,p){
    const root=this.shoulder(side),sign=side==='left'?-1:1,max=CLIMB.upperArm+CLIMB.forearm-.5;
    const x=root.x+sign*clamp(sign*(p.x-root.x),CLIMB.headClearance-CLIMB.shoulderWidth/2,max-.1);
    const dy=Math.sqrt(Math.max(0,max*max-(x-root.x)**2));
    return {x,y:clamp(p.y,root.y-dy,root.y+dy)};
  }
  update(run,dt,reduced=false){
    if(!run||dt<=0)return;this.clock+=dt;
    const phase=run.motion,active=run.activeHand,support=run.supportingHand;this.activeHand=active;
    const current=pointAt(run,run.level),target=run.targetPoint||targetHold(run),source=run.sourcePoint||current;
    const quiet=reduced?.18:1,breath=Math.sin(this.clock*CLIMB.idleBreathingSpeed)*.65*quiet;
    const charge=run.charging?clamp(run.held/CLIMB.chargeDuration):0;
    const direction=clamp((run.aim.x-current.x)/65,-1,1),balance=clamp(run.balance||0,-1,1),sway=(Math.sin(this.clock*.61+1.2)+Math.sin(this.clock*.37+3.1)*.45)*quiet;
    this.restBlend=damp(this.restBlend,run.resting?1:0,2,dt);
    this.shoulderLift=damp(this.shoulderLift,charge*3,10,dt);
    if(phase!==this.phase){
      this.entryBody=copy(this.body);this.entryHands=structuredClone(this.hands);this.entryFeet=structuredClone(this.feet);
      if(phase==='reach'){
        this.reachFrom=copy(this.hands[active]);const desired=grip(target,active);
        this.reachTo=run.outcome==='success'||run.outcome==='nearMiss'?desired:pointMix(grip(source,active),run.aim,run.outcome==='early'?clamp(run.chargeAtRelease/run.requiredCharge,.15,.7):1);
        if(!['success','nearMiss'].includes(run.outcome)){
          const origin=grip(source,active),distance=Math.hypot(this.reachTo.x-origin.x,this.reachTo.y-origin.y);
          if(distance>CLIMB.playerHeight*.7)this.reachTo=pointMix(origin,this.reachTo,CLIMB.playerHeight*.7/distance);
          this.reachTo.x=active==='left'?Math.min(this.reachTo.x,origin.x):Math.max(this.reachTo.x,origin.x);
        }
        if(run.outcome==='nearMiss')this.reachTo.y+=3;
        this.catchBody=this.constrain(pointMix(restBody(source),restBody(target),.57),[[support,grip(source,support)],[active,this.reachTo]]);
      }
      this.phase=phase;
    }
    let desiredBody=restBody(visualPoint(run));desiredBody.y+=breath;desiredBody.x+=sway*.35+this.restBlend*2+balance*(run.charging?5:2);
    if(run.charging){desiredBody.x-=direction*charge*5;desiredBody.y+=charge*5+Math.abs(balance)*1.5;}
    if(phase==='reach')desiredBody=pointMix(this.entryBody,this.catchBody,smooth(run.motionTime/run.reachDuration));
    if(phase==='grab'||phase==='brush'){desiredBody=copy(this.entryBody);desiredBody.y+=Math.sin(clamp(run.motionTime/.12)*Math.PI)*(target.kind==='crux'?5:3);}
    if(phase==='pull')desiredBody=pointMix(this.entryBody,restBody(target),smooth(run.motionTime/run.bodyDuration));
    if(phase==='settle'){const t=clamp(run.motionTime/run.settleDuration);desiredBody.x+=Math.sin(t*Math.PI*2)*(target.size==='small'?3:1.2)*quiet;desiredBody.y+=Math.sin(t*Math.PI)*2;}
    if(phase==='swing'){const t=clamp(run.motionTime/CLIMB.nearMissDuration);desiredBody=pointMix(this.entryBody,restBody(current),smooth(t));desiredBody.x+=Math.sin(t*Math.PI)*direction*8;desiredBody.y+=Math.sin(t*Math.PI)*9;}
    if(phase==='fall'){const t=clamp(run.motionTime/CLIMB.fallDuration);desiredBody=pointMix(this.entryBody,restBody(pointAt(run,run.fallTo)),t*t);desiredBody.y+=Math.sin(t*Math.PI)*(run.fromLevel?9:18);}
    if(phase==='recover'||phase==='cancel')desiredBody=pointMix(this.entryBody,restBody(current),smooth(run.motionTime/(phase==='cancel'?.32:CLIMB.recoverDuration)));
    // Substeps keep the spring stable on low-frame-rate devices.
    const steps=Math.ceil(dt/.012),h=dt/steps;
    for(let i=0;i<steps;i++)for(const axis of ['x','y']){this.velocity[axis]+=((desiredBody[axis]-this.body[axis])*CLIMB.bodySpring-this.velocity[axis]*CLIMB.bodyDamping)*h;this.body[axis]+=this.velocity[axis]*h;}
    this.tilt=damp(this.tilt,direction*(run.charging?-.06:.045)+balance*.10+(phase==='swing'?Math.sin(run.motionTime*8)*.08:0),8,dt);
    const oldSupport=grip(['reach','grab','brush','pull'].includes(phase)?source:current,support),anchors=[];
    if(['idle','charge','cancel','reach','brush','swing'].includes(phase)){this.hands[support]=oldSupport;anchors.push([support,oldSupport]);}
    if(run.charging){
      const desired=pointMix(grip(current,active),run.aim,.12+charge*.19);desired.x+=balance*(3+charge*6);
      this.hands[active]=pointMix(this.hands[active],solveLimb(this.shoulder(active),desired,CLIMB.upperArm,CLIMB.forearm).end,1-Math.exp(-CLIMB.handMoveSpeed*dt));
    }else if(phase==='reach'){
      const t=smooth(run.motionTime/run.reachDuration);this.hands[active]=pointMix(this.reachFrom,this.reachTo,t);this.hands[active].x+=Math.sin(t*Math.PI)*direction*5;anchors.push([active,this.hands[active]]);
    }else if(phase==='grab'){
      this.hands[active]=grip(target,active);this.hands[support]=oldSupport;anchors.push([support,oldSupport],[active,this.hands[active]]);
    }else if(['pull','feet','settle'].includes(phase)){
      this.hands[active]=grip(target,active);anchors.push([active,this.hands[active]]);
      const progress=phase==='pull'?run.motionTime/run.bodyDuration:1,t=smooth((progress-.15)/.85);
      this.hands[support]=pointMix(grip(source,support),grip(target,support),t);
      this.hands[support].x+=Math.sin(t*Math.PI)*(support==='left'?-5:5);
      if(t===0||t===1)anchors.push([support,this.hands[support]]);
    }else if(phase==='brush'){this.hands[active]=copy(this.entryHands[active]);anchors.push([active,this.hands[active]]);}
    else if(['fall','swing','cancel','recover'].includes(phase)){
      const duration=phase==='fall'?CLIMB.fallDuration:phase==='swing'?CLIMB.nearMissDuration:phase==='cancel'?.32:CLIMB.recoverDuration;
      const t=clamp(run.motionTime/duration),p=phase==='fall'?pointAt(run,run.fallTo):current;
      this.hands[active]=pointMix(this.entryHands[active],grip(p,active),smooth(t));
      if(phase==='fall')this.hands[support]=pointMix(this.entryHands[support],grip(p,support),smooth((t-.15)/.85));
      if(phase==='swing')this.hands[active].y+=Math.sin(t*Math.PI)*12;
    }else{this.hands[active]=grip(current,active);anchors.push([active,this.hands[active]]);}
    const before=copy(this.body);this.constrain(this.body,anchors);
    for(const axis of ['x','y'])if(Math.abs(this.body[axis]-before[axis])>.01)this.velocity[axis]*=.25;
    // Rendered endpoints always equal their reachable IK endpoints: no detached
    // glove / boot when a foot briefly leaves the wall during an extended reach.
    for(const side of ['left','right']){
      if(!anchors.some(([anchored])=>anchored===side))this.hands[side]=this.freeHand(side,this.hands[side]);
      this.hands[side]=solveLimb(this.shoulder(side),this.hands[side],CLIMB.upperArm,CLIMB.forearm).end;
    }
    for(const side of ['left','right']){
      let desired=footAt(current,side);
      if(['reach','grab','brush'].includes(phase))desired=footAt(source,side);
      if(['pull','feet','settle'].includes(phase)){
        const lead=side===active,t=phase==='pull'?smooth((run.motionTime/run.bodyDuration-(lead?.08:.30))/(lead?.82:.70)):1;
        desired=pointMix(footAt(source,side),footAt(target,side),t);desired.x+=Math.sin(t*Math.PI)*(lead?8:-6);desired.y-=Math.sin(t*Math.PI)*7;
      }
      if(phase==='swing'){desired.x+=Math.sin(run.motionTime*7)*(side==='left'?9:-5);desired.y+=8*Math.sin(clamp(run.motionTime/CLIMB.nearMissDuration)*Math.PI);}
      if(run.resting&&side==='right')desired.y-=this.restBlend*Math.pow(Math.max(0,Math.sin(this.clock*.51+2)),8)*4*quiet;
      const hip={x:this.body.x+(side==='left'?-5:6),y:this.body.y+(side==='right'?-1:0)};
      const next=pointMix(this.feet[side],desired,1-Math.exp(-CLIMB.footAdjustmentSpeed*dt));
      this.feet[side]=solveLimb(hip,next,CLIMB.thigh,CLIMB.shin,-1).end;
      this.contact[side]=Math.hypot(this.feet[side].x-desired.x,this.feet[side].y-desired.y)<3;
    }
  }
  draw(c,head,backpack){
    const b=this.body;
    const shoulder={left:this.shoulder('left'),right:this.shoulder('right')};
    const hip={left:{x:b.x-5,y:b.y},right:{x:b.x+6,y:b.y-1}};
    const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
    const segment=(a,z,width,color)=>{
      const distance=Math.hypot(z.x-a.x,z.y-a.y),steps=Math.ceil(distance/2);
      for(let i=0;i<=steps;i++){const t=steps?i/steps:0;rect(mix(a.x,z.x,t)-width/2,mix(a.y,z.y,t)-width/2,width,width,color);}
    };
    const limb=(root,end,a,side,width,color,upper=CLIMB.upperArm,lower=CLIMB.forearm)=>{
      const solved=solveOutward(root,end,upper,lower,side,upper===CLIMB.thigh);
      segment(root,solved.joint,width,color);segment(solved.joint,solved.end,width-1,a);
    };
    limb(shoulder.left,this.hands.left,'#d9b654','left',6,'#e8e5b2');
    limb(hip.left,this.feet.left,'#125052','left',8,'#17645d',CLIMB.thigh,CLIMB.shin);
    rect(this.feet.left.x-4,this.feet.left.y-2,11,5,'#103a40');
    limb(hip.right,this.feet.right,'#16645b','right',9,'#197e6d',CLIMB.thigh,CLIMB.shin);
    rect(this.feet.right.x-3,this.feet.right.y-2,12,5,'#103a40');
    limb(shoulder.right,this.hands.right,'#f1cd66','right',6,'#ede9b5');
    // The head and torso correctly occlude both arms during a leftward reach.
    c.save();c.translate(Math.round(b.x),Math.round(b.y-16));c.rotate(this.tilt*.4);
    rect(-13,-27,26,41,'#e5e6aa');rect(-10,-24,20,34,'#f0ecc1');
    rect(-16,-25,32,7,'#e5e6aa');rect(-13,-24,26,5,'#f0ecc1');
    // Rear-facing pack centered on the spine; both shoulder straps are visible.
    // It inherits the torso transform, leaving hand / leg motion untouched.
    rect(-11,-25,3,17,'#9d583b');rect(8,-25,3,17,'#9d583b');
    if(backpack)c.drawImage(backpack.image,...backpack.box,-12,-24,24,33);
    rect(-11,10,23,8,'#12655c');rect(-9,10,18,3,'#315c4e');
    rect(-3,-32,7,7,'#f1cd66');c.drawImage(head,-12,-50,24,21);c.restore();
    rect(this.hands.left.x-3,this.hands.left.y-3,6,6,'#d9b654');
    rect(this.hands.right.x-3,this.hands.right.y-3,7,6,'#f3d477');
  }
  snapshot(){return {body:copy(this.body),hands:structuredClone(this.hands),feet:structuredClone(this.feet),shoulders:{left:this.shoulder('left'),right:this.shoulder('right')},phase:this.phase,restBlend:this.restBlend,contact:{...this.contact}};}
}
