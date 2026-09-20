import { createScore } from '../src/score.js';
import { createWorld, GUN_TEMPERS } from '../src/world.js';
import { fromAscii } from '../src/level.js';
import { generateLevel } from '../src/generate.js';
let fail=0; const ok=(name,yes)=>{console.log((yes?'OK ':'FAIL ')+name); if(!yes)fail++;};
const level={}; const score=createScore(level,1);
score.feed([{type:'kill',by:'player',weapon:'bat',x:0,y:0}]); score.update(.55);
score.feed([{type:'kill',by:'player',weapon:'bat',x:0,y:0}]); score.update(.55);
score.feed([{type:'kill',by:'player',weapon:'bat',x:0,y:0}]);
ok('быстрые убийства собирают FLOW', score.state.flow===3 && score.state.maxFlow===3);
score.update(1.5); ok('FLOW гаснет быстрее обычного combo', score.state.flow===0 && score.state.combo>0);
const final=score.finish({total:3,time:6,kills:3}); ok('flow виден в итогах', final.lines.some(x=>x.label.includes('ОДНОМ ДЫХАНИИ')));
for(let seed=1;seed<=30;seed++){
  const l=generateLevel(seed,{depth:5}); const roles=new Set(Object.values(l.roomRoles));
  ok(`seed ${seed} имеет четыре базовых encounter-типа`, ['quiet','armory','crossfire','rush'].every(r=>roles.has(r)));
}
const w=createWorld(fromAscii(['########','#@.s.s.#','#......#','########']));
const guns=w.enemies.map(e=>e.temper); ok('стрелки получают не один характер', guns.every(x=>GUN_TEMPERS.includes(x)) && new Set(guns).size>=2);
process.exit(fail?1:0);
