/*
 * ОДИН УДАР — прогон боя без браузера.
 *
 *   node avto/tests/sim.mjs
 *
 * Мир не знает ни про холст, ни про ввод, поэтому его можно крутить в
 * Node и спрашивать с него правила: сбивает ли кулак, слышно ли выстрел,
 * доходит ли враг через двери, открывается ли выход после зачистки.
 *
 * Проверки писались по ходу работы и один раз уже поймали настоящую
 * ошибку: бот не мог зачистить этаж, потому что упирался в стену — с
 * этого начался разбор, кто здесь ищет дорогу, а кто нет.
 */

import { CAMPAIGN } from '../src/levels.js';
import { createWorld, update, WEAPONS, MOVES, BARE_HP, BEAT_PERIOD, BEAT_WINDOW, inRhythm, TILE_SIZE, hasSight, tileIndex } from '../src/world.js';
import { createScore } from '../src/score.js';
import { AIM_CONE, assistAim, closeThreat, meleeSnap } from '../src/aim.js';
import { buildFlowField } from '../src/ai.js';
import { blocksMove, encode, decode } from '../src/level.js';
import { generateLevel } from '../src/generate.js';

const DT = 1 / 60;
const idle = { moveX: 0, moveY: 0, aimAngle: null, attack: false };
const report = [];
let failures = 0;

function check(name, ok, detail = '') {
  report.push(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
}

function run(world, seconds, intentFor) {
  for (let i = 0; i < seconds / DT; i += 1) {
    update(world, DT, intentFor ? intentFor(world, i * DT) : idle);
  }
}

/*
 * Безоружный удар стал двухфазным: нажатие начинает замах, попадание
 * случается через startup приёма. Поэтому нажать мало — надо прокрутить
 * кадры до самого удара.
 */
function bare(world, moveId = 'hand', frames = 26) {
  const angle = world.player.angle;
  update(world, DT, { ...idle, aimAngle: angle, attack: true, move: moveId });
  for (let i = 0; i < frames; i += 1) {
    update(world, DT, { ...idle, aimAngle: angle });
  }
}

function nearest(world) {
  let best = null, dist = Infinity;
  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;
    const d = Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y);
    if (d < dist) { dist = d; best = enemy; }
  }
  return { enemy: best, dist };
}

/* --- A. Мир крутится вхолостую и никого не убивает --- */
{
  const world = createWorld(CAMPAIGN[0]);
  run(world, 25);
  check('20 секунд простоя не роняют мир', world.player.alive && world.state === 'play',
    `состояние ${world.state}`);
  check('никто не поднял тревогу сам по себе',
    world.enemies.every((e) => e.state !== 'chase'),
    world.enemies.map((e) => e.state).join(','));
}

/* --- B. Кулак сбивает, второй удар добивает --- */
{
  const world = createWorld(CAMPAIGN[0]);
  /* Берём вооружённого: голыми руками его только сбивают с ног. */
  const victim = world.enemies.find((e) => e.weapon === 'bat');
  const player = world.player;
  player.x = victim.x - 20;
  player.y = victim.y;
  player.angle = 0;
  /* Враг смотрит на игрока: иначе это удар со спины, а он убивает сразу. */
  victim.angle = Math.PI;

  bare(world);
  check('кулаком враг сбит с ног, но жив', victim.downed > 0 && victim.alive,
    `downed=${victim.downed.toFixed(2)} alive=${victim.alive}`);

  run(world, 0.4);
  /* Подходим вплотную: проверяем правило добивания, а не длину скольжения. */
  player.x = victim.x - 20;
  player.y = victim.y;
  player.cooldown = 0;
  bare(world);
  check('добивание лежачего засчитано', !victim.alive && world.kills === 1,
    `kills=${world.kills}`);
  check('после смерти на полу осталось оружие', world.pickups.some((p) => p.weapon === 'bat'));
}

