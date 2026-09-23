// Shared tuning for input, articulated motion, camera and sound.
export const CLIMB = Object.freeze({
  chargeDuration: 1.55, minCharge: .46, goodWindow: .64, overholdGrace: .08,
  reachDuration: .38, grabDuration: .18, bodyDuration: .95,
  feetDuration: .62, settleDuration: .62, recoverDuration: .32, fallDuration: .46,
  playerHeight: 120, normalReachDistance: [.45,.65], challengeReachDistance: [.65,.85], cruxReachDistance: [.85,1.05],
  horizontalRouteRange: 1.15, maxReachDistance: 118, aimRadius: 21,
  holdScale: {large:29,medium:26,small:24}, holdDensity: 3,
  handSpacing: 48, handStagger: 8, shoulderWidth: 28, headClearance: 20,
  bodySpring: 160, bodyDamping: 25, nearMissDuration: .60,
  bodyFollowStrength: 26, handMoveSpeed: 25, footAdjustmentSpeed: 22,
  cameraDamping: 3.3, idleBreathingSpeed: 1.45,
  environmentWindStrength: .65, uiHoverScale: 1.018,
  audioVolume: .35, musicVolume: .24, climbingMusicVolume: .18,
  bodyX: 0, pelvisHeight: 82, upperArm: 27, forearm: 29,
  thigh: 30, shin: 31, feet: {left:{x:-14,y:139},right:{x:16,y:135}}
});
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const mix=(a,b,t)=>a+(b-a)*t;
export const damp=(a,b,speed,dt)=>mix(a,b,1-Math.exp(-speed*dt));
export const otherHand=hand=>hand==='left'?'right':'left';
