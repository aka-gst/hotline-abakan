import { fromAscii } from '../src/level.js';
import { createWorld } from '../src/world.js';
import { thinkEnemy, buildFlowField } from '../src/ai.js';
let fail=0; const ok=(n,v,d='')=>{console.log(`${v?'OK ':'FAIL '}${n}${d?' — '+d:''}`);if(!v)fail++;};
const level=fromAscii(['############','#q.....@...#','#..........#','############']);
const w=createWorld(level); w.viewRadius=500; const e=w.enemies[0];
ok('q создаёт гарантированного снайпера',e.temper==='снайпер'&&e.kind==='shooter');
w.flow=buildFlowField(w,w.player.x,w.player.y); e.state='chase'; e.angle=0; e.cooldown=0; e.notice=1;
let attackedAt=-1, moved=0;
for(let i=0;i<12;i++){const r=thinkEnemy(w,e,.1,{walk:80,run:130}); if(attackedAt<0)moved+=Math.hypot(r.vx,r.vy); if(r.attack&&attackedAt<0)attackedAt=i;}
ok('снайпер телеграфит дольше половины секунды',attackedAt>=6,`attack frame ${attackedAt}`);
ok('снайпер держит дальнюю позицию во время прицеливания',moved<1,`move sum ${moved.toFixed(2)}`);
process.exit(fail?1:0);