/* --- C. Выстрел убивает и слышен другим --- */
{
  const world = createWorld(CAMPAIGN[0]);
  const player = world.player;
  const { enemy } = nearest(world);
  player.weapon = 'pistol';
  player.ammo = 12;
  player.x = enemy.x;
  player.y = enemy.y + 120;
  player.angle = -Math.PI / 2;

  const sees = hasSight(world, player.x, player.y, enemy.x, enemy.y);
  update(world, DT, { ...idle, attack: true });
  run(world, 0.4);
  check('пуля с дистанции убивает', sees ? !enemy.alive : true,
    `видимость=${sees} жив=${enemy.alive}`);
  check('патрон списан', player.ammo === 11, `ammo=${player.ammo}`);
  const woken = world.enemies.filter((e) => e.alive && e.state !== 'idle').length;
  check('выстрел поднял соседей', woken > 0, `подняты ${woken}`);
}

/* --- D. Враг доходит до игрока через двери --- */
{
  const world = createWorld(CAMPAIGN[0]);
  const enemy = world.enemies.find((e) => e.kind === 'thug');
  enemy.state = 'chase';
  const before = Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y);
  run(world, 12);
  const after = Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y);
  check('преследователь находит дорогу к игроку', after < before * 0.4 || !world.player.alive,
    `было ${before | 0} стало ${after | 0}, игрок ${world.player.alive ? 'жив' : 'убит'}`);
}

/* --- E. Полная зачистка открывает выход --- */
{
  const world = createWorld(CAMPAIGN[0]);

  /*
   * Бот ходит по той же волне, что и враги: иначе он упирается в стену и
   * тест меряет не игру, а тупость бота.
   */
  function stepToward(w, target) {
    const field = buildFlowField(w, target.x, target.y);
    const player = w.player;
    const cx = Math.floor(player.x / TILE_SIZE);
    const cy = Math.floor(player.y / TILE_SIZE);
    let best = field[cy * w.w + cx];
    if (best < 0) return { x: 0, y: 0 };
    let dx = 0, dy = 0;
    for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      if (ox && oy) {
        if (blocksMove(w.tiles[cy * w.w + nx]) || blocksMove(w.tiles[ny * w.w + cx])) continue;
      }
      const value = field[ny * w.w + nx];
      if (value < 0 || value >= best) continue;
      best = value; dx = ox; dy = oy;
    }
    if (!dx && !dy) return { x: 0, y: 0 };
    const angle = Math.atan2((cy + dy + 0.5) * TILE_SIZE - player.y, (cx + dx + 0.5) * TILE_SIZE - player.x);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  run(world, 120, (w) => {
    const player = w.player;
    player.weapon = 'pistol';
    player.ammo = 12;

    const { enemy, dist } = nearest(w);

    if (enemy) {
      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const clear = hasSight(w, player.x, player.y, enemy.x, enemy.y);
      const step = clear && dist < 260 ? { x: 0, y: 0 } : stepToward(w, enemy);
      return { moveX: step.x, moveY: step.y, aimAngle: angle, attack: clear && dist < 420 };
    }

    let exit = null;
    for (let i = 0; i < w.tiles.length && !exit; i += 1) {
      if (w.tiles[i] === 4) exit = { x: ((i % w.w) + 0.5) * TILE_SIZE, y: ((i / w.w | 0) + 0.5) * TILE_SIZE };
    }
    const step = stepToward(w, exit);
    return { moveX: step.x, moveY: step.y, aimAngle: 0, attack: false };
  });

  check('бот зачистил этаж', world.kills === world.total, `${world.kills}/${world.total}, игрок ${world.player.alive ? 'жив' : 'убит'}`);
  check('выход открылся после зачистки', world.exitOpen || !world.player.alive);
  check('дойдя до выхода, этаж засчитан', world.state === 'clear' || !world.player.alive,
    `состояние ${world.state}, игрок ${world.player.alive ? 'жив' : 'убит'}`);
}

