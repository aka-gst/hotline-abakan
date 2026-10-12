(() => {
'use strict';
// SLICE 12: VISUAL COHESION + ARCHITECTURE + MATERIAL DEPTH

const C=window.HA_CORE;
if(!C)throw new Error('HA_CORE missing');
if(!window.THREE||!THREE.GLTFLoader){
  document.body.innerHTML='<div style="padding:40px;color:white;font:16px system-ui">Не загрузился Three.js/GLTFLoader. Запусти через ___START.command и проверь интернет.</div>';
  return;
}
const {TUNING:T,GATES,ENCOUNTERS,CHAPTERS,clamp,expLerp,dist2,angleTo,angleLerp,attackFor,enemyAttackFor,chooseTarget,clampLevel,separateCircles,segmentBlocked,makeRunState,queueInput,consumeBuffer,tickBuffer,pipeCanPickup,chapterForZ,stylePoints,gradeRun}=C;

// ---------- DOM ----------
const gameEl=document.getElementById('game');
const startPanel=document.getElementById('startPanel');
const startButton=document.getElementById('startButton');
const weaponEl=document.getElementById('weapon');
const roomEl=document.getElementById('room');
const objectiveEl=document.getElementById('objective');
const lessonEl=document.getElementById('lesson');
const combatFeed=document.getElementById('combatFeed');
const chapterCard=document.getElementById('chapterCard');
const deathPanel=document.getElementById('deathPanel');
const clearPanel=document.getElementById('clearPanel');
const scoreEl=document.getElementById('score');
const styleEl=document.getElementById('style');
const styleVerb=document.getElementById('styleVerb');
const styleMeterFill=document.querySelector('#styleMeter b');
const clearGrade=document.getElementById('clearGrade');
const clearStats=document.getElementById('clearStats');
const flashEl=document.getElementById('flash');
const pickupPrompt=document.createElement('div');pickupPrompt.id='pickupPrompt';pickupPrompt.className='hidden';document.body.appendChild(pickupPrompt);

// ---------- Scene ----------
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x020507);
scene.fog=new THREE.FogExp2(0x05090c,.0175);
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.05,120);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
gameEl.appendChild(renderer.domElement);

// Procedural micro-textures keep the room surfaces from reading as flat debug colors.
function makeSurfaceTexture(kind){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle=kind==='wood'?'#5a463d':kind==='lino'?'#52605d':kind==='carpet'?'#51434b':'#4e5659';x.fillRect(0,0,256,256);
  const rnd=(n)=>Math.sin(n*12.9898+78.233)*43758.5453%1;
  if(kind==='wood'){
    for(let y=0;y<256;y+=32){x.fillStyle='rgba(18,10,8,.18)';x.fillRect(0,y,256,2);for(let i=0;i<18;i++){const yy=y+4+(i*13)%25;x.strokeStyle=`rgba(240,205,166,${.018+(i%4)*.008})`;x.beginPath();x.moveTo(0,yy);x.bezierCurveTo(72,yy+3,156,yy-4,256,yy+2);x.stroke();}}
  }else if(kind==='lino'){
    for(let i=0;i<1700;i++){const v=95+(i*37)%80;x.fillStyle=`rgba(${v},${v+5},${v+2},${.025+(i%5)*.006})`;x.fillRect((i*73)%256,(i*151)%256,1+(i%2),1+(i%2));}
    x.strokeStyle='rgba(10,16,15,.16)';x.lineWidth=2;for(let k=0;k<256;k+=64){x.beginPath();x.moveTo(k,0);x.lineTo(k,256);x.stroke();x.beginPath();x.moveTo(0,k);x.lineTo(256,k);x.stroke();}
  }else if(kind==='carpet'){
    for(let i=0;i<4300;i++){const a=.025+(i%7)*.006;x.fillStyle=`rgba(${90+(i%35)},${58+(i%30)},${74+(i%33)},${a})`;x.fillRect((i*41)%256,(i*97)%256,1,1);}
  }else{
    for(let i=0;i<800;i++){const a=.018+(i%5)*.006;x.fillStyle=`rgba(225,230,226,${a})`;x.fillRect((i*53)%256,(i*101)%256,1+(i%3===0),1);}
    x.fillStyle='rgba(8,10,11,.08)';for(let y=26;y<256;y+=67)x.fillRect(0,y,256,1);
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return t;
}
const SURF={wood:makeSurfaceTexture('wood'),lino:makeSurfaceTexture('lino'),carpet:makeSurfaceTexture('carpet'),wall:makeSurfaceTexture('wall')};
SURF.wood.repeat.set(2.2,7);SURF.lino.repeat.set(3,8);SURF.carpet.repeat.set(3,8);SURF.wall.repeat.set(1.4,3.2);

scene.add(new THREE.HemisphereLight(0x99c7d6,0x100b10,.52));
const moon=new THREE.DirectionalLight(0xd9edff,1.25);moon.position.set(-5,12,9);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);moon.shadow.camera.left=-12;moon.shadow.camera.right=12;moon.shadow.camera.top=24;moon.shadow.camera.bottom=-28;scene.add(moon);
const roomLights=[];
const colliders=[];
const cutawayWalls=[];
function addCollider(x,z,sx,sz,tag='wall',blocksVision=true){const c={minX:x-sx/2,maxX:x+sx/2,minZ:z-sz/2,maxZ:z+sz/2,tag,blocksVision};colliders.push(c);return c;}
function addRoomLight(x,z,color,intensity=1.6){const l=new THREE.PointLight(color,intensity,9,2);l.position.set(x,2.55,z);l.userData.baseIntensity=intensity;scene.add(l);roomLights.push(l);return l;}
addRoomLight(-2.6,4.6,0x4cdcf0,1.45);
addRoomLight(2.8,-1.6,0xffa64c,1.30);
addRoomLight(-2.8,-8.9,0x8fd4ff,1.28);
addRoomLight(2.7,-16.1,0xc38cff,1.18);
addRoomLight(-2.5,-23.6,0x76d7ff,1.18);
addRoomLight(2.7,-31.5,0xff3e62,1.55);
for(const i of [2,3,5]){const l=roomLights[i];l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.bias=-.0015;l.shadow.radius=2;}

const MAT={
  outside:new THREE.MeshStandardMaterial({color:0x070b0e,roughness:.96,metalness:.03}),
  landing:new THREE.MeshStandardMaterial({color:0x263139,roughness:.87,metalness:.04}),
  wood:new THREE.MeshStandardMaterial({color:0x635049,map:SURF.wood,roughness:.78,metalness:.02}),
  lino:new THREE.MeshStandardMaterial({color:0x4f615e,map:SURF.lino,roughness:.90,metalness:.02}),
  carpet:new THREE.MeshStandardMaterial({color:0x59454e,map:SURF.carpet,roughness:.98,metalness:0}),
  wall:new THREE.MeshStandardMaterial({color:0x2f3639,map:SURF.wall,roughness:.91,metalness:.02,emissive:0x020609,emissiveIntensity:.08}),
  trim:new THREE.MeshStandardMaterial({color:0x17323a,roughness:.52,metalness:.22,emissive:0x0b4f5e,emissiveIntensity:.45}),
  gate:new THREE.MeshStandardMaterial({color:0x182025,roughness:.65,metalness:.52,emissive:0x07131a,emissiveIntensity:.42}),
  glass:new THREE.MeshPhysicalMaterial({color:0x82ddec,transparent:true,opacity:.16,roughness:.12,metalness:.0,transmission:.18,side:THREE.DoubleSide}),
  snow:new THREE.MeshStandardMaterial({color:0xaebec3,roughness:.98,metalness:0}),
  asphalt:new THREE.MeshStandardMaterial({color:0x0d1114,roughness:.98,metalness:.02}),
  cabinet:new THREE.MeshStandardMaterial({color:0x514239,roughness:.82,metalness:.03}),
  fabric:new THREE.MeshStandardMaterial({color:0x3c3037,roughness:.96,metalness:0}),
  steel:new THREE.MeshStandardMaterial({color:0x727d82,roughness:.48,metalness:.62}),
  dirtyWhite:new THREE.MeshStandardMaterial({color:0xaaa69d,roughness:.88,metalness:.02}),
  darkWood:new THREE.MeshStandardMaterial({color:0x392d27,roughness:.86,metalness:.02})
};
function box(x,y,z,sx,sy,sz,mat=MAT.wall,parent=scene){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function wallBox(x,y,z,sx,sy,sz,mat=MAT.wall,cutaway=false){const material=mat.clone();if(cutaway){material.transparent=true;material.opacity=1;material.depthWrite=true;}const m=box(x,y,z,sx,sy,sz,material);addCollider(x,z,sx,sz,'wall');if(cutaway)cutawayWalls.push(m);return m;}
function floorPatch(z,len,mat){const m=new THREE.Mesh(new THREE.PlaneGeometry(9.00,len),mat);m.rotation.x=-Math.PI/2;m.position.set(0,.003,z);m.receiveShadow=true;scene.add(m);return m;}
const outside=new THREE.Mesh(new THREE.PlaneGeometry(76,96),MAT.outside);outside.rotation.x=-Math.PI/2;outside.position.y=-.05;scene.add(outside);
floorPatch(8.65,4.1,MAT.landing);
floorPatch(4.55,4.9,MAT.wood);
floorPatch(-1.55,7.0,MAT.carpet);
floorPatch(-8.9,7.0,MAT.lino);
floorPatch(-16.2,7.0,MAT.carpet);
floorPatch(-23.6,7.0,MAT.lino);
floorPatch(-31.1,8.1,MAT.wood);
floorPatch(-37.0,4.0,MAT.landing);
function rug(x,z,sx,sz,color){const m=new THREE.Mesh(new THREE.PlaneGeometry(sx,sz),new THREE.MeshStandardMaterial({color,roughness:.98,metalness:0}));m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);m.receiveShadow=true;scene.add(m);return m;}
rug(0,4.65,3.5,2.1,0x3b2530);rug(-1.1,-1.45,5.6,1.25,0x24323a);rug(.4,-8.9,3.2,2.2,0x30433e);rug(1.1,-16.15,3.0,2.0,0x322a3d);rug(-.8,-23.6,3.8,2.0,0x263944);rug(.3,-31.35,4.4,2.8,0x43242f);
// Room identity pass: every scene gets a distinct wall tone, window/light cue and threshold.
function decoMat(color,emissive=0){return new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.06,emissive:emissive||0x000000,emissiveIntensity:emissive?.48:0});}
function wallAccent(side,z,len,color){box(side*4.40,.82,z,.055,1.42,Math.max(.6,len-.36),decoMat(color));box(side*4.385,.15,z,.07,.16,Math.max(.6,len-.26),decoMat(0x28343a,0x071b22));}
function windowGlow(z,w=1.7){const mat=new THREE.MeshStandardMaterial({color:0x6fc7df,roughness:.18,metalness:.08,emissive:0x1c8ab0,emissiveIntensity:1.25});box(4.385,1.38,z,.045,1.05,w,mat);const l=new THREE.PointLight(0x75dfff,.42,4.2,2);l.position.set(3.72,1.65,z);scene.add(l);}
function wallFrame(side,z,color){const frame=box(side*4.37,1.42,z,.045,.62,1.02,decoMat(0x151b1f));const art=box(side*4.34,1.42,z,.028,.48,.82,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.80}));art.rotation.y=0;}
function threshold(g,color){const m=new THREE.Mesh(new THREE.PlaneGeometry(g.half*1.45,.13),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.26,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(g.x,.012,g.z+.04);scene.add(m);}
wallAccent(-1,4.55,4.4,0x2d353c); wallAccent(1,4.55,4.4,0x1d3136);
wallAccent(-1,-1.55,6.5,0x25343b); wallAccent(1,-1.55,6.5,0x3a3028);
wallAccent(-1,-8.9,6.5,0x29413a); wallAccent(1,-8.9,6.5,0x3d3429);
wallAccent(-1,-16.2,6.5,0x30293d); wallAccent(1,-16.2,6.5,0x26384c);
wallAccent(-1,-23.6,6.5,0x223943); wallAccent(1,-23.6,6.5,0x3a302a);
wallAccent(-1,-31.1,7.5,0x44252e); wallAccent(1,-31.1,7.5,0x2d2835);
windowGlow(-8.65,1.85);windowGlow(-16.35,1.70);windowGlow(-31.55,2.05);
wallFrame(-1,-2.0,0xb84d5d);wallFrame(-1,-15.25,0x4f88b8);wallFrame(-1,-30.25,0xc9984f);
GATES.forEach((g,i)=>threshold(g,[0x72efff,0xffb86c,0x8fd4ff,0xc38cff,0x76d7ff,0xff536d][i]));
// Architectural finish pass: frames, skirting, fixtures and repeated cues make the apartment feel built, not boxed.
function addDoorFrame(g){const c=0x39464a;box(g.x-g.half-.055,1.12,g.z,.09,2.24,.28,decoMat(c));box(g.x+g.half+.055,1.12,g.z,.09,2.24,.28,decoMat(c));box(g.x,2.23,g.z,g.half*2+.20,.11,.28,decoMat(c));}
GATES.forEach(addDoorFrame);
function skirting(side,z,len,color=0x4f5658){box(side*4.40,.10,z,.09,.16,len,decoMat(color));}
for(const [z,len] of [[8.65,3.7],[4.55,4.5],[-1.55,6.6],[-8.9,6.6],[-16.2,6.6],[-23.6,6.6],[-31.1,7.6],[-37,3.6]]){skirting(-1,z,len);skirting(1,z,len);}
function ceilingFixture(x,z,color){const plate=decoMat(0xd7d2c7);box(x,2.54,z,.70,.055,.34,plate);const glow=decoMat(color,color);glow.emissiveIntensity=1.8;box(x,2.50,z,.54,.035,.20,glow);}
ceilingFixture(-2.5,4.65,0xa5f2ff);ceilingFixture(2.5,-1.45,0xffc58b);ceilingFixture(-2.2,-8.8,0xa4e7ff);ceilingFixture(2.5,-16.1,0xd7b4ff);ceilingFixture(-2.2,-23.6,0xb3efff);ceilingFixture(2.25,-31.3,0xff8898);
// Kitchen backsplash + bedroom headboard + living-room wall panel give each room a recognisable silhouette.
box(3.15,1.12,-8.43,2.85,.63,.055,decoMat(0x6c7772));
for(let x=1.85;x<4.40;x+=.42)box(x,1.12,-8.46,.018,.59,.075,decoMat(0x2d3535));
box(3.58,.86,-17.18,1.78,1.14,.10,decoMat(0x513f42));
box(-4.36,1.33,-31.55,.08,1.42,2.15,decoMat(0x2a2027));
for(const z of [-32.35,-31.75,-31.15,-30.55])box(-4.31,1.33,z,.055,1.27,.025,decoMat(0x5f3442));
// Small table lamps are visual-only; they create pools of warm light without new collision traps.
function tableLamp(x,z,color=0xffb76a){box(x,.73,z,.13,.46,.13,decoMat(0x493d35));const shade=box(x,.98,z,.34,.25,.34,decoMat(0x8b745e,color));shade.castShadow=false;const l=new THREE.PointLight(color,.32,3.2,2);l.position.set(x,1.05,z);scene.add(l);}
tableLamp(-1.4,-16.75,0xffa978);tableLamp(.95,-32.85,0xff7f70);
// Small non-blocking lived-in clutter on top of already-solid furniture.
box(3.55,.83,-1.75,.34,.08,.24,decoMat(0x9a7448));box(3.90,.84,-1.95,.15,.13,.15,decoMat(0xb54a3d));
box(-2.45,.93,-9.30,.25,.07,.34,decoMat(0xe0d7b5));box(-2.80,.94,-9.55,.18,.18,.18,decoMat(0x365a72));
box(-1.40,.80,-16.75,.30,.06,.22,decoMat(0x7f3f4f));box(2.88,.89,-23.55,.24,.11,.18,decoMat(0xa69a74));

wallBox(-4.55,1.32,-13.9,.22,2.64,49.2);wallBox(4.55,1.32,-13.9,.22,2.64,49.2);
wallBox(0,1.32,10.55,9.10,2.64,.22,MAT.wall,true);wallBox(0,1.32,-38.4,9.10,2.64,.22);

function splitWall(g){const edge=4.50,leftEnd=g.x-g.half,rightStart=g.x+g.half;if(leftEnd>-4.44){const width=leftEnd+4.44;wallBox(-4.44+width/2,1.32,g.z,width,2.64,.22,MAT.wall,true);}if(rightStart<4.44){const width=4.44-rightStart;wallBox(rightStart+width/2,1.32,g.z,width,2.64,.22,MAT.wall,true);}box(g.x,2.56,g.z,g.half*2+.08,.18,.24,MAT.trim);}
GATES.forEach(splitWall);
const gateMeshes=GATES.map(g=>{const m=box(g.x,1.05,g.z,g.half*1.82,2.05,.16,MAT.gate.clone());m.material.transparent=true;m.userData.closedX=g.x;m.userData.openX=g.x+(g.x<=0?-2.35:2.35);return m;});
const gateGlows=GATES.map(g=>{const l=new THREE.PointLight(0x68eafa,.45,4,2);l.position.set(g.x,1.9,g.z+.18);scene.add(l);return l;});

// Tactical doors: unlocked room doors are not scenery. They block movement/vision, swing on contact/F and can knock an enemy down.
const combatDoorDefs=[
  {x:-.85,z:-.15,w:1.85,dir:-1,label:'КОРИДОРНАЯ ДВЕРЬ'},
  {x:.70,z:-14.75,w:1.85,dir:1,label:'ДВЕРЬ В СПАЛЬНЮ'},
  {x:-.55,z:-29.30,w:1.90,dir:-1,label:'ДВЕРЬ В ГОСТИНУЮ'}
];
const combatDoors=combatDoorDefs.map((d,i)=>{const pivot=new THREE.Group();pivot.position.set(d.x,0,d.z);const mesh=box(d.w*.5,1.02,0,d.w,2.04,.13,MAT.gate.clone(),pivot);mesh.position.x=0;mesh.castShadow=true;scene.add(pivot);return{...d,i,pivot,mesh,open:0,target:0,bashCd:0};});

// Alternating partial walls create real sight-lines and force the player to read rooms instead of walking one straight lane.
wallBox(-3.35,1.16,5.75,4.30,2.32,.22,MAT.wall,true);
wallBox(2.95,1.16,-2.85,5.15,2.32,.22,MAT.wall,true);
wallBox(-2.56,1.32,-10.25,3.76,2.64,.22,MAT.wall,true);
wallBox(2.47,1.32,-17.45,3.94,2.64,.22,MAT.wall,true);
wallBox(-2.46,1.32,-25.00,3.96,2.64,.22,MAT.wall,true);
wallBox(3.85,.34,-23.15,1.05,.68,1.05,new THREE.MeshStandardMaterial({color:0x5d4938,roughness:.92}),false);wallBox(2.85,.26,-24.55,.78,.52,.78,new THREE.MeshStandardMaterial({color:0x514031,roughness:.94}),false);
[-.3,-8.8,-16.1,-23.7,-31.3].forEach(z=>{box(4.41,1.18,z,.06,1.55,3.0,MAT.glass);box(4.36,2.02,z,.11,.09,3.1,MAT.trim);});
const snow=new THREE.Mesh(new THREE.PlaneGeometry(23,58),MAT.snow);snow.rotation.x=-Math.PI/2;snow.position.set(14,-.025,-13);scene.add(snow);
const road=new THREE.Mesh(new THREE.PlaneGeometry(8.5,60),MAT.asphalt);road.rotation.x=-Math.PI/2;road.position.set(11,-.018,-13);scene.add(road);
for(let z=-39;z<16;z+=5.2)box(11,.012,z,.12,.02,2.2,new THREE.MeshBasicMaterial({color:0xd8d2bd,transparent:true,opacity:.32}));

function makeBackdropTexture(){const c=document.createElement('canvas');c.width=1024;c.height=384;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,384);g.addColorStop(0,'#06141c');g.addColorStop(.54,'#142635');g.addColorStop(1,'#27121d');x.fillStyle=g;x.fillRect(0,0,1024,384);x.fillStyle='#b5e8ff';for(let i=0;i<90;i++){const px=Math.random()*1024,py=Math.random()*160,r=Math.random()*1.5+.3;x.globalAlpha=.18+Math.random()*.55;x.fillRect(px,py,r,r);}x.globalAlpha=1;for(let i=0;i<34;i++){const w=18+Math.random()*52,h=40+Math.random()*160,left=i*32-20;x.fillStyle=i%4===0?'#10151d':'#0a0e14';x.fillRect(left,384-h,w,h);if(i%3===0){x.fillStyle='#ffbf70';for(let yy=384-h+16;yy<372;yy+=18)for(let xx=left+8;xx<left+w-4;xx+=13)if(Math.random()>.6)x.fillRect(xx,yy,3,4);}}x.fillStyle='#d9f1ff';x.font='700 18px system-ui';x.globalAlpha=.35;x.fillText('АБАКАН · −19°',32,46);return new THREE.CanvasTexture(c);}
const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(58,21),new THREE.MeshBasicMaterial({map:makeBackdropTexture(),fog:false}));backdrop.position.set(7,7.6,-49);scene.add(backdrop);

