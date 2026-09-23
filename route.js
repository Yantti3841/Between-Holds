import {CLIMB,clamp,mix} from './config.js';
// Coordinates are body heights, not screen pixels. Small seeded variations
// preserve the authored easy / traverse / crux / recovery rhythm.
const pattern=[
  [0,0,'large','start'],[14,-42,'medium','normal'],[-18,-88,'medium','normal'],
  [25,-142,'medium','challenge'],[0,-183,'large','recovery'],
  [55,-206,'medium','traverse'],[4,-268,'small','crux'],
  [26,-309,'large','recovery'],[-9,-355,'small','challenge'],
  [49,-427,'small','crux'],[14,-471,'large','finish']
].map(([x,y,...rest])=>[x/120,y/120,...rest]);
export function createRoute(seed=Math.floor(Math.random()*0xffffffff)){
  let s=seed>>>0;const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const nodes=pattern.map(([x,y,size,kind],level)=>({level,x:x*CLIMB.playerHeight+(level?(random()-.5)*3:0),y:y*CLIMB.playerHeight+(level?(random()-.5)*3:0),size,kind}));
  // Each node is now a connected LEFT / RIGHT pair, not two competing
  // destinations. The lead hand is prompted; its partner follows after catch.
  const alternatives={};
  return {seed,nodes,alternatives};
}
export const pointAt=(run,level)=>run.route.nodes[clamp(level,0,10)];
export const candidates=run=>run.level>=10?[]:[pointAt(run,run.level+1),...(run.route.alternatives[run.level+1]?[run.route.alternatives[run.level+1]]:[])];
export const targetHold=run=>candidates(run)[run.choice||0]||pointAt(run,10);
export const span=run=>Math.hypot(targetHold(run).x-pointAt(run,run.level).x,targetHold(run).y-pointAt(run,run.level).y)/CLIMB.playerHeight;
export const hitRadius=hold=>CLIMB.holdScale[hold.size]*.5+6;
export const grip=(point,side)=>({x:point.x+(side==='left'?-1:1)*CLIMB.handSpacing/2,y:point.y+(side==='left'?-1:1)*CLIMB.handStagger/2});
export const targetGrip=run=>({...targetHold(run),...grip(targetHold(run),run.activeHand),side:run.activeHand});
export function reachablePair(run){
  const a=grip(pointAt(run,run.level),run.supportingHand),b=grip(targetHold(run),run.activeHand);
  // Account for the shoulder span, not just a single shoulder's arm length.
  const dx=Math.max(0,Math.abs(b.x-a.x)-CLIMB.shoulderWidth),dy=b.y-a.y;
  return Math.hypot(dx,dy)<=Math.min(CLIMB.maxReachDistance,2*(CLIMB.upperArm+CLIMB.forearm-1));
}
export const restBody=point=>({x:point.x+CLIMB.bodyX,y:point.y+CLIMB.pelvisHeight});
export const footAt=(point,side)=>({x:point.x+CLIMB.feet[side].x,y:point.y+CLIMB.feet[side].y});
export function visualPoint(run){const level=clamp(run.visual,0,10),a=pointAt(run,Math.floor(level)),b=pointAt(run,Math.ceil(level));return {x:mix(a.x,b.x,level%1),y:mix(a.y,b.y,level%1)};}
export function visibleHolds(run,total=10){
  const start=clamp(run.level-1,0,Math.max(0,total-2)),end=Math.min(total,start+CLIMB.holdDensity-1);
  return run.route.nodes.slice(start,end+1);
}
export const visibleRocks=(run,total=10)=>visibleHolds(run,total).flatMap(node=>['left','right'].map(side=>({...node,...grip(node,side),side})));
