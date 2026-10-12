(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.HA_CORE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const TUNING=Object.freeze({
    levelMinX:-4.58, levelMaxX:4.58, levelMinZ:-38.6, levelMaxZ:10.8,
    playerSpeed:5.35, playerAccel:58, playerBrake:72,
    sneakSpeed:2.55, footstepNoise:3.05, footstepCadence:.30, sneakFootstepNoise:.72, sneakCadence:.48,
    dodgeSpeed:7.15, dodgeDuration:.33, dodgeInvuln:.22, dodgeCooldown:.28,
    parryWindow:.16, parryRecovery:.22, guardPush:.34,
    targetRange:3.15, targetSnapRange:2.75,
    quickBuffer:.34, heavyBuffer:.38,
    hitStopQuick:.082, hitStopHeavy:.12, killStop:.18,
    enemySpeed:3.05, enemySprint:4.05, enemyTokenGap:.18,
    enemySight:7.4, enemyFov:2.35, hearAttack:5.4, hearDoor:7.2, hearQuietDoor:2.25, enemyAlertRadius:6.4, searchTime:1.75,
    downedTime:2.65, finisherRange:1.18, stealthRange:1.08, stealthBackAngle:.92, doorBashRange:1.45, doorOpenTime:.18,
    softRestartDelay:.08, pipePickupRange:1.28, roomGateHalfWidth:1.12,
    pipeThrowSpeed:12.4, pipeThrowLife:.68, pipeThrowRadius:.56, pipeThrowNoise:7.8,
    styleWindow:2.65, objectivePickupRange:1.18, extractionRange:1.35,
    introDuration:3.1, encounterGrace:.52,
  });

  const ATTACKS=Object.freeze({
    fists:{
      quick:[
        {name:'jab',anim:'Punch_Left',duration:.34,hitAt:.145,range:1.48,damage:1,step:.22,freeze:TUNING.hitStopQuick,knock:4.8},
        {name:'cross',anim:'Punch_Right',duration:.36,hitAt:.154,range:1.56,damage:1,step:.25,freeze:.086,knock:5.2},
        {name:'kick',anim:'Kick_Right',duration:.43,hitAt:.19,range:1.78,damage:2,step:.32,freeze:.10,knock:6.4}
      ],
      heavy:{name:'heavy_kick',anim:'Kick_Left',duration:.58,hitAt:.255,range:1.98,damage:2,step:.42,freeze:TUNING.hitStopHeavy,knock:7.6,knockdown:true}
    },
    pipe:{
      quick:[
        {name:'pipe_1',anim:'Sword_Slash',duration:.43,hitAt:.185,range:1.94,damage:2,step:.28,freeze:.105,knock:7.0},
        {name:'pipe_2',anim:'Sword_Slash',duration:.46,hitAt:.198,range:2.03,damage:2,step:.31,freeze:.11,knock:7.7},
        {name:'pipe_3',anim:'Sword_Slash',duration:.49,hitAt:.218,range:2.14,damage:3,step:.34,freeze:.12,knock:8.8}
      ],
      heavy:{name:'pipe_heavy',anim:'Sword_Slash',duration:.68,hitAt:.31,range:2.32,damage:4,step:.46,freeze:.14,knock:10.0,knockdown:true}
    }
  });

  const ENEMY_WEAPONS=Object.freeze({
    fists:{windup:.68,strike:.10,recovery:.48,range:1.48,tell:'punch'},
    pipe:{windup:.86,strike:.13,recovery:.62,range:1.98,tell:'pipe'}
  });

  const GATES=Object.freeze([
    {z:2.10,x:-1.85,half:1.10,label:'КОРИДОР'},
    {z:-5.20,x:2.00,half:1.10,label:'КУХНЯ'},
    {z:-12.60,x:-1.70,half:1.10,label:'СПАЛЬНЯ'},
    {z:-19.80,x:1.75,half:1.10,label:'КЛАДОВАЯ'},
    {z:-27.00,x:-1.55,half:1.10,label:'ГОСТИНАЯ'},
    {z:-35.10,x:0,half:1.18,label:'ДВОР'}
  ]);

  const ENCOUNTERS=Object.freeze([
    {id:'punk',kind:'punk',behavior:'sentry',x:3.15,z:4.55,hp:2,triggerZ:7.05,room:'ПРИХОЖАЯ',lesson:'J — серия · K — тяжёлый',objective:'РАЗБЕРИСЬ РУКАМИ',gate:0,aggression:.68,facing:0,teaches:'hands'},
    {id:'worker',kind:'worker',behavior:'patrol',patrol:{axis:'x',min:-4.0,max:-1.2,speed:1.15},x:-2.85,z:-1.45,hp:3,triggerZ:1.00,room:'КОРИДОР',lesson:'SHIFT — тихо · F — открыть дверь тихо',objective:'РЕШИ: ПОДКРАСТЬСЯ ИЛИ ВОРВАТЬСЯ',gate:1,aggression:.58,facing:Math.PI,teaches:'door'},
    {id:'suit',kind:'suit',behavior:'sentry',x:1.05,z:-10.15,hp:3,triggerZ:-6.25,room:'КУХНЯ',lesson:'L в последний момент — PARRY',objective:'ПОЙМАЙ ТАЙМИНГ',gate:2,aggression:.70,facing:0,teaches:'parry'},
    {id:'punk2',kind:'punk',behavior:'patrol',patrol:{axis:'x',min:-4.15,max:-1.3,speed:1.28},x:-3.10,z:-16.00,hp:3,triggerZ:-13.55,room:'СПАЛЬНЯ',lesson:'МЕБЕЛЬ РЕЖЕТ ОБЗОР · SPACE — УКЛОН',objective:'СОРВИ ЕМУ ЛИНИЮ АТАКИ',gate:3,aggression:.78,facing:Math.PI,teaches:'sight'},
    {id:'worker2',kind:'worker',behavior:'brute',x:.85,z:-23.35,hp:4,triggerZ:-20.75,room:'КЛАДОВАЯ',lesson:'K — СВАЛИТЬ · F — ДОБИТЬ',objective:'ЗАБЕРИ КАССЕТУ',gate:4,aggression:.86,facing:0,teaches:'finisher'},
    {id:'swat',kind:'swat',behavior:'opportunist',x:2.05,z:-30.55,hp:4,triggerZ:-28.15,room:'ГОСТИНАЯ',lesson:'F — взять · E — бросить трубу',objective:'РАЗБЕРИ КОМНАТУ',gate:5,aggression:.92,facing:Math.PI,teaches:'pipe',finalPair:true},
    {id:'suit2',kind:'suit',behavior:'flanker',x:-2.75,z:-32.65,hp:3,triggerZ:-28.15,room:'ГОСТИНАЯ',lesson:'ШУМ СВЯЗЫВАЕТ ВРАГОВ',objective:'РАЗБЕРИ КОМНАТУ',gate:5,aggression:.82,facing:0,teaches:'alert',finalPair:true}
  ]);

  const CHAPTERS=Object.freeze([
    {id:'arrival',title:'ЛЕСТНИЧНАЯ ПЛОЩАДКА',subtitle:'Безопасно. Осмотрись.',zMin:7.05},
    {id:'hands',title:'ПРИХОЖАЯ',subtitle:'Сначала только кулаки.',zMin:2.10},
    {id:'door',title:'КОРИДОР',subtitle:'Шум — часть боя. Дверь можно открыть тихо или выбить.',zMin:-5.20},
    {id:'parry',title:'КУХНЯ',subtitle:'Поздний блок становится parry.',zMin:-12.60},
    {id:'sight',title:'СПАЛЬНЯ',subtitle:'Стол и стены ломают линию зрения.',zMin:-19.80},
    {id:'finish',title:'КЛАДОВАЯ',subtitle:'Свалил — добей — забери кассету.',zMin:-27.00},
    {id:'pipe',title:'ГОСТИНАЯ',subtitle:'Двое. Один атакует, второй ищет угол. Шум связывает их.',zMin:-35.10},
    {id:'exit',title:'ОБРАТНЫЙ ПУТЬ',subtitle:'Кассета у тебя. Вернись на лестничную площадку.',zMin:-99}
  ]);

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function lerp(a,b,t){return a+(b-a)*t;}
  function expLerp(a,b,rate,dt){return lerp(a,b,1-Math.exp(-Math.max(0,rate)*Math.max(0,dt)));}
  function dist2(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
  function angleTo(a,b){return Math.atan2(b.x-a.x,b.z-a.z);}
  function angleDelta(a,b){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return d;}
  function angleLerp(a,b,t){return a+angleDelta(a,b)*clamp(t,0,1);}
  function attackFor(weapon,kind,comboIndex){const set=ATTACKS[weapon]||ATTACKS.fists;if(kind==='heavy')return set.heavy;const i=((comboIndex|0)%set.quick.length+set.quick.length)%set.quick.length;return set.quick[i];}
  function enemyAttackFor(weapon){return ENEMY_WEAPONS[weapon]||ENEMY_WEAPONS.fists;}
  function chooseTarget(player,enemies,maxRange=TUNING.targetRange){let best=null,bestScore=Infinity;for(const e of enemies||[]){if(!e||e.dead||e.active===false||e.state==='downed')continue;const d=dist2(player,e);if(d>maxRange)continue;const cone=Math.abs(angleDelta(player.facing||0,angleTo(player,e)));const score=d+cone*.34-(e.state==='windup'?.18:0);if(score<bestScore){best=e;bestScore=score;}}return best;}
  function clampLevel(p,r=.42){return{x:clamp(p.x,TUNING.levelMinX+r,TUNING.levelMaxX-r),z:clamp(p.z,TUNING.levelMinZ+r,TUNING.levelMaxZ-r)};}
  function separateCircles(a,b,minDist){const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);if(!d||d>=minDist)return null;const push=(minDist-d)*.5,nx=dx/d,nz=dz/d;return{ax:nx*push,az:nz*push,bx:-nx*push,bz:-nz*push};}
  function segmentIntersectsAABB(a,b,box,pad=.03){let t0=0,t1=1;const dx=b.x-a.x,dz=b.z-a.z;for(const [p,q] of [[-dx,a.x-(box.minX-pad)],[dx,(box.maxX+pad)-a.x],[-dz,a.z-(box.minZ-pad)],[dz,(box.maxZ+pad)-a.z]]){if(Math.abs(p)<1e-8){if(q<0)return false;continue;}const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}return t1>.06&&t0<.94;}
  function segmentBlocked(a,b,boxes){for(const box of boxes||[])if(box&&box.blocksVision!==false&&segmentIntersectsAABB(a,b,box))return true;return false;}
  function makeEnemy(def){return{id:def.id,kind:def.kind,behavior:def.behavior||'sentry',patrolDir:1,x:def.x,z:def.z,spawnX:def.x,spawnZ:def.z,facing:def.facing??0,hp:def.hp,maxHp:def.hp,dead:false,active:false,state:'idle',stateT:0,cooldown:.4,token:false,stagger:0,weapon:'fists',knockX:0,knockZ:0,encounter:def,lastSeenX:def.x,lastSeenZ:def.z,lostSightT:0,lastNoiseSeq:0,downedT:0,shoutCd:0};}
  function makeRunState(){return{phase:'intro',introT:0,time:0,kills:0,combo:0,comboTimer:0,currentEncounter:-1,chapter:0,dodges:0,parries:0,blocks:0,heavyHits:0,finishers:0,stealthKills:0,doorBashes:0,throws:0,score:0,styleMult:1,styleTimer:0,styleTypes:{},mission:{cassetteTaken:false,extractReady:false},gates:Array(GATES.length).fill(false),gateTimers:Array(GATES.length).fill(0),finalDefeated:false,peakStyle:1,finalCheckpoint:null,pipe:{x:-1.15,z:-31.05,owner:null,active:true,visible:true,thrown:false,vx:0,vz:0,throwT:0},player:{x:0,z:8.85,vx:0,vz:0,facing:Math.PI,hp:1,weapon:'fists',dead:false,state:'idle',stateT:0,invuln:0,parry:0,guard:false,guardT:0,dodgeCd:0,comboIndex:0,buffer:null,bufferT:0,currentAttack:null},enemies:ENCOUNTERS.map(makeEnemy)};}
  function resetRun(target){const fresh=makeRunState();if(target&&typeof target==='object'){for(const k of Object.keys(target))delete target[k];Object.assign(target,fresh);return target;}return fresh;}
  function queueInput(player,action,ttl){if(!player||!action)return false;player.buffer=action;player.bufferT=ttl??(action==='heavy'?TUNING.heavyBuffer:TUNING.quickBuffer);return true;}
  function consumeBuffer(player){if(!player||!player.buffer||player.bufferT<=0)return null;const a=player.buffer;player.buffer=null;player.bufferT=0;return a;}
  function tickBuffer(player,dt){if(!player)return;player.bufferT=Math.max(0,(player.bufferT||0)-dt);if(player.bufferT<=0)player.buffer=null;}
  function pipeCanPickup(holder,pipe){return !!holder&&!!pipe&&pipe.active&&pipe.owner==null&&dist2(holder,pipe)<=TUNING.pipePickupRange;}
  function chapterForZ(z,kills){if(kills>=7)return 7;if(kills===0)return z>7.05?0:1;if(kills===1)return 2;if(kills===2)return 3;if(kills===3)return 4;if(kills===4)return 5;if(kills===5||kills===6)return 6;return 7;}
  const STYLE_POINTS=Object.freeze({quick:90,heavy:150,parry:230,block:70,door:260,finisher:360,stealth:330,throw:320,kill:220,pickup:80,objective:650,dodge:95,break:140});
  function stylePoints(tag,mult=1){return Math.round((STYLE_POINTS[tag]||0)*Math.max(1,mult));}
  function gradeRun(score,unique=0,time=999){const bonus=Math.max(0,Math.round(3600-Math.max(0,time-55)*35));const total=(score||0)+bonus+unique*220;if(total>=9000&&unique>=6)return'S';if(total>=6900&&unique>=5)return'A';if(total>=5000&&unique>=4)return'B';if(total>=3300)return'C';return'D';}

  return{TUNING,ATTACKS,ENEMY_WEAPONS,GATES,ENCOUNTERS,CHAPTERS,clamp,lerp,expLerp,dist2,angleTo,angleDelta,angleLerp,attackFor,enemyAttackFor,chooseTarget,clampLevel,separateCircles,segmentIntersectsAABB,segmentBlocked,makeRunState,resetRun,queueInput,consumeBuffer,tickBuffer,pipeCanPickup,chapterForZ,STYLE_POINTS,stylePoints,gradeRun};
});