// SCALE BIBLE: the same asset has the same physical size in every room.
const objLoader=THREE.OBJLoader?new THREE.OBJLoader():null;
const PROP_SPECS=Object.freeze({
  'Chair.obj':{h:.88,w:.48,d:.56},
  'Table.obj':{h:.74,w:1.30,d:2.48}, // this source mesh is a long dining table, not a desk
  'Bookcase.obj':{h:1.82,w:1.00,d:.38},
  'Door1.obj':{h:2.06,w:1.07,d:.16},
  'Kitchen_Fridge.obj':{h:1.82,w:.72,d:.72},
  'Kitchen_Oven.obj':{h:.90,w:.57,d:.63},
  'Kitchen_Sink.obj':{h:.90,w:.48,d:.53},
  'Bathroom_WashingMachine.obj':{h:.88,w:.78,d:.80},
  'Sofa.obj':{h:.86,w:2.42,d:1.02},
  'Trashcan_Large.obj':{h:.82,w:.55,d:.55},
  'NormalCar1.obj':{h:1.31,w:2.02,d:4.70}
});
function assetName(path){return path.split('/').pop();}
const mtlPaletteCache=new Map();
function loadMtlPalette(path){if(!/\.obj$/i.test(path))return Promise.resolve(null);const url=path.replace(/\.obj$/i,'.mtl');if(mtlPaletteCache.has(url))return mtlPaletteCache.get(url);const req=fetch(url).then(r=>r.ok?r.text():null).then(txt=>{if(!txt)return null;const map=new Map();let cur=null;for(const raw of txt.split(/\r?\n/)){const line=raw.trim();if(line.startsWith('newmtl ')){cur=line.slice(7).trim();if(cur&&!map.has(cur))map.set(cur,{color:[.32,.32,.32],spec:[.12,.12,.12],ns:32});}else if(cur&&line.startsWith('Kd ')){const v=line.slice(3).trim().split(/\s+/).map(Number);if(v.length>=3)map.get(cur).color=v.slice(0,3);}else if(cur&&line.startsWith('Ks ')){const v=line.slice(3).trim().split(/\s+/).map(Number);if(v.length>=3)map.get(cur).spec=v.slice(0,3);}else if(cur&&line.startsWith('Ns ')){map.get(cur).ns=Number(line.slice(3).trim())||32;}}return map;}).catch(()=>null);mtlPaletteCache.set(url,req);return req;}
function tintObject(obj,color,roughness=.82,metalness=.07,palette=null){const accent=new THREE.Color(color);obj.traverse(o=>{if(!o.isMesh)return;const src=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];const mats=(src.length?src:[{name:''}]).map(m=>{const name=m?.name||'';const p=palette?.get(name);const base=p?new THREE.Color(...p.color):accent.clone();if(p)base.lerp(accent,.045);const glass=/glass|window/i.test(name),metal=/metal|chrome|steel/i.test(name),fabric=/sofa|cush|cloth/i.test(name),wood=/wood/i.test(name);const spec=p?Math.max(...p.spec):.12;const ns=p?.ns||32;let r=roughness;if(glass)r=.16;else if(fabric)r=.93;else if(wood)r=.76;else r=clamp(1-Math.log2(Math.max(2,ns))/10,.34,.86);let met=metal?clamp(.35+spec*.4,.38,.72):metalness;if(glass)met=.04;return new THREE.MeshStandardMaterial({name,color:base,roughness:r,metalness:met,transparent:glass,opacity:glass?.40:1,side:glass?THREE.DoubleSide:THREE.FrontSide});});o.material=Array.isArray(o.material)?mats:mats[0];o.castShadow=true;o.receiveShadow=true;});}
function normalizeObjToHeight(obj,targetH){const b=new THREE.Box3().setFromObject(obj),h=Math.max(.001,b.max.y-b.min.y);obj.scale.setScalar(targetH/h);return new THREE.Box3().setFromObject(obj);}
function rotatedFootprint(spec,rot){if(!spec)return null;const c=Math.abs(Math.cos(rot||0)),sn=Math.abs(Math.sin(rot||0));return[spec.w*c+spec.d*sn,spec.w*sn+spec.d*c];}
function loadProp(path,pos,targetH=.9,rot=0,color=0x37444a,footprint=null){const spec=PROP_SPECS[assetName(path)];const h=spec?.h??targetH;const fp=rotatedFootprint(spec,rot)||footprint;if(fp)addCollider(pos.x,pos.z,fp[0],fp[1],'prop');if(!objLoader)return;objLoader.load(path,obj=>{loadMtlPalette(path).then(pal=>tintObject(obj,color,.82,.07,pal));const b2=normalizeObjToHeight(obj,h);obj.position.set(pos.x-b2.getCenter(new THREE.Vector3()).x,pos.y-b2.min.y,pos.z-b2.getCenter(new THREE.Vector3()).z);obj.rotation.y=rot;scene.add(obj);},undefined,()=>{});}
function loadPropInto(path,parent,pos,targetH=.9,rot=0,color=0x37444a){const spec=PROP_SPECS[assetName(path)];const h=spec?.h??targetH;if(!objLoader)return;objLoader.load(path,obj=>{loadMtlPalette(path).then(pal=>tintObject(obj,color,.82,.07,pal));const b2=normalizeObjToHeight(obj,h);obj.position.set(pos.x-b2.getCenter(new THREE.Vector3()).x,pos.y-b2.min.y,pos.z-b2.getCenter(new THREE.Vector3()).z);obj.rotation.y=rot;parent.add(obj);},undefined,()=>{});}
function solidSetpiece(x,z,sx,sz,h,color=0x4a3b32,y=h*.5){addCollider(x,z,sx,sz,'setpiece');return box(x,y,z,sx,h,sz,new THREE.MeshStandardMaterial({color,roughness:.88,metalness:.03}));}
function decoBox(x,y,z,sx,sy,sz,color,emissive=0){return box(x,y,z,sx,sy,sz,new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.05,emissive:emissive||0x000000,emissiveIntensity:emissive?.55:0}));}
function makeBed(x,z){solidSetpiece(x,z,1.55,2.05,.32,0x4b4142,.16);decoBox(x,.34,z,1.47,.18,1.96,0x5d5353);decoBox(x,.46,z-.73,1.34,.11,.42,0xaaa49d);decoBox(x,.29,z+.54,1.35,.08,.62,0x6c3441);}
function makeTVCorner(x,z){solidSetpiece(x,z,.55,1.75,.44,0x332824,.22);decoBox(x,.88,z,.10,.90,1.28,0x15191c,0x081a22);decoBox(x-.02,.90,z,.035,.78,1.12,0x15242c,0x0f6681);}
function makeCrateStack(x,z,count=3){for(let i=0;i<count;i++){const ox=(i%2)*.48,oz=Math.floor(i/2)*.48;solidSetpiece(x+ox,z+oz,.42,.42,.40,0x634a35,.20);decoBox(x+ox,.405,z+oz,.34,.025,.34,0x8a6a4a);}}
function makeKitchenCabinets(){for(const x of [1.65,2.45,3.25,4.05]){decoBox(x,1.74,-8.18,.70,.58,.40,0x59453a);decoBox(x,1.48,-8.39,.62,.04,.26,0x211a17);}decoBox(3.20,.78,-8.55,3.35,.09,.56,0x6b5949);}
function makeCoatWall(){decoBox(-4.26,1.20,4.85,.08,.82,2.05,0x2e3538);for(const z of [4.15,4.65,5.15,5.65]){decoBox(-4.13,1.48,z,.18,.05,.05,0x9aa6aa);}}

// Use the user's actual door model as the visible skin while the simple box remains the collision authority.
for(const d of combatDoors){d.mesh.material.opacity=.0;d.mesh.material.transparent=true;loadPropInto('assets/props/Door1.obj',d.pivot,{x:d.w*.50,y:0,z:0},2.02,0,0x5a4435);}

// Authored room kits: real prop meshes + compact procedural setpieces.
makeCoatWall();
solidSetpiece(-2.85,5.35,1.75,.54,.44,0x574235,.22); // foyer bench
decoBox(-2.85,.51,5.35,1.55,.09,.42,0x755943);
decoBox(-1.95,.19,5.65,.42,.24,.32,0x4d3a2e);decoBox(-2.35,.19,5.65,.42,.24,.32,0x4d3a2e);
// Corridor utility / radiator wall gives depth without blocking the central line.
decoBox(4.22,.48,-1.55,.18,.74,2.25,0x8a918f);for(const z of [-2.30,-1.80,-1.30,-.80])decoBox(4.08,.49,z,.08,.62,.06,0xb1b5b0);
makeKitchenCabinets();
makeBed(3.58,-16.15);
solidSetpiece(3.96,-18.05,.78,.48,1.86,0x49392f,.93); // full-height wardrobe
decoBox(3.96,1.72,-18.05,.56,.10,.38,0x6d5748);
makeCrateStack(2.75,-25.10,3);
makeCrateStack(-2.65,-22.25,2);
makeTVCorner(-4.06,-31.55);
solidSetpiece(1.10,-33.25,1.25,.52,.48,0x49372f,.24); // low media bench
decoBox(1.10,.53,-33.25,1.05,.08,.38,0x75574b);