/* --- E2. Счёт: цепочка, казнь, ранг --- */
{
  const world = createWorld(CAMPAIGN[0]);
  const score = createScore(CAMPAIGN[0], 1);
  const player = world.player;

  const step = (intent) => {
    update(world, DT, intent || idle);
    score.feed(world.events);
    score.update(DT);
  };

  /* Ставим игрока с битой вплотную к цели и бьём. */
  const strike = (victim) => {
    player.weapon = 'bat';
    player.cooldown = 0;
    player.x = victim.x - 20;
    player.y = victim.y;
    player.angle = 0;
    victim.angle = Math.PI;
    step({ ...idle, attack: true });
  };

  /* Битой падает любой с одного удара, поэтому годятся все живые. */
  const alive = world.enemies.filter((e) => e.alive);
  strike(alive[0]);
  const first = score.state.score;
  check('первое убийство стоит базовых очков', first === 100, String(first));

  strike(alive[1]);
  check('второе подряд идёт с множителем ×2', score.state.score === 300, String(score.state.score));
  check('множитель показан верно', score.state.combo === 2, String(score.state.combo));

  /* Пауза длиннее окна цепочки обрывает её. */
  for (let i = 0; i < 4.5 / DT; i += 1) step();
  check('пауза обрывает цепочку', score.state.combo === 0, String(score.state.combo));

  const before = score.state.score;
  strike(alive[2]);
  check('после паузы снова базовая цена', score.state.score - before === 100,
    String(score.state.score - before));

  /* Кулаком сбить, кулаком добить: добивание дороже обычного удара. */
  /*
   * Добивание проверяем в отдельном мире: вооружённые на этом этаже
   * кончились, а правило про лежачего от этого не зависит.
   */
  const arena = createWorld(CAMPAIGN[0]);
  const arenaScore = createScore(CAMPAIGN[0], 1);
  const fighter = arena.player;
  const victim = arena.enemies.find((e) => e.weapon === 'bat');

  const arenaStep = (intent) => {
    update(arena, DT, intent || idle);
    arenaScore.feed(arena.events);
    arenaScore.update(DT);
  };

  fighter.weapon = 'fists';
  fighter.cooldown = 0;
  fighter.x = victim.x - 18;
  fighter.y = victim.y;
  fighter.angle = 0;
  victim.angle = Math.PI;      /* лицом к игроку — не со спины */
  arenaStep({ ...idle, attack: true, move: 'hand' });
  for (let i = 0; i < 10; i += 1) arenaStep();
  check('кулак не убивает, а сбивает', victim.alive && victim.downed > 0);

  const beforeExecution = arenaScore.state.score;
  for (let i = 0; i < 0.4 / DT; i += 1) arenaStep();
  fighter.cooldown = 0;
  fighter.x = victim.x - 18;
  fighter.y = victim.y;
  arenaStep({ ...idle, attack: true, move: 'hand' });
  for (let i = 0; i < 10; i += 1) arenaStep();
  const gained = arenaScore.state.score - beforeExecution;
  check('добивание лежачего дороже удара', gained === 150, `получено ${gained}`);
  check('казнь посчитана отдельно', arenaScore.state.executions === 1);

  const final = score.finish(world);
  check('ранг рассчитан', ['S', 'A', 'B', 'C', 'D'].includes(final.rank), final.rank);
  check('итог не меньше набранного в бою', final.total >= score.state.score,
    `${final.total} против ${score.state.score}`);
  check('в разборе есть строка за убийства',
    final.lines.some((line) => line.label === 'ЗА УБИЙСТВА'));
}

