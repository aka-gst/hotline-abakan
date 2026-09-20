import { generateLevel } from '../src/generate.js';
let fail = 0;
const ok = (name, yes, detail='') => { console.log(`${yes?'OK ':'FAIL '}${name}${detail?` — ${detail}`:''}`); if(!yes) fail++; };
for (let seed=1; seed<=40; seed++) {
  const l = generateLevel(seed, { depth: 7 });
  const roles = new Set(Object.values(l.roomRoles));
  ok(`night ${seed}: breach+pinch+overwatch`, roles.has('breach') && roles.has('pinch') && roles.has('overwatch'), [...roles].join(','));
  ok(`night ${seed}: encounter arc metadata`, l.encounterArc && Object.values(l.encounterArc).reduce((a,b)=>a+b,0)===12);
}
const a=generateLevel(77,{depth:7}), b=generateLevel(77,{depth:7});
ok('director remains deterministic', JSON.stringify(a.roomRoles)===JSON.stringify(b.roomRoles));
process.exit(fail?1:0);