// Fragile room dressing: not a collider, but heavy hits / pipe throws can permanently trash it for this run.
const breakables=[];
function addBreakable(kind,x,z,color=0xc9d1d4,linkedLight=null){
  const root=new THREE.Group();root.position.set(x,0,z);if(kind==='frame')root.rotation.y=Math.PI/2;scene.add(root);
  const mat=new THREE.MeshStandardMaterial({color,roughness:.62,metalness:kind==='bottle'?.18:.06,emissive:0x000000});
  let intact;
  if(kind==='bottle'){
    intact=new THREE.Mesh(new THREE.CylinderGeometry(.075,.095,.48,10),mat);intact.position.y=.24;
  }else if(kind==='lamp'){
    intact=new THREE.Group();const stem=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.62,8),mat),shade=new THREE.Mesh(new THREE.ConeGeometry(.18,.24,12,1,true),mat.clone());stem.position.y=.31;shade.position.y=.66;intact.add(stem,shade);
  }else{
    intact=new THREE.Mesh(new THREE.BoxGeometry(.54,.42,.045),mat);intact.position.y=.72;
  }
  root.add(intact);
  const item={kind,x,z,root,intact,broken:false,debris:[],linkedLight};breakables.push(item);return item;
}
function breakOne(item,force=1){
  if(!item||item.broken)return false;item.broken=true;item.intact.visible=false;if(item.linkedLight)item.linkedLight.intensity=.12;
  const pieces=item.kind==='bottle'?5:(item.kind==='lamp'?6:4);
  for(let i=0;i<pieces;i++){
    const g=item.kind==='bottle'?new THREE.BoxGeometry(.045,.035,.10):new THREE.BoxGeometry(.10,.035,.13);
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:item.kind==='bottle'?0x88aab3:0x756052,roughness:.75,metalness:.10}));
    const a=(i/pieces)*Math.PI*2+.37,rad=.16+.07*(i%3);m.position.set(Math.sin(a)*rad,.025,Math.cos(a)*rad);m.rotation.set(.2*i,a,.4*i);item.root.add(m);item.debris.push(m);
  }
  const pos=new THREE.Vector3(item.x,.48,item.z);spawnSparks(pos,item.kind==='bottle'?0x9deeff:0xffcf86,force>1.1);playRecipe('clash',item.kind==='bottle'?.34:.23);return true;
}
function damageBreakables(x,z,radius=.95,force=1){
  let n=0;for(const b of breakables){if(b.broken)continue;if(Math.hypot(b.x-x,b.z-z)<=radius&&breakOne(b,force))n++;}
  if(n){emitNoise(x,z,Math.max(2.2,radius*3.0),'debris');cameraImpact=Math.max(cameraImpact,.26+.10*n);shake=Math.max(shake,.10+.05*n);if(run?.phase==='playing'){awardStyle('break');feed(n>1?'ОКРУЖЕНИЕ · ВДРЕБЕЗГИ':'ОКРУЖЕНИЕ · РАЗБИТО','gold');}}
  return n;
}
function resetBreakables(){for(const b of breakables){b.broken=false;b.intact.visible=true;if(b.linkedLight)b.linkedLight.intensity=b.linkedLight.userData.baseIntensity||1.2;for(const m of b.debris){b.root.remove(m);m.geometry?.dispose?.();m.material?.dispose?.();}b.debris.length=0;}}
// Landing / foyer — shoe bench, coat wall, seating, actual apartment door visual.
loadProp('assets/props/Trashcan_Large.obj',{x:-3.98,y:0,z:7.65},.82,.2,0x3b484d);
loadProp('assets/props/Bookcase.obj',{x:3.98,y:0,z:4.15},1.82,-Math.PI/2,0x5e4938);
loadProp('assets/props/Chair.obj',{x:-3.85,y:0,z:3.85},.88,.5,0x6a493b);
loadProp('assets/props/Door1.obj',{x:1.85,y:0,z:2.05},2.02,0,0x604938);
// Corridor — compressed domestic mess / sight-line blockers.
solidSetpiece(4.20,-1.95,1.15,.42,.70,0x62503f,.35);decoBox(4.20,.73,-1.95,1.02,.06,.34,0x7b6048);
loadProp('assets/props/Chair.obj',{x:-3.85,y:0,z:-3.08},.76,-.6,0x674b3d,[.75,.75]);
loadProp('assets/props/Bookcase.obj',{x:-3.98,y:0,z:-.75},1.82,Math.PI/2,0x584536);
loadProp('assets/props/Trashcan_Large.obj',{x:3.94,y:0,z:-3.98},.82,0,0x36434a);
// Kitchen — a real appliance wall + dining corner.
loadProp('assets/props/Kitchen_Fridge.obj',{x:3.98,y:0,z:-8.08},1.82,Math.PI,0xb6c4c8);
loadProp('assets/props/Kitchen_Oven.obj',{x:3.33,y:0,z:-8.10},.92,Math.PI,0x34383b,[.85,.8]);
loadProp('assets/props/Kitchen_Sink.obj',{x:2.25,y:0,z:-8.10},.92,Math.PI,0x7b8589,[.95,.8]);
loadProp('assets/props/Bathroom_WashingMachine.obj',{x:1.20,y:0,z:-8.08},.92,Math.PI,0xa8adae,[.90,.85]);
loadProp('assets/props/Table.obj',{x:-2.48,y:0,z:-9.45},.82,.2,0x76543e,[1.9,1.05]);
loadProp('assets/props/Chair.obj',{x:-4.05,y:0,z:-9.10},.78,1.1,0x684b3b,[.75,.75]);
loadProp('assets/props/Chair.obj',{x:-1.15,y:0,z:-10.50},.72,.4,0x62483c,[.72,.72]);
// Bedroom — bed setpiece, wardrobe, reading corner.
loadProp('assets/props/Bookcase.obj',{x:-3.98,y:0,z:-15.72},1.82,Math.PI/2,0x594638);
loadProp('assets/props/Chair.obj',{x:-2.85,y:0,z:-17.58},.74,.4,0x664b42,[.75,.75]);
solidSetpiece(-1.55,-16.90,1.18,.62,.72,0x4d3b31,.36);decoBox(-1.55,.75,-16.90,1.05,.07,.52,0x6b5546);
loadProp('assets/props/Chair.obj',{x:3.98,y:0,z:-18.35},.88,-.4,0x5c4339);
// Storage / utility — washing machine, shelves, boxes, cassette table.
loadProp('assets/props/Bathroom_WashingMachine.obj',{x:3.94,y:0,z:-22.35},.94,Math.PI,0x9da3a4,[.90,.86]);
solidSetpiece(3.25,-23.72,1.50,.58,.78,0x654f40,.39);decoBox(3.25,.81,-23.72,1.36,.06,.50,0x82664c);
loadProp('assets/props/Trashcan_Large.obj',{x:-4.08,y:0,z:-24.05},.72,.2,0x39454a,[.8,.8]);
loadProp('assets/props/Bookcase.obj',{x:-3.98,y:0,z:-22.00},1.82,Math.PI/2,0x554437);
loadProp('assets/props/Bookcase.obj',{x:3.98,y:0,z:-25.55},1.82,-Math.PI/2,0x594637);
// Final living room — sofa/TV/table/chairs create three distinct lanes.
loadProp('assets/props/Sofa.obj',{x:3.58,y:0,z:-32.25},.86,-Math.PI/2,0x52303a);
solidSetpiece(-1.75,-31.10,1.55,.82,.36,0x49372f,.18);decoBox(-1.75,.39,-31.10,1.38,.06,.70,0x745747);
loadProp('assets/props/Chair.obj',{x:-4.02,y:0,z:-33.02},.82,.8,0x69473a,[.78,.78]);
loadProp('assets/props/Chair.obj',{x:3.90,y:0,z:-29.95},.74,-.9,0x68483b,[.74,.74]);
loadProp('assets/props/Bookcase.obj',{x:3.98,y:0,z:-29.65},1.82,-Math.PI/2,0x4b3a31);
decoBox(-.75,.44,-31.10,.22,.42,.18,0x8a6f55);decoBox(-1.10,.41,-30.85,.18,.36,.18,0x667d85);decoBox(2.10,.10,-30.30,.65,.05,.42,0x9a8b6d);
// Outside — use the old urban kit instead of an empty plane.
loadProp('assets/props/NormalCar1.obj',{x:10.9,y:0,z:2.7},1.31,Math.PI/2,0x263f50);
loadProp('assets/urban/street/Streetlight_Single.obj',{x:8.2,y:0,z:5.6},3.2,0,0x2c353a);
loadProp('assets/urban/street/Streetlight_Single.obj',{x:8.2,y:0,z:-14.2},3.2,0,0x2c353a);
loadProp('assets/urban/street/Streetlight_Single.obj',{x:8.2,y:0,z:-31.2},3.2,0,0x2c353a);
loadProp('assets/urban/kenney/detail-bench.obj',{x:7.25,y:0,z:-5.0},.78,Math.PI/2,0x4e5b5d);
loadProp('assets/urban/kenney/detail-dumpster-closed.obj',{x:7.25,y:0,z:-22.5},1.18,Math.PI/2,0x314b47);
loadProp('assets/urban/street/Sign_NoParking.obj',{x:8.0,y:0,z:-8.0},2.1,0,0x71777a);
loadProp('assets/urban/buildings/4Story_Center.obj',{x:18.5,y:0,z:-12.0},9.0,-Math.PI/2,0x222b31);
// Small fragile props make missed heavy swings and pipe throws leave readable consequences.
addBreakable('frame',-4.22,-1.55,0xb75a67);addBreakable('bottle',3.48,-9.15,0x78a7b0);
addBreakable('lamp',-3.65,-16.15,0xe0b16b,roomLights[3]);addBreakable('bottle',2.62,-23.80,0x9aafb4);
addBreakable('frame',4.22,-31.15,0xc38a58);addBreakable('lamp',1.55,-32.75,0xe46b86,roomLights[5]);
addBreakable('bottle',-2.20,-9.15,0x7a9ca3);addBreakable('frame',-4.22,-16.45,0x628cb8);addBreakable('bottle',3.15,-31.40,0xb6a37d);
// ---------- pipe ----------
const pipeMat=new THREE.MeshStandardMaterial({color:0xa8bac2,roughness:.23,metalness:.92,emissive:0x2bdcf2,emissiveIntensity:.18});
function makePipeMesh(){const root=new THREE.Group(),shaft=new THREE.Mesh(new THREE.CylinderGeometry(.055,.063,1.38,12),pipeMat.clone());shaft.rotation.z=Math.PI/2;shaft.castShadow=true;root.add(shaft);const grip=new THREE.Mesh(new THREE.CylinderGeometry(.069,.069,.28,10),new THREE.MeshStandardMaterial({color:0x121416,roughness:.9}));grip.rotation.z=Math.PI/2;grip.position.x=-.54;root.add(grip);return root;}
const pipeWorld=makePipeMesh();pipeWorld.visible=false;scene.add(pipeWorld);
const pickupRing=new THREE.Mesh(new THREE.RingGeometry(.55,.62,42),new THREE.MeshBasicMaterial({color:0x68eafa,transparent:true,opacity:.68,side:THREE.DoubleSide,depthWrite:false}));pickupRing.rotation.x=-Math.PI/2;pickupRing.visible=false;scene.add(pickupRing);
const pipeSpot=new THREE.PointLight(0x4ae9ff,1.25,4.2,2);pipeSpot.position.set(-1.15,1.3,-31.05);scene.add(pipeSpot);

// ---------- mission objective: cassette ----------
const cassettePos={x:-3.25,z:-24.05};
const cassette=new THREE.Group();
const cassetteBody=new THREE.Mesh(new THREE.BoxGeometry(.54,.10,.34),new THREE.MeshStandardMaterial({color:0x1b2024,roughness:.58,metalness:.22,emissive:0x4d0717,emissiveIntensity:.18}));
cassetteBody.position.y=.14;cassette.add(cassetteBody);
for(const x of [-.13,.13]){const reel=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.025,18),new THREE.MeshBasicMaterial({color:0xff4c70}));reel.rotation.x=Math.PI/2;reel.position.set(x,.205,.03);cassette.add(reel);}
cassette.position.set(cassettePos.x,0,cassettePos.z);cassette.visible=false;scene.add(cassette);
const cassetteRing=new THREE.Mesh(new THREE.RingGeometry(.48,.56,42),new THREE.MeshBasicMaterial({color:0xff4f70,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));cassetteRing.rotation.x=-Math.PI/2;cassetteRing.position.set(cassettePos.x,.02,cassettePos.z);cassetteRing.visible=false;scene.add(cassetteRing);
const cassetteLight=new THREE.PointLight(0xff315b,1.1,3.6,2);cassetteLight.position.set(cassettePos.x,.9,cassettePos.z);cassetteLight.visible=false;scene.add(cassetteLight);

// Extraction is deliberately back at the stair landing: after the violence the player walks the apartment backwards.
const extractPos={x:0,z:8.85};
const extractRing=new THREE.Mesh(new THREE.RingGeometry(.72,.86,48),new THREE.MeshBasicMaterial({color:0x78ffb4,transparent:true,opacity:.0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));extractRing.rotation.x=-Math.PI/2;extractRing.position.set(extractPos.x,.024,extractPos.z);extractRing.visible=false;scene.add(extractRing);
const extractLight=new THREE.PointLight(0x6dffae,0,5.0,2);extractLight.position.set(extractPos.x,1.4,extractPos.z);scene.add(extractLight);

// ---------- audio ----------
let audioCtx=null,master=null,ambientGain=null,ambientNodes=[],musicClock=null,musicStep=0,musicIntensity=.22;
const RECIPES={
  swing:[{k:'noise',d:.14,f:'bandpass',hz:1500,g:.42,q:1.2}],
  impact:[{k:'tone',type:'sine',from:240,to:55,d:.20,g:.44},{k:'noise',d:.14,f:'lowpass',hz:900,g:.35},{k:'tone',type:'square',from:110,to:45,d:.10,g:.17}],
  clash:[{k:'tone',type:'square',from:1400,to:700,d:.12,g:.23},{k:'noise',d:.12,f:'highpass',hz:3000,g:.21}],
  kill:[{k:'noise',d:.28,f:'lowpass',hz:1200,g:.52},{k:'tone',type:'sawtooth',from:140,to:40,d:.30,g:.39}],
  throw:[{k:'noise',d:.12,f:'bandpass',hz:1900,g:.32,q:1.6},{k:'tone',type:'triangle',from:520,to:150,d:.18,g:.16}],
  objective:[{k:'tone',type:'square',from:430,to:860,d:.10,g:.18},{k:'tone',type:'sine',from:860,to:1120,d:.16,g:.13}],
  step:[{k:'tone',type:'sine',from:120,to:60,d:.05,g:.055},{k:'noise',d:.05,f:'lowpass',hz:900,g:.04}],
  slam:[{k:'tone',type:'sine',from:150,to:45,d:.22,g:.48},{k:'noise',d:.18,f:'lowpass',hz:700,g:.36}],
  pickup:[{k:'tone',type:'square',from:620,to:940,d:.09,g:.13}],
  dodge:[{k:'noise',d:.09,f:'bandpass',hz:1750,g:.09}],
  death:[{k:'tone',type:'sawtooth',from:420,to:40,d:.65,g:.25},{k:'noise',d:.38,f:'lowpass',hz:700,g:.20}]
};
function musicTick(){
  if(!audioCtx||audioCtx.state==='suspended'||!master)return;const t=audioCtx.currentTime,step=musicStep++%16;
  const tone=(type,from,to,d,g)=>{const o=audioCtx.createOscillator(),gg=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+d);gg.gain.setValueAtTime(g,t);gg.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(gg);gg.connect(master);o.start(t);o.stop(t+d+.02);};
  if(step%4===0)tone('sine',96,44,.11,.055+musicIntensity*.045);
  if(step%8===0){const bass=[55,65.4,73.4,49][(step/8+(run.kills||0))%4|0];tone('sawtooth',bass,bass*.96,.19,.015+musicIntensity*.018);}
  if(musicIntensity>.48&&step%2===1){const n=Math.max(1,(audioCtx.sampleRate*.035)|0),buf=audioCtx.createBuffer(1,n,audioCtx.sampleRate),a=buf.getChannelData(0);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);const src=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();src.buffer=buf;f.type='highpass';f.frequency.value=5200;g.gain.value=.010+musicIntensity*.010;src.connect(f);f.connect(g);g.connect(master);src.start(t);}
}
function ensureAudio(){if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();return;}audioCtx=new (window.AudioContext||window.webkitAudioContext)();master=audioCtx.createGain();master.gain.value=.72;master.connect(audioCtx.destination);ambientGain=audioCtx.createGain();ambientGain.gain.value=.028;ambientGain.connect(master);const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=260;filter.Q.value=.55;filter.connect(ambientGain);for(const [hz,type,g] of [[55,'sawtooth',.65],[82.5,'triangle',.36]]){const o=audioCtx.createOscillator(),gg=audioCtx.createGain();o.type=type;o.frequency.value=hz;gg.gain.value=g;o.connect(gg);gg.connect(filter);o.start();ambientNodes.push(o,gg);}musicClock=setInterval(musicTick,60000/108/4);}
function playRecipe(name,scale=1){if(!audioCtx||!master)return;const t=audioCtx.currentTime;for(const l of RECIPES[name]||[]){if(l.k==='tone'){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=l.type||'sine';o.frequency.setValueAtTime(l.from,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,l.to),t+l.d);g.gain.setValueAtTime((l.g||.1)*scale,t);g.gain.exponentialRampToValueAtTime(.0001,t+l.d);o.connect(g);g.connect(master);o.start(t);o.stop(t+l.d+.02);}else{const n=Math.max(1,(audioCtx.sampleRate*l.d)|0),buf=audioCtx.createBuffer(1,n,audioCtx.sampleRate),a=buf.getChannelData(0);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);const s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();s.buffer=buf;f.type=l.f||'bandpass';f.frequency.value=l.hz||1200;f.Q.value=l.q||.8;g.gain.value=(l.g||.1)*scale;s.connect(f);f.connect(g);g.connect(master);s.start(t);}}}
function updateAmbient(combat){musicIntensity=combat?.82:.24;if(!audioCtx||!ambientGain)return;ambientGain.gain.setTargetAtTime(combat?.052:.025,audioCtx.currentTime,.16);}