/* --- E3. Помощь прицела: игра без мыши --- */
{
  const world = createWorld(CAMPAIGN[0]);
  const player = world.player;

  /* Расчищаем этаж: в проверке участвуют только поставленные вручную. */
  for (const enemy of world.enemies) enemy.alive = false;
  const [near, far] = world.enemies;

  /* Ставим только вверх и вбок: под игроком в этом этаже сразу стена. */
  const place = (enemy, dx, dy) => {
    enemy.alive = true;
    enemy.downed = 0;
    enemy.x = player.x + dx;
    enemy.y = player.y + dy;
  };

  /* Враг в 40° от направления бега — сектор бега должен его достать. */
  place(near, 120, -100);
  const running = Math.atan2(0, 1);
  const aimed = assistAim(world, running, AIM_CONE.run);
  const toNear = Math.atan2(near.y - player.y, near.x - player.x);
  check('прицел доводится до цели в стороне от курса',
    Math.abs(aimed - toNear) < 0.001,
    `${(aimed * 57.3).toFixed(0)}° против ${(toNear * 57.3).toFixed(0)}°`);

  check('узкий сектор мыши так далеко не тянется',
    assistAim(world, running, AIM_CONE.mouse) === running);

  /*
   * Правило выбора цели: направление задаёт игрок, расстояние только
   * разнимает близкие по углу. Иначе наводка начинает спорить с тем,
   * куда человек показал, и это читается как «прицел живёт своей жизнью».
   */
  place(far, 200, -8);
  place(near, 100, -4);
  const closer = assistAim(world, running, AIM_CONE.run);
  check('при равном угле выбирается ближний',
    Math.abs(closer - Math.atan2(near.y - player.y, near.x - player.x)) < 0.001,
    `${(closer * 57.3).toFixed(1)}°`);

  place(far, 300, -6);
  place(near, 90, -60);
  const aligned = assistAim(world, running, AIM_CONE.run);
  check('точно по курсу важнее, чем просто рядом',
    Math.abs(aligned - Math.atan2(far.y - player.y, far.x - player.x)) < 0.001,
    `${(aligned * 57.3).toFixed(1)}°`);
  far.alive = false;

  /* За стеной наводка не работает — иначе прицел липнет сквозь этаж. */
  place(near, 0, -180);
  check('стена между — цель не ловится (проверка расстановки)',
    !hasSight(world, player.x, player.y, near.x, near.y));
  check('сквозь стену прицел не тянет',
    assistAim(world, -Math.PI / 2, AIM_CONE.run) === -Math.PI / 2);

  /* Стоим без ввода: подошедший вплотную сам притягивает взгляд. */
  place(near, -60, 0);
  const threat = closeThreat(world);
  check('стоя на месте, поворачиваемся к тому, кто рядом',
    threat !== null && Math.abs(Math.abs(threat) - Math.PI) < 0.001, String(threat));

  place(near, 260, 0);
  check('дальний никого не притягивает', closeThreat(world) === null);

  /* Добор удара: враг сбоку, замах смотрит прямо. */
  player.weapon = 'bat';
  place(near, 8, -26);
  const snapped = meleeSnap(world, 0);
  check('удар доворачивается на стоящего вплотную сбоку',
    snapped !== null && Math.abs(snapped - Math.atan2(-26, 8)) < 0.001, String(snapped));

  place(near, 30, 2);
  check('если цель уже под ударом, доворота нет', meleeSnap(world, 0) === null);

  /* И то же самое целиком: стоя на месте, добить соседа сбоку. */
  place(near, 4, -28);
  player.cooldown = 0;
  const angle = closeThreat(world);
  const finalAngle = meleeSnap(world, angle === null ? player.angle : angle) ?? angle;
  update(world, DT, { moveX: 0, moveY: 0, aimAngle: finalAngle, attack: true });
  check('стоя без движения, удар по соседу засчитан', !near.alive,
    near.alive ? 'враг цел' : 'враг убит');
}

/* --- G. Дверь как оружие --- */
{
  /*
   * Единственная механика, которая награждает за то, что игрок не
   * остановился. Проверяется именно это: влететь можно только на скорости,
   * подойти и толкнуть — нельзя.
   */
  const findDoor = (world) => {
    for (let i = 0; i < world.tiles.length; i += 1) {
      if (world.tiles[i] !== 2) continue;
      return { x: ((i % world.w) + 0.5) * TILE_SIZE, y: ((i / world.w | 0) + 0.5) * TILE_SIZE };
    }
    return null;
  };

  const slam = (speed) => {
    const world = createWorld(CAMPAIGN[0]);
    const door = findDoor(world);
    const victim = world.enemies[0];

    victim.x = door.x + 26;
    victim.y = door.y;
    victim.state = 'idle';

    const player = world.player;
    player.x = door.x - 30;
    player.y = door.y;
    player.angle = 0;

    for (let i = 0; i < 30; i += 1) update(world, DT, { ...idle, moveX: speed, aimAngle: 0 });
    return victim;
  };

  check('влетевший в дверь сбивает стоящего за ней', slam(1).downed > 0);
  check('подойти и толкнуть — не считается', slam(0.35).downed === 0);
}

