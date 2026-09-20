import { generateLevel } from '../src/generate.js';
import { encode } from '../src/level.js';
import { createWorld, TILE_SIZE } from '../src/world.js';
import { buildFlowField } from '../src/ai.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const sameA = generateLevel(4242, { depth: 3 });
const sameB = generateLevel(4242, { depth: 3 });
check('одно зерно даёт один этаж', encode(sameA) === encode(sameB));
check('другое зерно меняет этаж', encode(sameA) !== encode(generateLevel(4243, { depth: 3 })));

let sealed = 0;
let ambush = 0;
const themes = new Set();
const roles = new Set();
const low = [];
const high = [];

for (let seed = 1; seed <= 120; seed += 1) {
  for (const depth of [1, 8]) {
    const level = generateLevel(seed, { depth });
    const world = createWorld(level);
    const exitIndex = level.tiles.findIndex((tile) => tile === 4);
    const field = buildFlowField(world,
      ((exitIndex % level.w) + 0.5) * TILE_SIZE,
      (Math.floor(exitIndex / level.w) + 0.5) * TILE_SIZE);
    const reach = (x, y) => field[Math.floor(y / TILE_SIZE) * world.w + Math.floor(x / TILE_SIZE)] >= 0;

    if (!reach(world.player.x, world.player.y)) sealed += 1;
    for (const enemy of world.enemies) {
      if (!reach(enemy.x, enemy.y)) sealed += 1;
      if (Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) < TILE_SIZE * 4) ambush += 1;
    }

    themes.add(level.theme);
    Object.values(level.roomRoles || {}).forEach((role) => roles.add(role));
    (depth === 1 ? low : high).push(world.enemies.length);
  }
}

const avg = (xs) => xs.reduce((sum, value) => sum + value, 0) / xs.length;
check('120×2 случайных этажей связны', sealed === 0, `запертых точек ${sealed}`);
check('враги не стоят у самого входа', ambush === 0, `слишком близко ${ambush}`);
check('используются все восемь визуальных тем', themes.size === 8, `${themes.size}/8`);
check('генератор выдаёт разные типы encounter-комнат', roles.size >= 7, [...roles].join(', '));
check('глубокая ночь плотнее первой', avg(high) > avg(low) + 5,
  `${avg(low).toFixed(1)} → ${avg(high).toFixed(1)} врагов`);

if (failed) {
  console.error(`\nпровалено: ${failed}`);
  process.exit(1);
}
console.log('\nпроцедурные этажи работают');