// ---------- Models / presentation ----------
const gltfLoader=new THREE.GLTFLoader();
function loadGLTF(url){return new Promise((resolve,reject)=>gltfLoader.load(url,resolve,undefined,reject));}
const ACTOR_HEIGHTS=Object.freeze({player:1.82,punk:1.79,worker:1.86,suit:1.83,swat:1.88});
function normalizeModel(obj,targetHeight=1.82){obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if('roughness'in m)m.roughness=Math.max(.58,m.roughness??.72);if('metalness'in m)m.metalness=Math.min(.28,m.metalness??.05);}}}});let b=new THREE.Box3().setFromObject(obj),h=Math.max(.001,b.max.y-b.min.y);obj.scale.setScalar(targetHeight/h);b=new THREE.Box3().setFromObject(obj);obj.position.y-=b.min.y;}
function mapClips(gltf){const out={};for(const c of gltf.animations||[])out[c.name]=c;return out;}
function tintModel(obj,hex,em=.025,mix=.018){obj.traverse(o=>{if(!o.isMesh||!o.material)return;const src=Array.isArray(o.material)?o.material:[o.material];const arr=src.map(m=>{const q=m.clone();if(q.color)q.color.lerp(new THREE.Color(hex),mix);if(q.emissive){q.emissive.set(hex);q.emissiveIntensity=em;}return q;});o.material=Array.isArray(o.material)?arr:arr[0];});}
function addActorGear(root,kind,isPlayer=false){
  // The supplied character meshes already have readable silhouettes/clothes.
  // Only the player keeps a tiny cyan wrist marker; no blocky costume overlays on enemies.
  if(!isPlayer)return;
  const m=new THREE.Mesh(new THREE.BoxGeometry(.045,.025,.11),new THREE.MeshStandardMaterial({color:0x21cce8,roughness:.48,metalness:.16,emissive:0x21cce8,emissiveIntensity:.07}));
  m.position.set(-.22,1.27,.04);m.castShadow=true;root.add(m);
}
class ActorView{
  constructor(gltf,kind,isPlayer=false){this.kind=kind;this.isPlayer=isPlayer;this.group=new THREE.Group();this.bodyRoot=new THREE.Group();this.shadowBlob=new THREE.Mesh(new THREE.CircleGeometry(.34,28),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.34,depthWrite:false}));this.shadowBlob.rotation.x=-Math.PI/2;this.shadowBlob.position.y=.012;this.shadowBlob.scale.set(1,.58,1);this.group.add(this.shadowBlob);this.model=gltf.scene;normalizeModel(this.model,ACTOR_HEIGHTS[isPlayer?'player':kind]||1.82);const tint=isPlayer?0x39bed4:(kind==='worker'?0xc98252:(kind==='swat'?0x8b3b45:(kind==='suit'?0xb49b60:0x9a4663)));tintModel(this.model,tint,isPlayer?.035:.018,isPlayer?.025:.012);this.bodyRoot.add(this.model);addActorGear(this.bodyRoot,kind,isPlayer);this.group.add(this.bodyRoot);scene.add(this.group);this.baseModelPos=this.model.position.clone();this.clips=mapClips(gltf);this.mixer=new THREE.AnimationMixer(this.model);this.action=null;this.current='';this.wrist=this.model.getObjectByName('Wrist.R')||null;this.head=this.model.getObjectByName('Head')||null;this.neck=this.model.getObjectByName('Neck')||null;this.weaponRoot=makePipeMesh();this.group.add(this.weaponRoot);this.weaponRoot.visible=false;this.tell=new THREE.Mesh(new THREE.RingGeometry(.50,.60,44),new THREE.MeshBasicMaterial({color:0xff6a3d,transparent:true,opacity:.0,side:THREE.DoubleSide,depthWrite:false}));this.tell.rotation.x=-Math.PI/2;this.tell.position.y=.026;this.group.add(this.tell);this.warn=new THREE.Mesh(new THREE.SphereGeometry(.105,12,8),new THREE.MeshBasicMaterial({color:0xff5b52,transparent:true,opacity:0,depthWrite:false}));this.warn.position.set(0,2.12,0);this.warn.visible=false;this.group.add(this.warn);this.sense=new THREE.Mesh(new THREE.OctahedronGeometry(.105,0),new THREE.MeshBasicMaterial({color:0xffcf63,transparent:true,opacity:.0,depthWrite:false}));this.sense.position.set(0,2.33,0);this.sense.visible=false;this.group.add(this.sense);this.threatLine=new THREE.Mesh(new THREE.PlaneGeometry(.16,1.45),new THREE.MeshBasicMaterial({color:0xff554f,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));this.threatLine.rotation.x=-Math.PI/2;this.threatLine.position.set(0,.018,.72);this.threatLine.visible=false;this.group.add(this.threatLine);this.hitHalo=new THREE.Mesh(new THREE.SphereGeometry(.64,16,9),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,wireframe:true,depthWrite:false}));this.hitHalo.position.y=1.02;this.group.add(this.hitHalo);this.impactT=0;this.impactHeavy=false;this.impactSide=1;this.play('Idle_Neutral',true,.01,isPlayer?1.0:.92);if(this.action){const phase={punk:.17,worker:.43,suit:.31,swat:.58,player:.06}[kind]??.2;this.action.time=(this.action.getClip()?.duration||1)*phase;}this.mixer.update(.001);}
  play(name,loop=true,fade=.04,speed=1){const clip=this.clips[name]||this.clips.Idle||Object.values(this.clips)[0];if(!clip)return;if(this.current===name&&loop&&this.action){this.action.setEffectiveTimeScale(speed);return;}const next=this.mixer.clipAction(clip);next.enabled=true;next.reset();next.setEffectiveTimeScale(speed);next.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);next.clampWhenFinished=!loop;next.play();if(this.action&&this.action!==next)this.action.crossFadeTo(next,fade,false);this.action=next;this.current=name;}
  playTimed(name,duration,fade=.025){const clip=this.clips[name]||this.clips.Idle;if(!clip)return;this.play(name,false,fade,Math.max(.2,clip.duration/Math.max(.08,duration)));}
  setPosition(s){this.group.position.set(s.x,0,s.z);this.group.rotation.y=s.facing||0;}
  triggerImpact(heavy=false,side=1){this.impactT=heavy?.27:.19;this.impactHeavy=heavy;this.impactSide=side||1;this.hitHalo.material.color.setHex(heavy?0xffd16a:0xffffff);this.hitHalo.material.opacity=1;this.hitHalo.scale.setScalar(heavy?1.16:.94);}
  syncPipe(state,attackProgress=0){this.weaponRoot.visible=state.weapon==='pipe'&&!state.dead;if(!this.weaponRoot.visible)return;const p=new THREE.Vector3();this.group.updateMatrixWorld(true);this.model.updateMatrixWorld(true);if(this.wrist){this.wrist.getWorldPosition(p);this.group.worldToLocal(p);}else p.set(.26,1.05,.12);this.weaponRoot.position.set(p.x+.04,p.y+.04,p.z+.045);let yaw=.05,roll=.02,pitch=-.12;if(state.state==='attack'){const u=clamp(attackProgress,0,1);yaw=(u-.45)*2.35;roll=Math.sin(Math.PI*u)*.56;pitch=-.16+Math.sin(Math.PI*u)*.25;}else if(state.state==='dodge'){yaw=-.26;roll=-.34;}this.weaponRoot.rotation.set(pitch,yaw,roll);}
  update(dt,state,attackProgress=0){this.mixer.update(dt);this.syncPipe(state,attackProgress);this.shadowBlob.visible=!state.dead;this.shadowBlob.material.opacity=state.state==='downed'?.18:.34;this.shadowBlob.scale.set(state.state==='downed'?1.32:1,state.state==='downed'?.72:.58,1);if(this.isPlayer){this.tell.visible=!!state.guard;this.tell.material.color.setHex(0x72efff);this.tell.material.opacity=state.parry>0?.82:.24;this.tell.scale.setScalar(state.parry>0?1.08:1);}this.model.position.copy(this.baseModelPos);this.bodyRoot.position.set(0,0,0);this.bodyRoot.rotation.set(0,0,0);if(state.state==='attack'&&state.currentAttack){const pr=state.currentAttack.profile,u=clamp(state.stateT/pr.duration,0,1),hitU=pr.hitAt/pr.duration;const coil=u<hitU?(u/hitU):Math.max(0,1-(u-hitU)/(1-hitU));this.bodyRoot.position.z=Math.sin(Math.PI*clamp(u/hitU,0,1))*.09;this.bodyRoot.rotation.z=(state.currentAttack.kind==='heavy'?-.055:-.025)*coil;}if(this.impactT>0){this.impactT=Math.max(0,this.impactT-dt);const d=this.impactHeavy?.27:.19,u=this.impactT/d,s=Math.sin(Math.PI*(1-u)),side=this.impactSide||1;this.bodyRoot.position.z=-s*(this.impactHeavy?.31:.19);this.bodyRoot.position.x=side*s*(this.impactHeavy?.10:.055);this.bodyRoot.rotation.x=-s*(this.impactHeavy?.27:.16);this.bodyRoot.rotation.z=side*s*(this.impactHeavy?.18:.10);if(this.head){this.head.rotation.z+=side*s*(this.impactHeavy?.30:.18);this.head.rotation.x-=s*(this.impactHeavy?.16:.08);}if(this.neck)this.neck.rotation.z+=side*s*(this.impactHeavy?.15:.09);this.hitHalo.material.opacity=u*.72;this.hitHalo.scale.multiplyScalar(1+dt*4.4);}else this.hitHalo.material.opacity=0;}
}

// ---------- Effects ----------
let impactTexture=null,ringTexture=null;
function makeImpactTexture(){if(impactTexture)return impactTexture;const c=document.createElement('canvas');c.width=c.height=160;const x=c.getContext('2d');x.translate(80,80);for(let i=0;i<24;i++){x.save();x.rotate((Math.PI*2*i)/24);const len=28+(i%4)*12,g=x.createLinearGradient(10,0,len,0);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(8,-2.0,len,4);x.restore();}const rg=x.createRadialGradient(0,0,1,0,0,34);rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.18,'rgba(255,255,255,.9)');rg.addColorStop(.62,'rgba(255,255,255,.16)');rg.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=rg;x.beginPath();x.arc(0,0,35,0,Math.PI*2);x.fill();impactTexture=new THREE.CanvasTexture(c);return impactTexture;}
function makeRingTexture(){if(ringTexture)return ringTexture;const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.translate(64,64);x.strokeStyle='white';x.lineWidth=4;x.globalAlpha=.9;x.beginPath();x.arc(0,0,28,0,Math.PI*2);x.stroke();ringTexture=new THREE.CanvasTexture(c);return ringTexture;}
const effects=[];
function spawnArc(actor,color=0xffffff,heavy=false){const geo=new THREE.RingGeometry(heavy?.72:.62,heavy?1.42:1.16,42,1,-Math.PI*.60,Math.PI*1.20),mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:heavy?.72:.50,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),m=new THREE.Mesh(geo,mat);m.rotation.x=-Math.PI/2;m.rotation.z=-actor.group.rotation.y;m.position.copy(actor.group.position);m.position.y=.17;scene.add(m);effects.push({mesh:m,t:0,d:heavy?.18:.13,scale:heavy?1.34:1.20});}
function spawnImpact(pos,color=0xffffff,heavy=false){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:makeImpactTexture(),color,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}));m.position.copy(pos);m.position.y=1.08;m.scale.setScalar(heavy?1.95:1.35);scene.add(m);effects.push({mesh:m,t:0,d:heavy?.18:.145,sprite:true,scale:heavy?2.65:2.1});const ring=new THREE.Sprite(new THREE.SpriteMaterial({map:makeRingTexture(),color,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending}));ring.position.copy(m.position);ring.scale.setScalar(heavy?1.0:.72);scene.add(ring);effects.push({mesh:ring,t:0,d:heavy?.22:.17,sprite:true,scale:heavy?3.0:2.5});}
function spawnSparks(pos,color=0xffffff,heavy=false){for(let i=0;i<(heavy?18:11);i++){const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}),m=new THREE.Mesh(new THREE.BoxGeometry(.026,.026,heavy?.40:.26),mat);m.position.copy(pos);m.position.y=.95+Math.random()*.50;const a=Math.random()*Math.PI*2,s=(heavy?6.6:4.5)*(.5+Math.random()*.75);effects.push({mesh:m,t:0,d:heavy?.26:.18,v:new THREE.Vector3(Math.sin(a)*s,1.7+Math.random()*3.0,Math.cos(a)*s),spin:(Math.random()-.5)*18});scene.add(m);}}
function spawnDodgeGhost(pos,color=0x73efff){const m=new THREE.Mesh(new THREE.RingGeometry(.36,.46,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.set(pos.x,.03,pos.z);scene.add(m);effects.push({mesh:m,t:0,d:.20,scale:2.2});}
function spawnNoiseRing(x,z,radius,color=0x75efff){const m=new THREE.Mesh(new THREE.RingGeometry(.24,.31,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.set(x,.025,z);scene.add(m);effects.push({mesh:m,t:0,d:.34,scale:Math.max(2,radius/.28)});}
function updateEffects(dt){for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.t+=dt;const u=e.t/e.d;if(e.v){e.mesh.position.addScaledVector(e.v,dt);e.v.y-=12*dt;e.mesh.rotation.y+=e.spin*dt;}else e.mesh.scale.setScalar((e.sprite?1:.98)+u*(e.scale-1));e.mesh.material.opacity=Math.max(0,(1-u)*(e.mesh.material.opacity>0?1:.8));if(u>=1){scene.remove(e.mesh);e.mesh.geometry?.dispose?.();e.mesh.material?.dispose?.();effects.splice(i,1);}}}
const stains=[];
function spawnStain(x,z,seed=0,large=true){const r=(large?.52:.30)+((seed*37)%11)*.018,m=new THREE.Mesh(new THREE.CircleGeometry(r,18),new THREE.MeshBasicMaterial({color:large?0x3a0710:0x2a0b10,transparent:true,opacity:large?.68:.48,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x+Math.sin(seed*2.1)*.12,.016,z+Math.cos(seed*1.7)*.10);m.scale.set(1.0,.62+(seed%3)*.10,1);scene.add(m);stains.push(m);}
function clearStains(){while(stains.length){const m=stains.pop();scene.remove(m);m.geometry.dispose();m.material.dispose();}}
function rebuildStains(){clearStains();run.enemies.forEach((e,i)=>{if(e.dead)spawnStain(e.spawnX,e.spawnZ,i+1,true);});}

// ---------- Run / input ----------
let run=makeRunState();
let playerView=null;const enemyViews=[];
let ready=false,started=false,last=performance.now(),acc=0,hitFreeze=0,shake=0,cameraImpact=0,flashT=0,chapterT=0,feedT=0,footstepT=0;
const FIX=1/120,pending=[],keys=new Set();
let currentTarget=null,enemyToken=null;
const ACTION_KEYS=new Set(['KeyJ','KeyK','KeyL','KeyF','KeyE','KeyR','Space']);
addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL','KeyF','KeyE','KeyR','Space'].includes(e.code))e.preventDefault();if(!keys.has(e.code)&&ACTION_KEYS.has(e.code))pending.push(e.code);keys.add(e.code);});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyL'&&run?.player)run.player.guard=false;});addEventListener('blur',()=>{keys.clear();if(run?.player)run.player.guard=false;});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));});