/* --- H. Удар со спины --- */
{
  const setup = (facing) => {
    const world = createWorld(CAMPAIGN[0]);
    const victim = world.enemies.find((e) => e.weapon === 'bat');
    const player = world.player;

    player.weapon = 'fists';
    player.x = victim.x - 20;
    player.y = victim.y;
    player.angle = 0;
    player.cooldown = 0;

    victim.state = 'idle';
    victim.angle = facing;

    const events = [];
    update(world, DT, { ...idle, attack: true, move: 'hand' });
    events.push(...world.events);
    for (let i = 0; i < 10; i += 1) {
      update(world, DT, idle);
      events.push(...world.events);
    }
    return { world, victim, events };
  };

  /* Стоит спиной и не знает про игрока — умирает от кулака и сразу. */
  const back = setup(0);
  check('кулак со спины убивает', !back.victim.alive);
  check('и делает это тихо', back.events.some((e) => e.type === 'kill' && e.silent));

  /* Смотрит на игрока — обычный кулак только сбивает. */
  const face = setup(Math.PI);
  check('в лицо кулак по-прежнему только сбивает',
    face.victim.alive && face.victim.downed > 0);

  /* Заметивший игрока спиной уже не считается. */
  const alerted = createWorld(CAMPAIGN[0]);
  const chaser = alerted.enemies[0];
  const hunter = alerted.player;
  hunter.weapon = 'fists';
  hunter.x = chaser.x - 20;
  hunter.y = chaser.y;
  hunter.angle = 0;
  hunter.cooldown = 0;
  chaser.angle = 0;
  chaser.state = 'chase';
  bare(alerted);
  check('бегущего на тебя со спины не зарежешь', chaser.alive && chaser.downed > 0);

  /* Тихий удар почти не расходится: соседей не поднимает. */
  const quiet = setup(0);
  run(quiet.world, 1);
  check('тихое убийство не поднимает этаж',
    quiet.world.enemies.filter((e) => e.alive && e.state !== 'idle').length === 0);
}

/* --- H0. Каждый нарисованный этаж проходим --- */
{
  /*
   * Этажи рисуются руками, картинкой из символов, и ошибиться в них проще
   * всего: одна лишняя решётка запирает комнату, и половина этажа
   * становится недостижимой. Глазами такое не видно — карта выглядит
   * нормально, а бот упирается в стену.
   */
  let sealed = 0;
  let ambush = 0;
  const shape = [];

  for (const level of CAMPAIGN) {
    const world = createWorld(level);
    const exitIndex = level.tiles.findIndex((t) => t === 4);
    const field = buildFlowField(world,
      ((exitIndex % level.w) + 0.5) * TILE_SIZE,
      (Math.floor(exitIndex / level.w) + 0.5) * TILE_SIZE);
    const reach = (x, y) => field[Math.floor(y / TILE_SIZE) * world.w + Math.floor(x / TILE_SIZE)] >= 0;

    if (!reach(world.player.x, world.player.y)) sealed += 1;
    for (const enemy of world.enemies) {
      if (!reach(enemy.x, enemy.y)) sealed += 1;
      if (Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) < TILE_SIZE * 5) ambush += 1;
    }
    shape.push(`${level.title}: ${world.enemies.length}`);
  }

  check('все этажи кампании проходимы', sealed === 0, `запертых мест ${sealed}`);
  check('ни на одном этаже не ждут у входа', ambush === 0, `засад ${ambush}`);
  check('этажей в кампании больше одного', CAMPAIGN.length >= 4, shape.join(' · '));
}

