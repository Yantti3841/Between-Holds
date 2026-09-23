import {CLIMB,clamp,smooth,mix,otherHand} from './config.js';
import {createRoute,pointAt,targetHold,targetGrip,grip,span} from './route.js';
import {createMemories,EXPOSURE} from './memories.js';
export {createMemories,EXPOSURE,QUIZ_COUNT,quizFor} from './memories.js';
export const LIMIT=65,COUNT=10;
export function newRun(tutorial=false){const route=createRoute();return {route,choice:0,nearMisses:0,phase:tutorial?'tutorial':'playing',tutorial,level:0,visual:0,moves:0,slips:0,early:0,failStreak:0,elapsed:0,charging:false,held:0,cooldown:0,activeMemory:-1,shown:[],completed:[],cards:tutorial?[]:createMemories(),seenCount:0,ended:false,holdSerial:0,
  motion:'idle',motionTime:0,activeHand:'right',supportingHand:'left',handHolds:{left:0,right:0},
  aim:grip(route.nodes[1],'right'),inputMode:'keyboard',balance:0,pressSerial:0,chargeAtRelease:0,reachQuality:0,outcome:null,fromLevel:0,targetLevel:1,resting:false,restTime:0,restRequested:false,events:[]};}
export function range(run){
  const difficulty=targetHold(run).kind==='crux'?1:clamp((span(run)-.35)/.36),small=targetHold(run).size==='small';
  const low=(run.tutorial?.40:CLIMB.minCharge)+difficulty*.62+(small?.08:0),help=run.failStreak>=2?.06:0;
  return {low:Math.max(.30,low-help),high:Math.min(CLIMB.chargeDuration,low+CLIMB.goodWindow-difficulty*.40-(small?.06:0)+help),max:CLIMB.chargeDuration};
}
export function startHold(run){if(run.ended||run.resting||run.motion!=='idle'||run.level>=(run.tutorial?2:COUNT))return false;run.aim=targetGrip(run);run.charging=true;run.pressSerial++;run.held=0;run.motion='charge';run.motionTime=0;run.outcome=null;return true;}
export function cancelHold(run){if(run.charging){run.motion='cancel';run.motionTime=0;run.cooldown=.32;}run.charging=false;run.held=0;}
export function requestRest(run){if(run.resting){run.resting=false;run.restRequested=false;return;}cancelHold(run);run.restRequested=true;if(run.motion==='idle'){run.resting=true;run.restRequested=false;}}
export function releaseHold(run){
  if(!run.charging)return null;
  const {low,high}=range(run),held=run.held,target={...targetHold(run)};
  // Timing is the only success criterion. The current hold is selected by
  // the route, so pointer drift cannot contradict the illuminated charge ring.
  run.aim=targetGrip(run);
  run.charging=false;run.chargeAtRelease=held;run.held=0;run.holdSerial++;run.fromLevel=run.level;run.targetLevel=run.level+1;
  run.reachQuality=clamp(1-Math.abs(held-(low+high)*.5)/((high-low)*.5));
  run.reachDuration=CLIMB.reachDuration*(1.12-.22*run.reachQuality+(target.kind==='crux'?.5:.2));
  run.targetPoint=target;run.sourcePoint={...pointAt(run,run.level)};run.requiredCharge=low;
  run.settleDuration=CLIMB.settleDuration+(target.size==='small'?.32:target.size==='medium'?.08:0);
  run.bodyDuration=CLIMB.bodyDuration+(target.kind==='crux'?.13:0);
  // The illuminated window is the rule: outside it always means a fall.
  // This keeps the visible feedback and the actual result aligned.
  run.outcome=held<low?'early':held>high?'slip':'success';
  run.motion='reach';run.motionTime=0;run.cooldown=3;
  if(run.outcome==='early')run.early++;
  return run.outcome;
}
function stage(run,name){run.motion=name;run.motionTime=0;}
function stabilize(run){stage(run,'idle');run.cooldown=0;run.outcome=null;if(run.level<(run.tutorial?2:COUNT))run.aim=targetGrip(run);if(run.restRequested){run.restRequested=false;run.resting=true;}}
function advanceMotion(run,dt){
  run.motionTime+=dt;const t=run.motionTime;
  if(run.motion==='reach'&&t>=run.reachDuration){
    if(run.outcome==='success'){run.route.nodes[run.targetLevel]=run.targetPoint;delete run.route.alternatives[run.targetLevel];run.handHolds[run.activeHand]=run.targetLevel;stage(run,'grab');run.events.push(run.targetPoint.kind==='crux'?'crux-grab':'grab');}
    else if(run.outcome==='nearMiss'){stage(run,'brush');run.nearMisses++;run.failStreak++;run.events.push('brush');}
    else {run.fallTo=Math.max(0,run.level-1);stage(run,'fall');run.failStreak++;run.slips++;run.events.push('slip');}
  }else if(run.motion==='grab'&&t>=CLIMB.grabDuration){stage(run,'pull');run.events.push('cloth');}
  else if(run.motion==='pull'){
    run.visual=mix(run.fromLevel,run.targetLevel,smooth(t/run.bodyDuration));
    if(t>=run.bodyDuration){run.visual=run.targetLevel;run.level=run.targetLevel;run.choice=0;run.moves++;run.failStreak=0;stage(run,'feet');run.events.push('foot');}
  }else if(run.motion==='feet'&&t>=CLIMB.feetDuration){stage(run,'settle');run.events.push('foot');}
  else if(run.motion==='settle'&&t>=run.settleDuration){
    run.handHolds.left=run.level;run.handHolds.right=run.level;
    run.supportingHand=run.activeHand;run.activeHand=otherHand(run.activeHand);stabilize(run);
  }else if(run.motion==='brush'&&t>=.12){stage(run,'swing');}
  else if(run.motion==='swing'&&t>=CLIMB.nearMissDuration){stabilize(run);}
  else if(run.motion==='fall'){
    const progress=clamp(t/CLIMB.fallDuration);
    run.visual=mix(run.fromLevel,run.fallTo,progress*progress)-(run.fromLevel===0?.6*Math.sin(Math.PI*progress):0);
    if(t>=CLIMB.fallDuration){
      run.level=run.fallTo;run.visual=run.level;run.choice=0;
      run.handHolds.left=run.level;run.handHolds.right=run.level;
      stage(run,'recover');run.events.push('grab');
    }
  }else if(run.motion==='recover'&&t>=CLIMB.recoverDuration){
    // After a fall (including a zero-height slip), resume the hand assigned to
    // this route step. Blindly toggling at the floor reverses every later reach.
    run.activeHand=run.level%2?'left':'right';run.supportingHand=otherHand(run.activeHand);stabilize(run);
  }
  else if(run.motion==='cancel'&&t>=.32){stabilize(run);}
}
export function tick(run,dt){
  if(run.ended)return {};
  run.events=[];
  if(run.resting){run.restTime+=dt;return {};}
  if(!run.tutorial)dt=Math.min(dt,Math.max(0,LIMIT-run.elapsed));
  run.elapsed+=dt;let outcome=null;
  if(run.charging){run.held+=dt;if(run.held>range(run).high+CLIMB.overholdGrace)outcome=releaseHold(run);}
  advanceMotion(run,dt);
  if(run.tutorial)return {outcome,finish:run.level>=2&&run.motion==='idle'};
  if(run.level>=COUNT&&run.summitAt===undefined)run.summitAt=run.elapsed;
  const active=run.cards.findIndex(c=>run.elapsed>=c.at&&run.elapsed<c.at+EXPOSURE);run.activeMemory=active;
  if(active>=0&&!run.shown.includes(active)){run.shown.push(active);run.seenCount=run.shown.length;}
  run.cards.forEach((card,index)=>{if(run.elapsed>=card.at+EXPOSURE&&!run.completed.includes(index))run.completed.push(index);});
  // Fast climbers stay at the summit until every scheduled image has played.
  const memoriesComplete=run.elapsed>=run.cards.at(-1).at+EXPOSURE;
  const expired=run.elapsed>=LIMIT;
  const finish=expired||(run.motion==='idle'&&run.level>=COUNT&&memoriesComplete);
  if(finish)run.climbResult=run.summitAt!==undefined?'success':'timeout';
  return {outcome,finish};
}