function doFlash(color='#fff',amount=.25,dur=.06){flashEl.style.background=color;flashEl.style.opacity=String(amount);flashT=dur;}
function feed(text,cls=''){combatFeed.innerHTML=`<span class="${cls}">${text}</span>`;feedT=1.15;}
function setObjective(kicker,title,desc=''){objectiveEl.querySelector('small').textContent=kicker;objectiveEl.querySelector('strong').textContent=title;objectiveEl.querySelector('em').textContent=desc;}
function setLesson(title,desc=''){lessonEl.querySelector('strong').textContent=title;lessonEl.querySelector('small').textContent=desc;}
function showChapter(small,title,sub,d=.95){chapterCard.querySelector('small').textContent=small;chapterCard.querySelector('strong').textContent=title;chapterCard.querySelector('em').textContent=sub||'';chapterCard.classList.remove('hidden');chapterT=d;}
function styleLabel(){const m=run.styleMult||1;if(m>=4.5)return'БЕЗ ОСТАНОВКИ';if(m>=3.5)return'ИМПРОВИЗАЦИЯ';if(m>=2.5)return'РАЗНООБРАЗНО';if(m>=1.5)return'ТЕМП';return'ТИХО';}
function updateHUD(){weaponEl.textContent=run.player.weapon==='pipe'?'ТРУБА':'КУЛАКИ';const ch=CHAPTERS[run.chapter]||CHAPTERS[0];roomEl.textContent=ch.title;scoreEl.textContent=String(Math.max(0,run.score|0)).padStart(6,'0');styleEl.textContent=`×${(run.styleMult||1).toFixed(1)}`;if(styleVerb)styleVerb.textContent=styleLabel();if(styleMeterFill)styleMeterFill.style.width=`${Math.round(clamp((run.styleTimer||0)/T.styleWindow,0,1)*100)}%`;}
function awardStyle(tag,base=null){if(!run||run.phase==='intro')return 0;const wasActive=run.styleTimer>0;const firstThisChain=!run.styleTypes[tag]||!wasActive;if(firstThisChain)run.styleMult=Math.min(5,(run.styleMult||1)+.5);run.peakStyle=Math.max(run.peakStyle||1,run.styleMult||1);const pts=Math.round((base??stylePoints(tag,1))*(run.styleMult||1));run.score+=pts;run.styleTimer=T.styleWindow;run.styleTypes[tag]=(run.styleTypes[tag]||0)+1;updateHUD();return pts;}
function tickStyle(dt){run.styleTimer=Math.max(0,(run.styleTimer||0)-dt);if(run.styleTimer<=0&&run.styleMult!==1)run.styleMult=1;updateHUD();}
function finishGrade(){const unique=Object.keys(run.styleTypes||{}).length;return gradeRun(run.score,unique,run.time);}
function refreshGuidance(force=false){
  const old=run.chapter;run.chapter=chapterForZ(run.player.z,run.kills);
  if(run.chapter!==old||force){
    const ch=CHAPTERS[run.chapter];
    if(ch){
      setObjective(`02:${String(14+Math.min(8,run.kills)).padStart(2,'0')} · ЖУКОВА 3`,ch.title,ch.subtitle);
      if(run.phase==='playing'&&run.chapter!==0)showChapter(`ЭПИЗОД ${Math.min(6,Math.max(1,run.kills+1))} / 6`,ch.title,ch.subtitle,.72);
    }
  }
  if(run.kills===0)setLesson('J — быстрый · K — тяжёлый','Подойди сам. Первый пока тебя не видит.');
  else if(run.kills===1)setLesson('SHIFT — ТИХИЙ ШАГ · F — ТИХАЯ ДВЕРЬ','Бег слышен рядом. В дверь можно влететь и сбить врага — или открыть её без тарана.');
  else if(run.kills===2)setLesson('L ПЕРЕД КОНТАКТОМ — PARRY','Красный сигнал → нажми L поздно.');
  else if(run.kills===3)setLesson('МЕБЕЛЬ ЛОМАЕТ ОБЗОР · SPACE — УКЛОН','Шум оставляет врагу последнюю известную точку.');
  else if(run.kills===4&&!run.mission.cassetteTaken){
    setObjective('ЗАДАНИЕ · ЖУКОВА 3','ЗАБЕРИ КАССЕТУ','Кладовка. Подойди к красной кассете и нажми F.');
    setLesson('K — СВАЛИТЬ · F — ДОБИТЬ','После боя забери цель миссии. Без неё дальше не откроется.');
  }else if(run.kills===4&&run.mission.cassetteTaken)setLesson('КАССЕТА У ТЕБЯ','Иди в гостиную. Там двое и одна труба.');
  else if(run.kills===5||run.kills===6)setLesson('ДВОЕ · ОДИН ATTACK TOKEN','F — взять · E — метнуть. Шум одного поднимает второго.');
  else setLesson('ОБРАТНЫЙ ПУТЬ','Вернись на лестничную площадку. Теперь комнаты уже твои.');
  updateHUD();
}

function inputDir(){let x=0,z=0;if(keys.has('KeyA'))x-=1;if(keys.has('KeyD'))x+=1;if(keys.has('KeyW'))z-=1;if(keys.has('KeyS'))z+=1;const l=Math.hypot(x,z)||1;return{x:x/l,z:z/l,active:!!(x||z)};}
function faceState(s,yaw,dt=FIX){s.facing=angleLerp(s.facing||0,yaw,1-Math.exp(-36*dt));}
function crossing(a,b,line){return(a-line)*(b-line)<=0&&Math.abs(a-b)>.00001;}
function circleHitsAABB(x,z,r,b){const qx=clamp(x,b.minX,b.maxX),qz=clamp(z,b.minZ,b.maxZ),dx=x-qx,dz=z-qz;return dx*dx+dz*dz<r*r;}
function combatDoorBox(d){if(d.open>.70)return null;return{minX:d.x-d.w*.52,maxX:d.x+d.w*.52,minZ:d.z-.13,maxZ:d.z+.13,tag:'door',blocksVision:true};}
function closedDoorAt(x,z,r=.43){for(const d of combatDoors){const b=combatDoorBox(d);if(b&&circleHitsAABB(x,z,r,b))return d;}return null;}
function solidAt(x,z,r=.43){for(const b of colliders)if(circleHitsAABB(x,z,r,b))return true;for(let i=0;i<GATES.length;i++){if(run.gates[i])continue;const g=GATES[i],b={minX:g.x-g.half,maxX:g.x+g.half,minZ:g.z-.14,maxZ:g.z+.14};if(circleHitsAABB(x,z,r,b))return true;}if(closedDoorAt(x,z,r))return true;return false;}
function openCombatDoor(d,opener,bash=true){if(!d||d.target>0)return false;d.target=1;d.bashCd=.35;playRecipe('slam',bash?.9:.34);emitNoise(d.x,d.z,bash?T.hearDoor:T.hearQuietDoor,bash?'door':'quietdoor');if(!bash&&opener===run.player)feed('ДВЕРЬ · ТИХО','cyan');if(bash&&opener===run.player){const side=Math.sign(d.z-opener.z)||1;let hit=null,best=99;for(const e of run.enemies){if(!e.active||e.dead||e.state==='downed')continue;const dz=(e.z-d.z)*side,dx=Math.abs(e.x-d.x),dist=Math.hypot(e.x-d.x,e.z-d.z);if(dz>.02&&dz<T.doorBashRange&&dx<d.w*.58&&dist<best){hit=e;best=dist;}}if(hit){downEnemy(hit,'door');run.doorBashes++;awardStyle('door');feed('ДВЕРЬ · С НОГ','gold');cameraImpact=.72;shake=.34;doFlash('#ffd7a0',.22,.06);}}return true;}
function moveState(s,dx,dz){const r=.43;const target=clampLevel({x:s.x+dx,z:s.z+dz},r),quiet=s===run.player&&(keys.has('ShiftLeft')||keys.has('ShiftRight'));let d=closedDoorAt(target.x,s.z,r);if(d&&Math.hypot(s.x-d.x,s.z-d.z)<1.25&&!quiet)openCombatDoor(d,s,s===run.player);if(!solidAt(target.x,s.z,r))s.x=target.x;d=closedDoorAt(s.x,target.z,r);if(d&&Math.hypot(s.x-d.x,s.z-d.z)<1.25&&!quiet)openCombatDoor(d,s,s===run.player);if(!solidAt(s.x,target.z,r))s.z=target.z;}
function visionBoxes(){const out=colliders.slice();for(const d of combatDoors){const b=combatDoorBox(d);if(b)out.push(b);}for(let i=0;i<GATES.length;i++)if(!run.gates[i]){const g=GATES[i];out.push({minX:g.x-g.half,maxX:g.x+g.half,minZ:g.z-.14,maxZ:g.z+.14,blocksVision:true});}return out;}
function canSeePlayer(e){const p=run.player,d=dist2(e,p);if(d>T.enemySight)return false;const yaw=angleTo(e,p);if(e.state!=='chase'&&Math.abs(C.angleDelta(e.facing||0,yaw))>T.enemyFov*.5)return false;return !segmentBlocked(e,p,visionBoxes());}
let noiseSeq=0,lastNoise=null;
function emitNoise(x,z,radius,kind='noise'){lastNoise={x,z,radius,kind,seq:++noiseSeq};if(kind!=='step')spawnNoiseRing(x,z,radius,kind==='alert'?0xff536d:(kind==='door'?0xffd16a:0x75efff));}
function broadcastAlert(source){if(!source||source.shoutCd>0)return;source.shoutCd=1.4;emitNoise(source.x,source.z,T.enemyAlertRadius,'alert');for(const mate of run.enemies){if(mate===source||!mate.active||mate.dead||mate.state==='downed')continue;if(Math.hypot(mate.x-source.x,mate.z-source.z)>T.enemyAlertRadius)continue;mate.lastSeenX=run.player.x;mate.lastSeenZ=run.player.z;if(['idle','search','investigate'].includes(mate.state)){mate.state='investigate';mate.stateT=0;}}feed('ТРЕВОГА · ОНИ СЛЫШАТ ДРУГ ДРУГА','red');}


function givePipeTo(s){
  if(!s||!run.pipe.active||run.pipe.owner!=null||run.pipe.thrown)return false;
  run.pipe.owner=s===run.player?'player':s.id;run.pipe.thrown=false;run.pipe.vx=run.pipe.vz=0;run.pipe.throwT=0;
  s.weapon='pipe';s.comboIndex=0;playRecipe('pickup',1);updateHUD();
  if(s===run.player){awardStyle('pickup');feed('ТРУБА В РУКЕ · E МЕТНУТЬ','cyan');}else feed('ОН ВЗЯЛ ТРУБУ','red');
  return true;
}
function dropPipeFrom(s,kick=.55){
  if(!s||s.weapon!=='pipe')return false;const yaw=s.facing||0;
  run.pipe.owner=null;run.pipe.active=true;run.pipe.thrown=false;run.pipe.vx=run.pipe.vz=0;run.pipe.throwT=0;
  run.pipe.x=clamp(s.x+Math.sin(yaw)*kick,T.levelMinX+.7,T.levelMaxX-.7);run.pipe.z=clamp(s.z+Math.cos(yaw)*kick,T.levelMinZ+.7,T.levelMaxZ-.7);
  s.weapon='fists';s.comboIndex=0;updateHUD();return true;
}
function playerPipeAction(){
  const p=run.player;if(p.dead||run.kills<5)return false;
  if(p.weapon==='pipe'){dropPipeFrom(p,.78);feed('ПОЛОЖИЛ ТРУБУ');return true;}
  if(pipeCanPickup(p,run.pipe)){givePipeTo(p);return true;}
  feed('F работает только рядом с трубой','cyan');return false;
}
function throwPipe(){
  const p=run.player;if(p.dead||run.phase!=='playing'||p.weapon!=='pipe'||run.pipe.thrown||['attack','finisher','dodge'].includes(p.state))return false;
  const yaw=p.facing||0;p.weapon='fists';p.comboIndex=0;run.pipe.owner=null;run.pipe.active=true;run.pipe.thrown=true;
  run.pipe.x=p.x+Math.sin(yaw)*.62;run.pipe.z=p.z+Math.cos(yaw)*.62;run.pipe.vx=Math.sin(yaw)*T.pipeThrowSpeed;run.pipe.vz=Math.cos(yaw)*T.pipeThrowSpeed;run.pipe.throwT=T.pipeThrowLife;
  run.throws++;awardStyle('throw');playRecipe('throw',1.15);emitNoise(p.x,p.z,T.pipeThrowNoise,'throw');feed('БРОСОК ТРУБЫ','gold');shake=Math.max(shake,.18);cameraImpact=Math.max(cameraImpact,.28);updateHUD();return true;
}
function stopThrownPipe(x,z,clang=true){run.pipe.x=x;run.pipe.z=z;run.pipe.thrown=false;run.pipe.vx=run.pipe.vz=0;run.pipe.throwT=0;if(clang)playRecipe('clash',.72);}
function updateThrownPipe(dt){
  const w=run.pipe;if(!w.thrown)return;
  const nx=w.x+w.vx*dt,nz=w.z+w.vz*dt;
  const hitDoor=closedDoorAt(nx,nz,.18);if(hitDoor){openCombatDoor(hitDoor,{x:w.x,z:w.z},false);stopThrownPipe(w.x,w.z,true);emitNoise(hitDoor.x,hitDoor.z,T.pipeThrowNoise,'door');feed('ТРУБА РАСПАХНУЛА ДВЕРЬ','gold');return;}
  if(solidAt(nx,nz,.16)){damageBreakables(nx,nz,1.05,1.5);stopThrownPipe(w.x,w.z,true);emitNoise(w.x,w.z,T.pipeThrowNoise*.72,'throw');return;}
  w.x=nx;w.z=nz;w.throwT=Math.max(0,w.throwT-dt);
  for(const e of run.enemies){if(!e.active||e.dead||e.state==='downed')continue;if(Math.hypot(e.x-w.x,e.z-w.z)<=T.pipeThrowRadius){downEnemy(e,'throw');awardStyle('throw',380);feed('ТРУБА · С НОГ','gold');hitFreeze=Math.max(hitFreeze,.11);cameraImpact=.76;shake=.38;stopThrownPipe(w.x,w.z,false);return;}}
  if(w.throwT<=0)stopThrownPipe(w.x,w.z,false);
}