/* --- H1. Этажи, которые собрались сами --- */
{
  /*
   * Сгенерированный этаж проверяется не на красоту, а на проходимость.
   * Этаж, где до выхода не дойти или где половина противников заперта в
   * комнате без двери, — это не «сложный уровень», а сломанный, и увидеть
   * это на глаз, перебирая зёрна руками, невозможно.
   */
  const SEEDS = 40;
  let broken = 0;
  let unreachable = 0;
  let crowded = 0;
  let ambushed = 0;
  let mismatched = 0;
  const counts = [];

  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const level = generateLevel(seed);
    const world = createWorld(level);
    const player = world.player;

    /* Волна от входа: куда игрок вообще может дойти. */
    const exitIndex = level.tiles.findIndex((t) => t === 4);
    if (exitIndex < 0) { broken += 1; continue; }
    const exitX = ((exitIndex % level.w) + 0.5) * TILE_SIZE;
    const exitY = ((Math.floor(exitIndex / level.w)) + 0.5) * TILE_SIZE;
    const field = buildFlowField(world, exitX, exitY);
    const reach = (x, y) => field[Math.floor(y / TILE_SIZE) * world.w + Math.floor(x / TILE_SIZE)] >= 0;

    if (!reach(player.x, player.y)) unreachable += 1;
    for (const enemy of world.enemies) if (!reach(enemy.x, enemy.y)) unreachable += 1;

    counts.push(world.enemies.length);
    if (world.enemies.length < 5 || world.enemies.length > 26) crowded += 1;

    /* Никто не должен стоять вплотную ко входу: смерть на первой секунде
       ничему не учит. */
    for (const enemy of world.enemies) {
      if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < TILE_SIZE * 5) ambushed += 1;
    }

    /* Тот же этаж после кода — тот же этаж: сгенерированное должно
       пересылаться ссылкой наравне с нарисованным. */
    const back = decode(encode(level));
    if (!back || back.w !== level.w || back.h !== level.h
      || back.tiles.some((t, i) => t !== level.tiles[i])) mismatched += 1;
  }

  check('сгенерированные этажи собираются', broken === 0, `сломано ${broken} из ${SEEDS}`);
  check('до выхода и до каждого противника можно дойти', unreachable === 0,
    `недостижимых ${unreachable}`);
  check('населённость этажа в разумных пределах', crowded === 0,
    `мимо ${crowded}, разброс ${Math.min(...counts)}..${Math.max(...counts)}`);
  check('у входа не ждут вплотную', ambushed === 0, `засад ${ambushed}`);
  check('сгенерированный этаж переживает кодирование', mismatched === 0,
    `разошлось ${mismatched}`);
}

/* --- H2. Ритм решает бой --- */
{
  /*
   * Обещание игры: попал в такт — почти гарантированно победил.
   *
   * Меряется не «бот против бота»: боту нечего бояться, он молотит без
   * остановки и в дуэли один на один выигрывает просто потому, что не
   * ждёт. Меряется само правило, из трёх частей, — каждая проверяется
   * отдельно, потому что вместе они и дают обещанное.
   */
  const setup = ({ beat }) => {
    const world = createWorld(CAMPAIGN[0]);
    const player = world.player;
    const enemy = world.enemies.find((e) => !e.weapon);
    for (const other of world.enemies) if (other !== enemy) other.alive = false;
    player.weapon = 'fists';
    enemy.state = 'idle';
    enemy.cooldown = 99;
    enemy.vx = 0;
    enemy.vy = 0;
    player.x = enemy.x - 20;
    player.y = enemy.y;
    player.angle = 0;
    world.beatAt = beat ? world.time : world.time - BEAT_PERIOD / 2;
    return { world, player, enemy };
  };

  /* 1. Сила: в долю — с одного, мимо — с двух. Проверено ниже, в разделе I. */

  /* 2. Темп: откат после удара в долю короче, и следующий успевает в
     следующую долю. */
  const beatRun = setup({ beat: true });
  update(beatRun.world, DT, { ...idle, aimAngle: 0, attack: true });
  const beatCooldown = beatRun.player.cooldown;

  const plainRun = setup({ beat: false });
  update(plainRun.world, DT, { ...idle, aimAngle: 0, attack: true });
  const plainCooldown = plainRun.player.cooldown;

  check('удар в долю откатывается быстрее', beatCooldown < plainCooldown * 0.7,
    `${beatCooldown.toFixed(2)} против ${plainCooldown.toFixed(2)}`);
  check('следующий удар успевает в следующую долю', beatCooldown < BEAT_PERIOD,
    `откат ${beatCooldown.toFixed(2)} при доле ${BEAT_PERIOD.toFixed(2)}`);

  /* 3. Право первого удара: замах, начатый в долю, чужим кулаком не сбить. */
  const trade = (beat) => {
    const { world, player, enemy } = setup({ beat });
    update(world, DT, { ...idle, aimAngle: 0, attack: true });
    /* Противник бьёт в тот же момент, когда игрок уже замахнулся. */
    for (let i = 0; i < 20 && player.alive && enemy.alive; i += 1) {
      enemy.cooldown = 0;
      enemy.angle = Math.PI;
      enemy.x = player.x + 20;
      enemy.y = player.y;
      enemy.vx = 0;
      enemy.vy = 0;
      update(world, DT, { ...idle, aimAngle: 0 });
    }
    return { playerAlive: player.alive, enemyAlive: enemy.alive };
  };

  const inBeat = trade(true);
  check('замах в долю доводится до конца', inBeat.playerAlive && !inBeat.enemyAlive,
    `игрок ${inBeat.playerAlive ? 'жив' : 'убит'}, противник ${inBeat.enemyAlive ? 'жив' : 'убит'}`);

  /* 4. Доля — только игроку: иначе враги начнут убивать с одного касания
     и этаж станет непроходимым. */
  const enemyBeat = createWorld(CAMPAIGN[0]);
  enemyBeat.beatAt = enemyBeat.time;
  const brawler = enemyBeat.enemies.find((e) => !e.weapon);
  const victim = enemyBeat.player;
  victim.hp = BARE_HP;
  victim.x = brawler.x - 20;
  victim.y = brawler.y;
  brawler.angle = Math.PI;
  brawler.cooldown = 0;
  for (let i = 0; i < 40 && victim.hp === BARE_HP; i += 1) {
    brawler.vx = 0;
    brawler.vy = 0;
    victim.x = brawler.x - 20;
    victim.y = brawler.y;
    update(enemyBeat, DT, { ...idle, aimAngle: 0 });
  }
  check('удар врага в долю бьёт как обычный', victim.hp === BARE_HP - 1,
    `осталось ${victim.hp} из ${BARE_HP}`);
}

