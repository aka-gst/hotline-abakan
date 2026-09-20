import { CAMPAIGN } from '../src/levels.js';
import { createWorld, TILE_SIZE } from '../src/world.js';
import { buildFlowField } from '../src/ai.js';

let fail = 0;
const ok = (name, yes, note='') => { console.log(`${yes?'OK ':'FAIL '}${name}${note?` — ${note}`:''}`); if(!yes) fail++; };
ok('кампания теперь состоит из 15 авторских этажей', CAMPAIGN.length === 15, String(CAMPAIGN.length));
ok('названия этажей не повторяются', new Set(CAMPAIGN.map(x=>x.title)).size === CAMPAIGN.length);
ok('четыре новых signature-этажа стоят перед процедурной ночью',
  ['СТОЛОВАЯ','ОТЕЛЬ «ДРУЖБА»','ТЕЛЕЦЕНТР','АВТОСЕРВИС'].every((name,i)=>CAMPAIGN[11+i]?.title===name));

for (let i=0;i<CAMPAIGN.length;i++) {
  const level=CAMPAIGN[i], world=createWorld(level), exitIndex=level.tiles.findIndex(tile=>tile===4);
  const ex=((exitIndex%level.w)+.5)*TILE_SIZE, ey=(Math.floor(exitIndex/level.w)+.5)*TILE_SIZE;
  const field=buildFlowField(world,ex,ey);
  const pi=Math.floor(world.player.y/TILE_SIZE)*world.w+Math.floor(world.player.x/TILE_SIZE);
  ok(`этаж ${i+1} «${level.title}» связен от старта до выхода`, exitIndex>=0 && field[pi]>=0);
  ok(`этаж ${i+1} имеет боевую ситуацию`, world.enemies.length>0, `${world.enemies.length} врагов`);
}
process.exit(fail?1:0);