function startPlayerAttack(kind){const p=run.player;if(p.dead||run.phase!=='playing')return false;if(p.state==='dodge'||p.state==='attack'){queueInput(p,kind,kind==='heavy'?T.heavyBuffer:T.quickBuffer);return false;}const profile=attackFor(p.weapon,kind,p.comboIndex),target=chooseTarget(p,run.enemies,T.targetRange);p.state='attack';p.stateT=0;p.currentAttack={kind,profile,target,hitDone:false,hitLanded:false};if(target)faceState(p,angleTo(p,target),1);playerView.playTimed(profile.anim,profile.duration,.025);spawnArc(playerView,p.weapon==='pipe'?0x68eafa:(kind==='heavy'?0xffd16a:0xffffff),kind==='heavy'||profile.damage>=3);playRecipe('swing',p.weapon==='pipe'?1.22:(kind==='heavy'?1.1:.9));emitNoise(p.x,p.z,p.weapon==='pipe'?T.hearAttack+1:T.hearAttack,'attack');return true;}
function startDodge(){const p=run.player;if(p.dead||p.dodgeCd>0||p.state==='dodge'||run.phase!=='playing')return false;if(p.state==='attack')p.currentAttack=null;const d=inputDir();let dx=d.x,dz=d.z;if(!d.active){dx=Math.sin(p.facing||0);dz=Math.cos(p.facing||0);}p.state='dodge';p.stateT=0;p.dodgeDir={x:dx,z:dz};p.invuln=T.dodgeInvuln;p.dodgeCd=T.dodgeCooldown;run.dodges++;playerView.playTimed('Roll',T.dodgeDuration,.018);playRecipe('dodge',.9);spawnDodgeGhost(p);return true;}
function startParry(){const p=run.player;if(p.dead||run.phase!=='playing')return;p.guard=true;p.guardT=0;p.parry=T.parryWindow;if(p.state==='idle')playerView.playTimed('Idle_Neutral',T.parryRecovery,.02);playRecipe('clash',.18);}
function impactPoint(a,b){return new THREE.Vector3((a.x+b.x)*.5,1.06,(a.z+b.z)*.5);}

function openGateDelayed(i,delay=.65){if(i<0||i>=run.gates.length)return;run.gateTimers[i]=delay;}
function onEnemyDown(e){const idx=run.enemies.indexOf(e);run.kills=run.enemies.filter(x=>x.dead).length;if(idx<5)run.currentEncounter=-1;if(idx===4){updateAmbient(false);if(run.mission.cassetteTaken)openGateDelayed(4,.55);feed('КЛАДОВКА ЧИСТА · НАЙДИ КАССЕТУ','cyan');}else if(idx<4){updateAmbient(false);openGateDelayed(e.encounter.gate,.72);feed('ТИХО. ДВЕРЬ ОТКРЫВАЕТСЯ','cyan');}else{const remaining=run.enemies.slice(5).filter(x=>!x.dead);if(remaining.length){run.currentEncounter=5;feed('ОДИН ОСТАЛСЯ','red');updateAmbient(true);}else{run.currentEncounter=-1;run.finalDefeated=true;run.mission.extractReady=true;updateAmbient(false);setObjective('02:22 · ЖУКОВА 3','ВЕРНИСЬ НА ЛЕСТНИЦУ','Не во двор. Назад через квартиру — к двери, откуда вошёл.');setLesson('ОБРАТНЫЙ ПУТЬ','Пройди через последствия. На площадке горит зелёный свет.');showChapter('ФИНАЛ','ТИШИНА','Кассета у тебя. Теперь обратно.',1.2);awardStyle('objective',500);}}refreshGuidance(true);}
function downEnemy(e,reason='impact'){if(!e||e.dead||e.state==='downed')return false;e.state='downed';e.stateT=0;e.downedT=T.downedTime;e.token=false;e.cooldown=.4;e.knockX=e.knockZ=0;if(enemyToken===e)enemyToken=null;e._view.tell.visible=false;e._view.warn.visible=false;e._view.playTimed('Death',.38,.015);const side=Math.sin((run.player?.facing||0)-(e.facing||0))>=0?1:-1;e._view.triggerImpact(true,side);const ip=new THREE.Vector3(e.x,1.02,e.z);spawnImpact(ip,reason==='door'?0xffd16a:0xffffff,true);damageBreakables(e.x,e.z,1.05,1.25);hitFreeze=Math.max(hitFreeze,.10);return true;}
function nearestDowned(){let best=null,bd=Infinity;for(const e of run.enemies){if(!e.active||e.dead||e.state!=='downed')continue;const d=dist2(run.player,e);if(d<T.finisherRange&&d<bd){best=e;bd=d;}}return best;}
function startFinisher(e){const p=run.player;if(!e||e.dead||e.state!=='downed'||p.dead||p.state==='dodge'||p.state==='attack'||p.state==='finisher')return false;p.state='finisher';p.stateT=0;p.currentAttack={target:e,hitDone:false};faceState(p,angleTo(p,e),1);playerView.playTimed('Kick_Left',.46,.018);feed('ДОБИВАНИЕ','gold');return true;}
function finishEnemy(e){if(!e||e.dead)return false;run.finishers++;awardStyle('finisher');return hitEnemy(e,999,{name:'finisher',damage:99,knock:3.2,freeze:.20});}
function hitEnemy(e,damage,profile){if(e.dead)return false;const p=run.player,yaw=angleTo(p,e),heavy=profile.damage>=2,wasPipe=e.weapon==='pipe';e.hp-=damage;const killed=e.hp<=0,knocked=!killed&&!!profile.knockdown;e.stagger=heavy?.36:.23;e.state=killed?'dead':(knocked?'downed':'stagger');e.stateT=0;e.downedT=knocked?T.downedTime:0;e.cooldown=.28;e.token=false;if(enemyToken===e)enemyToken=null;e._view.tell.material.opacity=0;e._view.tell.visible=false;e._view.warn.visible=false;const knock=profile.knock||5;e.knockX=Math.sin(yaw)*knock;e.knockZ=Math.cos(yaw)*knock;e._view.playTimed(killed||knocked?'Death':(heavy?'HitRecieve_2':'HitRecieve'),killed?.62:(knocked?.40:(heavy?.26:.22)),.018);const hitSide=Math.sin(yaw-(e.facing||0))>=0?1:-1;e._view.triggerImpact(heavy||knocked,hitSide);const ip=impactPoint(p,e);if(heavy||p.weapon==='pipe')damageBreakables(e.x,e.z,p.weapon==='pipe'?1.15:.92,p.weapon==='pipe'?1.35:1.1);spawnImpact(ip,wasPipe?0x6bedff:(heavy?0xffd16a:0xffffff),heavy||knocked);spawnSparks(ip,wasPipe?0x6bedff:(heavy?0xffd16a:0xffffff),heavy);playRecipe(killed?'kill':'impact',killed?1.35:(heavy?1.15:.92));shake=Math.max(shake,killed?.52:(heavy?.34:.22));cameraImpact=Math.max(cameraImpact,killed?1:(heavy?.75:.46));hitFreeze=Math.max(hitFreeze,killed?T.killStop:(profile.freeze||T.hitStopQuick));doFlash(killed?'#fff0d0':(heavy?'#ffd7a0':'#ffffff'),killed?.34:(heavy?.22:.14),killed?.09:.055);run.combo++;run.comboTimer=1.25;if(profile.name!=='finisher')awardStyle(heavy?'heavy':'quick');if(killed)awardStyle('kill');feed(killed?'DOWN':(knocked?'НА ПОЛ · F ДОБИТЬ':`${run.combo} HIT`),killed?'red':(heavy?'gold':''));if(heavy)run.heavyHits++;if(e.hp>0&&wasPipe&&(profile.name==='heavy_kick'||profile.name==='pipe_heavy'||profile.damage>=3)){dropPipeFrom(e,.95);feed('ТРУБА ВЫБИТА','cyan');}if(killed){e.dead=true;e.active=false;spawnStain(e.x,e.z,run.enemies.indexOf(e)+1,true);if(wasPipe)dropPipeFrom(e,.62);onEnemyDown(e);}return true;}
function resolvePlayerHit(){const p=run.player,a=p.currentAttack;if(!a||a.hitDone)return;a.hitDone=true;let target=a.target;if(!target||target.dead||!target.active||dist2(p,target)>a.profile.range+.34)target=chooseTarget(p,run.enemies,a.profile.range+.28);if(target&&!target.dead&&target.active&&dist2(p,target)<=a.profile.range){faceState(p,angleTo(p,target),1);a.hitLanded=hitEnemy(target,a.profile.damage,a.profile);}else{a.hitLanded=false;const forceful=a.kind==='heavy'||p.weapon==='pipe';if(forceful){const reach=Math.min(a.profile.range,1.65),bx=p.x+Math.sin(p.facing||0)*reach,bz=p.z+Math.cos(p.facing||0)*reach,broken=damageBreakables(bx,bz,.82,p.weapon==='pipe'?1.35:1.05);if(broken){hitFreeze=Math.max(hitFreeze,.055);spawnImpact(new THREE.Vector3(bx,.82,bz),p.weapon==='pipe'?0x77ecff:0xffd16a,false);feed('ОКРУЖЕНИЕ РАЗНЕСЛО','gold');}}}}
function killPlayer(source){const p=run.player;if(p.dead)return;p.dead=true;p.state='dead';run.phase='dead';if(p.weapon==='pipe')dropPipeFrom(p,.45);playerView.playTimed('Death',.62,.018);playerView.triggerImpact(true,source?((Math.sin((source.facing||0)-(p.facing||0))>=0)?1:-1):1);doFlash('#ff274d',.58,.10);shake=.62;cameraImpact=1;playRecipe('death',1.1);setTimeout(()=>deathPanel.classList.remove('hidden'),120);}
function parryEnemy(e){const pipe=e.weapon==='pipe';e.state='stagger';e.stateT=0;e.stagger=.66;e.cooldown=.62;e.token=false;if(enemyToken===e)enemyToken=null;e._view.tell.material.opacity=0;e._view.tell.visible=false;e._view.warn.visible=false;e._view.playTimed('HitRecieve_2',.30,.018);e._view.triggerImpact(true,Math.sin((run.player.facing||0)-(e.facing||0))>=0?1:-1);playRecipe('clash',1.2);spawnImpact(impactPoint(run.player,e),0x72f1ff,true);spawnSparks(impactPoint(run.player,e),0x72f1ff,true);hitFreeze=Math.max(hitFreeze,.072);shake=.30;cameraImpact=.58;doFlash('#75efff',.26,.065);run.parries++;awardStyle('parry');feed(pipe?'PARRY · ТРУБА ВЫБИТА':'PARRY','cyan');if(pipe)dropPipeFrom(e,.96);}
function blockEnemy(e){const p=run.player;if(e.weapon==='pipe'){feed('ТРУБУ БЛОКОМ НЕ ОСТАНОВИТЬ','red');killPlayer(e);return;}e.state='recover';e.stateT=0;e.hitDone=true;e.token=false;if(enemyToken===e)enemyToken=null;e._view.tell.material.opacity=0;e._view.tell.visible=false;e._view.warn.visible=false;const yaw=angleTo(e,p);moveState(p,Math.sin(yaw)*T.guardPush,Math.cos(yaw)*T.guardPush);p.guard=true;p.parry=0;run.blocks++;awardStyle('block');playRecipe('clash',.62);spawnImpact(impactPoint(p,e),0x8adff3,false);hitFreeze=Math.max(hitFreeze,.045);cameraImpact=Math.max(cameraImpact,.34);feed('БЛОК · ДЕРЖИ L','cyan');}

function nearestClosedDoor(maxDist=1.35){let best=null,bd=Infinity;for(const d of combatDoors){if(d.target>0)continue;const q=Math.hypot(run.player.x-d.x,run.player.z-d.z);if(q<maxDist&&q<bd){best=d;bd=q;}}return best;}
function nearestStealthTarget(){const p=run.player;let best=null,bd=Infinity;for(const e of run.enemies){if(!e.active||e.dead||e.state==='downed'||!['idle','investigate','search'].includes(e.state))continue;const d=dist2(p,e);if(d>T.stealthRange||d>=bd)continue;const behind=Math.abs(C.angleDelta(e.facing||0,angleTo(e,p)))>Math.PI-T.stealthBackAngle;if(!behind||canSeePlayer(e))continue;best=e;bd=d;}return best;}
function stealthKill(e){const p=run.player;if(!e||e.dead)return false;p.state='finisher';p.stateT=0;p.currentAttack={target:null,hitDone:true,stealth:true};faceState(p,angleTo(p,e),1);playerView.playTimed('Punch_Right',.34,.018);e.hp=0;e.dead=true;e.active=false;e.state='dead';e.token=false;if(enemyToken===e)enemyToken=null;e._view.tell.visible=false;e._view.warn.visible=false;e._view.sense.visible=false;e._view.playTimed('Death',.48,.018);e._view.triggerImpact(false,Math.sin((p.facing||0)-(e.facing||0))>=0?1:-1);run.stealthKills++;awardStyle('stealth');awardStyle('kill');playRecipe('impact',.42);spawnImpact(impactPoint(p,e),0x8fefff,false);hitFreeze=Math.max(hitFreeze,.075);cameraImpact=Math.max(cameraImpact,.32);spawnStain(e.x,e.z,run.enemies.indexOf(e)+17,false);feed('ТИХО','cyan');if(e.weapon==='pipe')dropPipeFrom(e,.42);onEnemyDown(e);return true;}
function canTakeCassette(){return !run.mission.cassetteTaken&&run.kills>=4&&Math.hypot(run.player.x-cassettePos.x,run.player.z-cassettePos.z)<=T.objectivePickupRange;}
function takeCassette(){if(!canTakeCassette())return false;run.mission.cassetteTaken=true;awardStyle('objective');playRecipe('objective',1.2);feed('КАССЕТА · ЦЕЛЬ ВЗЯТА','gold');doFlash('#ff4668',.18,.08);showChapter('ЗАДАНИЕ','КАССЕТА У ТЕБЯ','Теперь — в гостиную.',1.0);if(run.kills>=5)openGateDelayed(4,.35);refreshGuidance(true);return true;}
function contextAction(){const down=nearestDowned();if(down)return startFinisher(down);if(canTakeCassette())return takeCassette();const stealth=nearestStealthTarget();if(stealth)return stealthKill(stealth);const nearestDoor=nearestClosedDoor();if(nearestDoor)return openCombatDoor(nearestDoor,run.player,false);return playerPipeAction();}
function processPending(){while(pending.length){const code=pending.shift();if(!started)continue;if(run.phase==='dead'){if(['KeyJ','KeyK','KeyR','Space'].includes(code)){restartCheckpoint();return;}continue;}if(run.phase==='clear'){if(['KeyJ','KeyR','Space'].includes(code)){fullRestart(false);return;}continue;}if(run.phase!=='playing')continue;if(code==='KeyJ')startPlayerAttack('quick');else if(code==='KeyK')startPlayerAttack('heavy');else if(code==='KeyL')startParry();else if(code==='Space'){if(run.player.state==='attack')queueInput(run.player,'dodge',.24);else startDodge();}else if(code==='KeyF')contextAction();else if(code==='KeyE')throwPipe();else if(code==='KeyR')restartCheckpoint();}}