/* --- I. Рукопашная: простые правила --- */
{
  /*
   * Обычная драка намеренно простая: удар это просто удар. Голыми руками
   * кладут с двух, оружием с одного. Приёмы и круг «камень-ножницы-бумага»
   * в общей свалке оказались нечитаемы и остались только для дуэлянтов
   * (флаг duel) — это задел под боссов.
   */
  const hits = ({ beat }) => {
    const world = createWorld(CAMPAIGN[0]);
    const player = world.player;
    const enemy = world.enemies.find((e) => !e.weapon);

    player.weapon = 'fists';
    enemy.state = 'idle';
    enemy.cooldown = 99;
    enemy.angle = Math.PI;

    let count = 0;
    while (count < 6 && enemy.alive) {
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.guard = null;
      player.cooldown = 0;
      player.x = enemy.x - 20;
      player.y = enemy.y;
      player.angle = 0;
      /* Доля ставится вручную: либо нажатие приходится ровно на неё,
         либо ровно между двумя. */
      world.beatAt = beat ? world.time : world.time - BEAT_PERIOD / 2;
      update(world, DT, { ...idle, aimAngle: 0, attack: true });
      for (let k = 0; k < 24; k += 1) {
        enemy.vx = 0;
        enemy.vy = 0;
        update(world, DT, { ...idle, aimAngle: 0 });
      }
      count += 1;
    }
    return { count, alive: enemy.alive };
  };

  /*
   * Отметка попадания. Дуга удара рисуется по ней: есть отметка — белый
   * сектор, нет — тонкая линия промаха. Рукопашная её не ставила, и
   * каждое попадание кулаком выглядело промахом.
   */
  {
    const world = createWorld(CAMPAIGN[0]);
    const player = world.player;
    const enemy = world.enemies.find((e) => !e.weapon);
    player.weapon = 'fists';
    enemy.state = 'idle';
    enemy.cooldown = 99;
    enemy.vx = 0;
    enemy.vy = 0;
    /* Лицом к игроку: удар со спины уходит другим путём, мимо расчёта
       урона, и отметку не ставит — там своя, тихая смерть. */
    enemy.angle = Math.PI;
    player.x = enemy.x - 20;
    player.y = enemy.y;
    player.angle = 0;
    update(world, DT, { ...idle, aimAngle: 0, attack: true });
    for (let i = 0; i < 12 && !player.swingHit; i += 1) {
      enemy.angle = Math.PI;
      enemy.vx = 0;
      enemy.vy = 0;
      update(world, DT, { ...idle, aimAngle: 0 });
    }
    check('попадание кулаком помечено как попадание', player.swingHit > 0,
      `отметка ${player.swingHit}`);
  }

  const offBeat = hits({ beat: false });
  check('мимо доли безоружного кладут два удара', !offBeat.alive && offBeat.count === 2,
    `${offBeat.count} удара, жив=${offBeat.alive}`);

  const onBeat = hits({ beat: true });
  check('в долю — с одного', !onBeat.alive && onBeat.count === 1,
    `${onBeat.count} удара, жив=${onBeat.alive}`);

  /* Оружие возвращает главное правило игры. */
  const armed = createWorld(CAMPAIGN[0]);
  const target = armed.enemies.find((e) => !e.weapon);
  armed.player.weapon = 'bat';
  armed.player.cooldown = 0;
  armed.player.x = target.x - 24;
  armed.player.y = target.y;
  armed.player.angle = 0;
  target.state = 'chase';
  target.angle = Math.PI;
  update(armed, DT, { ...idle, aimAngle: 0, attack: true });
  check('бита кладёт его с одного удара', !target.alive);

  /* Обычный враг не изображает школу единоборств. */
  const plain = createWorld(CAMPAIGN[0]);
  const simple = plain.enemies.find((e) => !e.weapon);
  simple.state = 'chase';
  run(plain, 3);
  check('у обычного бойца нет стойки', !simple.guard, String(simple.guard));
}