function updatePlayer(dt){const p=run.player;if(p.dead)return;tickBuffer(p,dt);p.invuln=Math.max(0,p.invuln-dt);p.parry=Math.max(0,p.parry-dt);p.dodgeCd=Math.max(0,p.dodgeCd-dt);p.guard=keys.has('KeyL')&&p.state!=='dodge'&&p.state!=='attack'&&p.state!=='finisher';p.guardT=p.guard?(p.guardT+dt):0;run.comboTimer=Math.max(0,run.comboTimer-dt);if(run.comboTimer<=0)run.combo=0;p.stateT+=dt;if(p.state==='finisher'){const e=p.currentAttack?.target;if(e&&!e.dead){faceState(p,angleTo(p,e),dt);if(!p.currentAttack.hitDone&&p.stateT>=.20){p.currentAttack.hitDone=true;finishEnemy(e);}}if(p.stateT>=.46){p.state='idle';p.stateT=0;p.currentAttack=null;playerView.play(p.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.035,1.0);}return;}if(p.state==='dodge'){moveState(p,p.dodgeDir.x*T.dodgeSpeed*dt,p.dodgeDir.z*T.dodgeSpeed*dt);faceState(p,Math.atan2(p.dodgeDir.x,p.dodgeDir.z),dt);if(p.stateT>=T.dodgeDuration){p.state='idle';p.stateT=0;const q=consumeBuffer(p);if(q==='quick'||q==='heavy')startPlayerAttack(q);}return;}if(p.state==='attack'){const a=p.currentAttack,pr=a.profile,t=p.stateT;if(a.target&&!a.target.dead&&a.target.active&&t<pr.hitAt){const d=dist2(p,a.target);if(d>1.02){const yaw=angleTo(p,a.target);faceState(p,yaw,dt);const step=Math.min(pr.step/pr.hitAt*dt,Math.max(0,d-1.02));moveState(p,Math.sin(yaw)*step,Math.cos(yaw)*step);}}if(!a.hitDone&&t>=pr.hitAt)resolvePlayerHit();const cancelAt=a.hitLanded?Math.min(pr.duration*.61,pr.hitAt+.085):pr.duration*.82;if(t>=cancelAt&&p.buffer){const q=consumeBuffer(p);p.state='idle';p.currentAttack=null;if(q==='dodge')startDodge();else startPlayerAttack(q);return;}if(t>=pr.duration){p.state='idle';p.currentAttack=null;if(a.kind==='quick')p.comboIndex=(p.comboIndex+1)%3;else p.comboIndex=0;playerView.play(p.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.035,1.0);const q=consumeBuffer(p);if(q==='dodge')startDodge();else if(q)startPlayerAttack(q);}return;}const d=inputDir(),sneaking=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!p.guard;p.sneaking=sneaking;const moveScale=p.guard?.52:1,moveSpeed=sneaking?T.sneakSpeed:T.playerSpeed;const targetVX=d.x*moveSpeed*moveScale,targetVZ=d.z*moveSpeed*moveScale,rate=d.active?T.playerAccel:T.playerBrake;p.vx=expLerp(p.vx,targetVX,rate,dt);p.vz=expLerp(p.vz,targetVZ,rate,dt);if(Math.hypot(p.vx,p.vz)>.05){moveState(p,p.vx*dt,p.vz*dt);if(d.active)faceState(p,Math.atan2(d.x,d.z),dt);playerView.play('Run',true,.04,sneaking?.76:1.48);footstepT-=dt;if(footstepT<=0){playRecipe('step',sneaking?.15:.40);emitNoise(p.x,p.z,sneaking?T.sneakFootstepNoise:T.footstepNoise,'step');footstepT=sneaking?T.sneakCadence:T.footstepCadence;}}else{p.vx=p.vz=0;p.sneaking=false;playerView.play(p.guard?'Idle_Neutral':(p.weapon==='pipe'?'Idle_Sword':'Idle_Neutral'),true,.05,p.guard?.82:1.0);footstepT=0;}}

function attackerBusy(){return enemyToken&&!enemyToken.dead&&['windup','strike'].includes(enemyToken.state);}
function beginEnemyAttack(e){const cfg=enemyAttackFor(e.weapon);enemyToken=e;e.token=true;e.state='windup';e.stateT=0;e.hitDone=false;e.windupScale=(e.encounter.teaches==='parry'&&run.parries===0)?1.38:1;e._view.tell.visible=true;e._view.warn.visible=true;e._view.tell.material.opacity=.75;const idx=run.enemies.indexOf(e),anim=e.weapon==='pipe'?'Sword_Slash':(idx%3===1?'Kick_Right':'Punch_Right'),total=cfg.windup*e.windupScale+cfg.strike+(e.weapon==='pipe'?.23:.18);e._view.playTimed(anim,total,.035);}
function maybeEnemyTakePipe(e,dt){if(run.kills<5||!e.active||e.dead||e.state==='downed'||e.weapon==='pipe'||!run.pipe.active||run.pipe.owner!=null||run.pipe.thrown)return false;if(e.state==='idle')return false;const d=dist2(e,run.pipe);if(d<.72){givePipeTo(e);return true;}if(d<4.8&&['chase','investigate','search'].includes(e.state)){const yaw=angleTo(e,run.pipe);faceState(e,yaw,dt);moveState(e,Math.sin(yaw)*T.enemySprint*dt,Math.cos(yaw)*T.enemySprint*dt);e._view.play('Run',true,.04,1.44);return true;}return false;}
function updateEnemy(e,idx,dt){
  if(e.dead){e._view.tell.visible=false;e._view.warn.visible=false;e._view.sense.visible=false;e._view.threatLine.visible=false;return;}
  if(!e.active){e._view.tell.visible=false;e._view.warn.visible=false;e._view.sense.visible=false;e._view.threatLine.visible=false;e._view.play(e.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.07,.90);return;}
  if(Math.abs(e.knockX)+Math.abs(e.knockZ)>.02){moveState(e,e.knockX*dt,e.knockZ*dt);const damp=Math.exp(-11*dt);e.knockX*=damp;e.knockZ*=damp;}
  e.cooldown=Math.max(0,e.cooldown-dt);e.shoutCd=Math.max(0,(e.shoutCd||0)-dt);e.stateT+=dt;if(e.stagger>0)e.stagger=Math.max(0,e.stagger-dt);
  const p=run.player;if(p.dead)return;if(e.state!=='windup')e._view.threatLine.visible=false;const aware=['investigate','search','chase'].includes(e.state);e._view.sense.visible=aware;if(aware){e._view.sense.material.color.setHex(e.state==='chase'?0xff4f67:(e.state==='investigate'?0xffcf63:0x75dfff));e._view.sense.material.opacity=.62+Math.sin(performance.now()*.009)*.18;e._view.sense.rotation.y+=dt*2.8;}

  if(e.state==='downed'){
    e._view.tell.visible=false;e._view.warn.visible=false;e._view.sense.visible=false;e._view.threatLine.visible=false;
    if(e.stateT>=e.downedT){e.state='search';e.stateT=0;e.cooldown=.48;e.lastSeenX=p.x;e.lastSeenZ=p.z;e._view.playTimed('HitRecieve_2',.30,.018);feed('ПОДНЯЛСЯ','red');}
    return;
  }

  if(lastNoise&&lastNoise.seq>e.lastNoiseSeq){e.lastNoiseSeq=lastNoise.seq;const nd=Math.hypot(e.x-lastNoise.x,e.z-lastNoise.z);if(nd<=lastNoise.radius){e.lastSeenX=lastNoise.x;e.lastSeenZ=lastNoise.z;if(['idle','search','investigate'].includes(e.state)){e.state='investigate';e.stateT=0;updateAmbient(true);if(lastNoise.kind==='door')feed('ОН УСЛЫШАЛ ДВЕРЬ','red');}}}

  const sees=canSeePlayer(e);
  if(sees){e.lastSeenX=p.x;e.lastSeenZ=p.z;e.lostSightT=0;if(['idle','investigate','search'].includes(e.state)){e.state='chase';e.stateT=0;updateAmbient(true);feed('ЗАМЕТИЛ','red');if(run.currentEncounter===5)broadcastAlert(e);}}
  else if(e.state==='chase')e.lostSightT+=dt;

  if(e.state==='idle'){
    const patrol=e.encounter.patrol;
    if(e.behavior==='patrol'&&patrol){
      const speed=patrol.speed||1.1;
      if(patrol.axis==='x'){
        if(e.x>=patrol.max)e.patrolDir=-1;else if(e.x<=patrol.min)e.patrolDir=1;
        const yaw=e.patrolDir>0?Math.PI/2:-Math.PI/2;faceState(e,yaw,dt);moveState(e,e.patrolDir*speed*dt,0);e._view.play('Run',true,.05,.78);
      }else{
        if(e.z>=patrol.max)e.patrolDir=-1;else if(e.z<=patrol.min)e.patrolDir=1;
        const yaw=e.patrolDir>0?0:Math.PI;faceState(e,yaw,dt);moveState(e,0,e.patrolDir*speed*dt);e._view.play('Run',true,.05,.78);
      }
    }else e._view.play(e.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.05,e.behavior==='brute'?.84:.94);
    return;
  }
  if(e.state==='investigate'){
    const target={x:e.lastSeenX,z:e.lastSeenZ},d=dist2(e,target);if(sees){e.state='chase';e.stateT=0;}
    else if(d>.38){const yaw=angleTo(e,target);faceState(e,yaw,dt);moveState(e,Math.sin(yaw)*T.enemySpeed*dt,Math.cos(yaw)*T.enemySpeed*dt);e._view.play('Run',true,.04,1.18);}
    else{e.state='search';e.stateT=0;e._view.play(e.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.04,.92);}return;
  }
  if(e.state==='search'){e.facing+=dt*1.7*(idx%2?1:-1);e._view.play(e.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.05,.90);if(sees){e.state='chase';e.stateT=0;}else if(e.stateT>=T.searchTime){e.state='idle';e.stateT=0;}return;}
  if(e.state==='stagger'){if(e.stateT>=Math.max(.22,e.stagger||.22)){e.state='search';e.stateT=0;e.stagger=0;e.lastSeenX=p.x;e.lastSeenZ=p.z;e._view.play('Run',true,.04,1.25);}return;}

  const cfg=enemyAttackFor(e.weapon);
  if(e.state==='windup'){const windup=cfg.windup*(e.windupScale||1),u=clamp(e.stateT/windup,0,1);faceState(e,angleTo(e,p),dt);e._view.tell.visible=true;e._view.warn.visible=true;e._view.tell.scale.setScalar(1.55-u*.72);const warnColor=e.weapon==='pipe'?(u>.70?0xff254d:0xff8d47):(u>.70?0xff3150:0xffa246);e._view.tell.material.color.setHex(warnColor);e._view.warn.material.color.setHex(warnColor);e._view.threatLine.visible=true;e._view.threatLine.material.color.setHex(warnColor);e._view.threatLine.material.opacity=.10+u*.40;e._view.threatLine.scale.y=.72+u*.42;e._view.warn.scale.setScalar(.85+u*.85);e._view.tell.material.opacity=.38+u*.57;e._view.warn.material.opacity=.45+u*.50;if(u>.70&&u<.74)playRecipe('swing',.22);if(e.stateT>=windup){e.state='strike';e.stateT=0;e._view.tell.visible=false;e._view.warn.visible=false;e._view.threatLine.visible=false;}return;}
  if(e.state==='strike'){if(!e.hitDone&&e.stateT>=cfg.strike){e.hitDone=true;if(dist2(e,p)<cfg.range+.20){if(p.parry>0){parryEnemy(e);return;}if(p.invuln>0){awardStyle('dodge');feed('УКЛОН','cyan');cameraImpact=.24;playRecipe('dodge',.45);}else if(p.guard){blockEnemy(e);return;}else killPlayer(e);}}if(e.stateT>=(e.weapon==='pipe'?.35:.29)){e.state='recover';e.stateT=0;e.hitDone=false;e.token=false;if(enemyToken===e)enemyToken=null;e._view.play(e.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.03,.942);}return;}
  if(e.state==='recover'){if(e.stateT>=cfg.recovery){e.state='chase';e.stateT=0;e.cooldown=.22+idx*.035;}return;}

  if(e.state==='chase'&&!sees&&e.lostSightT>.30){e.state='investigate';e.stateT=0;return;}
  if(maybeEnemyTakePipe(e,dt))return;
  const d=dist2(e,p),yaw=angleTo(e,p);if(sees)faceState(e,yaw,dt);
  if(d>1.20){let moveYaw=yaw;if(e.behavior==='flanker'&&enemyToken&&enemyToken!==e&&d<4.8){const side=idx%2?1:-1,attackYaw=angleTo(enemyToken,p),flank={x:p.x+Math.cos(attackYaw)*side*1.75,z:p.z-Math.sin(attackYaw)*side*1.75};moveYaw=angleTo(e,flank);}const side=idx%2?1:-1,circle=(e.behavior==='flanker'?0:(d<2.5?side*.14:0)),nx=Math.sin(moveYaw)+Math.cos(moveYaw)*circle,nz=Math.cos(moveYaw)-Math.sin(moveYaw)*circle,n=Math.hypot(nx,nz)||1,speed=d>3.8?T.enemySprint:T.enemySpeed;moveState(e,nx/n*speed*dt,nz/n*speed*dt);e._view.play('Run',true,.04,d>3.8?1.45:1.28);}else e._view.play(e.weapon==='pipe'?'Idle_Sword':'Idle_Neutral',true,.04,.96);
  const aggression=e.encounter.aggression||1;if(sees&&!attackerBusy()&&e.cooldown<=0&&d<=cfg.range+.22&&Math.random()<aggression)beginEnemyAttack(e);
}

function activateEncounter(i){if(i<0||i>=run.enemies.length)return;const e=run.enemies[i];if(e.dead||e.active)return;if(i===5&&!run.finalCheckpoint)run.finalCheckpoint={score:run.score,styleTypes:{...run.styleTypes},parries:run.parries,blocks:run.blocks,finishers:run.finishers,stealthKills:run.stealthKills,doorBashes:run.doorBashes,throws:run.throws,time:run.time,peakStyle:run.peakStyle};const group=(i===5)?run.enemies.filter(x=>x.encounter.finalPair&&!x.dead):[e];for(const unit of group){unit.active=true;unit.state='idle';unit.stateT=0;unit.cooldown=.48;unit.facing=unit.encounter.facing??unit.facing;}run.currentEncounter=i===5?5:i;const def=e.encounter;const sceneNo=i===5?6:i+1;setObjective(`СЦЕНА ${sceneNo} / 6 · ${def.room}`,def.objective,def.lesson);showChapter(`СЦЕНА ${sceneNo} / 6`,def.room,i===5?'Двое. Но атакует только один за раз.':def.lesson,.85);updateAmbient(false);}
function updateEncounterTriggers(){if(run.currentEncounter>=0||run.finalDefeated)return;const next=run.enemies.findIndex(e=>!e.dead);if(next<0)return;const e=run.enemies[next];if(run.player.z<e.encounter.triggerZ)activateEncounter(next);}
function updateGatesLogic(dt){for(let i=0;i<run.gateTimers.length;i++){if(run.gates[i]||run.gateTimers[i]<=0)continue;run.gateTimers[i]=Math.max(0,run.gateTimers[i]-dt);if(run.gateTimers[i]<=0){run.gates[i]=true;playRecipe('slam',.9);gateGlows[i].intensity=2.0;doFlash('#72efff',.08,.08);refreshGuidance(true);if(i===3)updateAmbient(false);}}}
function separateActors(){const list=[run.player,...run.enemies.filter(e=>!e.dead&&e.active&&e.state!=='downed')];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j],s=separateCircles(a,b,(a===run.player||b===run.player)?.83:.88);if(!s)continue;moveState(a,s.ax,s.az);moveState(b,s.bx,s.bz);}}
function checkExit(){if(run.finalDefeated&&run.mission.cassetteTaken&&run.mission.extractReady&&run.player.z>8.05&&Math.abs(run.player.x-extractPos.x)<T.extractionRange&&run.phase==='playing'){run.phase='clear';const grade=finishGrade(),unique=Object.keys(run.styleTypes||{}).length;clearGrade.textContent=`${grade} · ${String(run.score|0).padStart(6,'0')}`;clearStats.textContent=`${unique} приёмов · пик ×${(run.peakStyle||1).toFixed(1)} · ${run.parries} parry · ${run.doorBashes} дверь · ${run.finishers} добив. · ${run.stealthKills} тихо · ${run.throws} броск. · ${Math.round(run.time)} сек`;clearPanel.classList.remove('hidden');updateAmbient(false);}}
function updateFixed(dt){run.time+=dt;processPending();if(run.phase==='intro'){run.introT+=dt;if(run.introT>=T.introDuration){run.phase='playing';document.body.classList.remove('intro');showChapter('02:14 · АБАКАН','ЖУКОВА 3','Первый ждёт. Ты начинаешь сам.',1.25);refreshGuidance(true);}return;}if(hitFreeze>0){hitFreeze=Math.max(0,hitFreeze-dt);return;}if(run.phase==='playing'){tickStyle(dt);updateGatesLogic(dt);updateEncounterTriggers();updatePlayer(dt);updateThrownPipe(dt);for(let i=0;i<run.enemies.length;i++)updateEnemy(run.enemies[i],i,dt);separateActors();currentTarget=chooseTarget(run.player,run.enemies,4.7);refreshGuidance(false);checkExit();}}

function showWorldPrompt(text,x,y,z,cls=''){
  pickupPrompt.classList.remove('hidden');pickupPrompt.textContent=text;pickupPrompt.dataset.kind=cls;
  const q=new THREE.Vector3(x,y,z).project(camera);pickupPrompt.style.left=`${(q.x*.5+.5)*innerWidth}px`;pickupPrompt.style.top=`${(-q.y*.5+.5)*innerHeight-36}px`;pickupPrompt.style.bottom='auto';
}
function syncPipeWorld(now){
  const p=run.pipe,free=p.active&&p.owner==null;pipeWorld.visible=free;pipeSpot.visible=free;const d=free?dist2(run.player,p):999;
  const down=nearestDowned(),stealth=nearestStealthTarget(),door=nearestClosedDoor(1.45),nearPipe=free&&!p.thrown&&run.kills>=5&&d<=T.pipePickupRange+.08,closePipe=free&&!p.thrown&&run.kills>=4&&d<2.8;
  pickupRing.visible=closePipe;pickupPrompt.classList.add('hidden');
  if(down)showWorldPrompt('F · ДОБИТЬ',down.x,1.05,down.z,'finisher');
  else if(canTakeCassette())showWorldPrompt('F · ВЗЯТЬ КАССЕТУ',cassettePos.x,.74,cassettePos.z,'objective');
  else if(stealth)showWorldPrompt('F · ТИХО УБРАТЬ',stealth.x,1.85,stealth.z,'stealth');
  else if(door)showWorldPrompt('F · ОТКРЫТЬ ТИХО',door.x,1.25,door.z,'door');
  else if(run.player.weapon==='pipe'){pickupPrompt.classList.remove('hidden');pickupPrompt.textContent='E · МЕТНУТЬ   F · ПОЛОЖИТЬ';pickupPrompt.dataset.kind='pipe';pickupPrompt.style.left='50%';pickupPrompt.style.top='auto';pickupPrompt.style.bottom='18%';}
  else if(nearPipe)showWorldPrompt('F · ВЗЯТЬ ТРУБУ',p.x,.78,p.z,'pipe');
  if(!free)return;
  pipeWorld.position.set(p.x,p.thrown?.52:(.15+Math.sin(now*.004)*.018),p.z);
  if(p.thrown)pipeWorld.rotation.set(now*.018,now*.026,now*.031);else pipeWorld.rotation.set(.18,now*.00055,.30);
  pickupRing.position.set(p.x,.018,p.z);pickupRing.scale.setScalar(1+Math.sin(now*.007)*.06);pipeSpot.position.set(p.x,1.3,p.z);pipeSpot.intensity=run.kills>=4?1.65:.48;
}
function syncMissionWorld(now){
  const visible=!run.mission.cassetteTaken&&run.kills>=3;cassette.visible=visible;cassetteRing.visible=visible;cassetteLight.visible=visible;
  if(visible){cassette.position.y=Math.sin(now*.004)*.025;cassette.rotation.y=Math.sin(now*.002)*.08;cassetteRing.scale.setScalar(1+Math.sin(now*.006)*.07);cassetteLight.intensity=1.0+Math.sin(now*.005)*.22;}
  const extracting=!!run.mission.extractReady;extractRing.visible=extracting;extractLight.visible=extracting;if(extracting){extractRing.material.opacity=.62+Math.sin(now*.006)*.18;extractRing.scale.setScalar(1+Math.sin(now*.005)*.08);extractLight.intensity=1.2+Math.sin(now*.004)*.35;if(Math.hypot(run.player.x-extractPos.x,run.player.z-extractPos.z)<2.2)showWorldPrompt('ВЫХОД · ЛЕСТНИЦА',extractPos.x,.72,extractPos.z,'extract');}
}
function updateGatesVisual(dt){for(let i=0;i<gateMeshes.length;i++){const m=gateMeshes[i],targetX=run.gates[i]?m.userData.openX:m.userData.closedX;m.position.x=expLerp(m.position.x,targetX,9,dt);m.material.opacity=expLerp(m.material.opacity,run.gates[i]?.42:1,10,dt);gateGlows[i].intensity=expLerp(gateGlows[i].intensity,run.gates[i]?1.3:.38,8,dt);}}
function updateCombatDoors(dt){for(const d of combatDoors){d.open=expLerp(d.open,d.target,16,dt);d.bashCd=Math.max(0,d.bashCd-dt);d.pivot.rotation.y=d.open*(Math.PI*.5*d.dir);d.mesh.material.emissive?.setHex(d.open<.15?0x1f100d:0x071418);d.mesh.material.emissiveIntensity=d.open<.15?.16:.06;}}
function updateCutaway(dt,p){for(const m of cutawayWalls){const between=m.position.z>p.z+.18&&m.position.z<camera.position.z+.35,target=between?.035:1;m.material.opacity=expLerp(m.material.opacity,target,18,dt);m.material.depthWrite=m.material.opacity>.55;}for(let i=0;i<gateMeshes.length;i++){const m=gateMeshes[i],g=GATES[i],between=g.z>p.z+.18&&g.z<camera.position.z+.35,target=between?.045:(run.gates[i]?.42:1);m.material.opacity=expLerp(m.material.opacity,target,18,dt);m.material.depthWrite=m.material.opacity>.55;}}
function updateViews(dt,now){const frozen=hitFreeze>0,actorDt=frozen?0:dt,p=run.player,pa=p.currentAttack?.profile,prog=pa?clamp(p.stateT/pa.duration,0,1):0;playerView.setPosition(p);playerView.update(actorDt,p,prog);for(let i=0;i<run.enemies.length;i++){const e=run.enemies[i],v=enemyViews[i];v.setPosition(e);v.update(actorDt,e,0);v.group.visible=!e.dead||v.current==='Death';}syncPipeWorld(now);syncMissionWorld(now);updateGatesVisual(dt);updateCombatDoors(dt);updateEffects(dt);cameraImpact=Math.max(0,cameraImpact-dt*4.4);
  if(run.phase==='intro'){
    const u=clamp(run.introT/T.introDuration,0,1),s=u*u*(3-2*u);camera.position.set(12.8*(1-s)+.2*s,6.4*(1-s)+7.35*s,13.8*(1-s)+13.0*s);const look=new THREE.Vector3(7.5*(1-s),1.4*(1-s)+.82*s,6.0*(1-s)+6.0*s);camera.lookAt(look);camera.fov=expLerp(camera.fov,50,10,dt);camera.updateProjectionMatrix();
  }else{
    const combat=currentTarget&&currentTarget.active&&!currentTarget.dead&&run.phase==='playing';const focusX=combat?(p.x+currentTarget.x)*.5:p.x,focusZ=combat?(p.z+currentTarget.z)*.5:p.z-.8;const camZ=p.z+(combat?3.55:4.60),camY=combat?5.55:6.55;camera.position.x=expLerp(camera.position.x,focusX*.72+p.x*.28,16,dt);camera.position.y=expLerp(camera.position.y,camY-cameraImpact*.26,18,dt);camera.position.z=expLerp(camera.position.z,camZ-cameraImpact*.18,18,dt);if(shake>0){shake=Math.max(0,shake-dt*3.5);camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake*.24;camera.position.z+=(Math.random()-.5)*shake*.66;}camera.lookAt(new THREE.Vector3(focusX,1.02,focusZ));camera.fov=expLerp(camera.fov,(combat?43.0:49.0)-cameraImpact*3.8,18,dt);camera.updateProjectionMatrix();
  }
  updateCutaway(dt,p);
  if(flashT>0){flashT=Math.max(0,flashT-dt);flashEl.style.opacity=String(parseFloat(flashEl.style.opacity||0)*.84);}else flashEl.style.opacity='0';if(chapterT>0){chapterT=Math.max(0,chapterT-dt);if(chapterT<=0)chapterCard.classList.add('hidden');}if(feedT>0){feedT=Math.max(0,feedT-dt);if(feedT<=0)combatFeed.textContent='';}
}

function checkpointSpawn(kills,cassetteTaken=false){const i=(kills===5&&!cassetteTaken)?4:(kills>=5?5:kills);return [8.85,1.25,-6.05,-13.35,-20.55,-27.80][clamp(i,0,5)];}
function checkpointX(kills,cassetteTaken=false){const i=(kills===5&&!cassetteTaken)?4:(kills>=5?5:kills);return [0,-1.85,2.0,-1.70,1.75,-1.55][clamp(i,0,5)];}
function applyProgressState(fresh,kills,cassetteTaken=false,scoreSnapshot=null){
  fresh.phase='playing';fresh.introT=T.introDuration;fresh.kills=kills;fresh.mission.cassetteTaken=!!cassetteTaken;fresh.player.z=checkpointSpawn(kills,cassetteTaken);fresh.player.x=checkpointX(kills,cassetteTaken);
  for(let i=0;i<kills&&i<5;i++){fresh.enemies[i].dead=true;fresh.enemies[i].active=false;fresh.enemies[i].hp=0;if(i<4||(i===4&&cassetteTaken))fresh.gates[i]=true;}
  if(cassetteTaken&&kills>=5)fresh.gates[4]=true;
  if(scoreSnapshot){fresh.time=scoreSnapshot.time||0;fresh.score=scoreSnapshot.score||0;fresh.styleTypes={...(scoreSnapshot.styleTypes||{})};fresh.parries=scoreSnapshot.parries||0;fresh.blocks=scoreSnapshot.blocks||0;fresh.finishers=scoreSnapshot.finishers||0;fresh.stealthKills=scoreSnapshot.stealthKills||0;fresh.doorBashes=scoreSnapshot.doorBashes||0;fresh.throws=scoreSnapshot.throws||0;fresh.peakStyle=scoreSnapshot.peakStyle||1;}
  fresh.currentEncounter=-1;fresh.finalDefeated=false;fresh.mission.extractReady=false;return fresh;
}
function syncStateToViews(){enemyToken=null;currentTarget=null;hitFreeze=0;shake=0;cameraImpact=0;pending.length=0;resetBreakables();rebuildStains();deathPanel.classList.add('hidden');clearPanel.classList.add('hidden');playerView.group.visible=true;playerView.play('Idle_Neutral',true,.01,1.0);for(let i=0;i<run.enemies.length;i++){const e=run.enemies[i],v=enemyViews[i];e._view=v;v.group.visible=!e.dead;v.tell.material.opacity=0;v.warn.visible=false;v.sense.visible=false;v.threatLine.visible=false;v.play('Idle_Neutral',true,.01,.92);v.setPosition(e);}playerView.setPosition(run.player);for(let i=0;i<GATES.length;i++){const m=gateMeshes[i];m.position.x=run.gates[i]?m.userData.openX:m.userData.closedX;m.position.y=1.05;m.material.opacity=run.gates[i]?.42:1;}const doorThresholds=[2,4,6];for(let i=0;i<combatDoors.length;i++){const d=combatDoors[i],open=run.kills>=doorThresholds[i];d.target=d.open=open?1:0;d.pivot.rotation.y=d.open*(Math.PI*.5*d.dir);d.bashCd=0;}refreshGuidance(true);updateHUD();}
function restartCheckpoint(){const inFinal=run.kills>=5&&!run.finalDefeated,checkpointKills=inFinal?5:run.kills,cassetteTaken=run.mission.cassetteTaken,scoreSnapshot=inFinal&&run.finalCheckpoint?run.finalCheckpoint:{score:run.score,styleTypes:run.styleTypes,parries:run.parries,blocks:run.blocks,finishers:run.finishers,stealthKills:run.stealthKills,doorBashes:run.doorBashes,throws:run.throws,time:run.time,peakStyle:run.peakStyle};run=applyProgressState(makeRunState(),checkpointKills,cassetteTaken,scoreSnapshot);syncStateToViews();doFlash('#73efff',.10,.06);showChapter('ПОВТОР','ЭТА ЖЕ СЦЕНА','Без загрузки.',.65);updateAmbient(false);}
function fullRestart(withIntro=true){run=makeRunState();if(!withIntro){run.phase='playing';run.introT=T.introDuration;}syncStateToViews();if(withIntro){document.body.classList.add('intro');}else{document.body.classList.remove('intro');showChapter('02:14 · АБАКАН','ЖУКОВА 3','Цель: кассета.',.9);}updateAmbient(false);}
function renderLoop(now){requestAnimationFrame(renderLoop);const dt=Math.min(.04,(now-last)/1000);last=now;if(!started){renderer.render(scene,camera);return;}acc+=dt;let guard=0;while(acc>=FIX&&guard++<6){updateFixed(FIX);acc-=FIX;}updateViews(dt,now);renderer.render(scene,camera);}
requestAnimationFrame(renderLoop);

async function boot(){startButton.disabled=true;startButton.textContent='ЗАГРУЗКА…';try{const [pg,punk1,worker1,suit,punk2,worker2,swat,suit2]=await Promise.all([loadGLTF('assets/characters/Casual_Hoodie.gltf'),loadGLTF('assets/characters/Punk.gltf'),loadGLTF('assets/characters/Worker.gltf'),loadGLTF('assets/characters/Suit.gltf'),loadGLTF('assets/characters/Punk.gltf'),loadGLTF('assets/characters/Worker.gltf'),loadGLTF('assets/characters/Swat.gltf'),loadGLTF('assets/characters/Suit.gltf')]);playerView=new ActorView(pg,'player',true);enemyViews.push(new ActorView(punk1,'punk'),new ActorView(worker1,'worker'),new ActorView(suit,'suit'),new ActorView(punk2,'punk'),new ActorView(worker2,'worker'),new ActorView(swat,'swat'),new ActorView(suit2,'suit'));for(let i=0;i<run.enemies.length;i++)run.enemies[i]._view=enemyViews[i];playerView.setPosition(run.player);enemyViews.forEach((v,i)=>v.setPosition(run.enemies[i]));camera.position.set(12.8,6.4,13.8);camera.lookAt(7.5,1.4,6.0);ready=true;startButton.disabled=false;startButton.textContent='ПОДНЯТЬСЯ';refreshGuidance(true);}catch(err){console.error(err);startButton.textContent='ОШИБКА ЗАГРУЗКИ';document.querySelector('.poster p').textContent='Не удалось загрузить модели. Запускай через ___START.command.';}}
startButton.addEventListener('click',()=>{if(!ready)return;ensureAudio();started=true;startPanel.classList.add('gone');document.body.classList.add('intro');fullRestart(true);});
boot();
window.__HA_SLICE__={getState:()=>run,restart:restartCheckpoint,fullRestart:()=>fullRestart(false),build:'HOTLINE_ABAKAN_VERTICAL_SLICE_12_VISUAL_COHESION_2026-10-12'};
})();