/* --- J. Круг приёмов остаётся рабочим для дуэлянтов --- */
{
  /*
   * Механика не выброшена, а отложена: она про дуэль один на один, а не
   * про зачистку этажа. Проверка держит её живой до боссов — иначе к тому
   * моменту от неё останется код, который никто не запускал.
   */
  const duel = (playerMove, enemyMove) => {
    const world = createWorld(CAMPAIGN[0]);
    const player = world.player;
    const enemy = world.enemies.find((e) => !e.weapon);

    player.weapon = 'fists';
    player.duel = true;
    player.cooldown = 0;
    player.x = enemy.x - 20;
    player.y = enemy.y;
    player.angle = 0;

    enemy.duel = true;
    enemy.state = 'idle';
    enemy.cooldown = 99;
    enemy.angle = Math.PI;
    enemy.vx = 0;
    enemy.vy = 0;

    const events = [];
    update(world, DT, { ...idle, aimAngle: 0, attack: true, move: playerMove });
    events.push(...world.events);

    for (let i = 0; i < 26; i += 1) {
      enemy.move = enemyMove;
      enemy.moveStart = Math.max(enemy.moveStart, 0.25);
      enemy.moveLeft = Math.max(enemy.moveLeft, 0.3);
      update(world, DT, { ...idle, aimAngle: 0 });
      events.push(...world.events);
    }

    return { world, enemy, player, events };
  };

  const same = duel('kick', 'kick');
  check('в дуэли приём в приём гасится', same.events.some((e) => e.type === 'clash'));

  const beaten = duel('hand', 'grab');
  check('в дуэли перебитый приём никого не ранит',
    beaten.player.hp === BARE_HP && beaten.enemy.hp === BARE_HP);
  check('и об этом сказано событием', beaten.events.some((e) => e.type === 'parry'));

  const win = duel('hand', 'kick');
  check('в дуэли круг решает', win.enemy.hp < BARE_HP, `осталось ${win.enemy.hp}`);
}

/* --- F. Производительность шага --- */
{
  const world = createWorld(CAMPAIGN[0]);
  for (const enemy of world.enemies) enemy.state = 'chase';
  const started = process.hrtime.bigint();
  run(world, 10);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const perFrame = ms / (10 / DT);
  check('шаг мира укладывается в бюджет кадра', perFrame < 1.2,
    `${perFrame.toFixed(3)} мс на кадр при всех врагах в погоне`);
}

console.log(report.join('\n'));
console.log(failures ? `\nПРОВАЛЕНО ПРОВЕРОК: ${failures}` : '\nвсе проверки прошли');
process.exit(failures ? 1 : 0);
