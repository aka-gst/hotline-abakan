/*
 * ОДИН УДАР — мир: тела, столкновения, оружие, смерть.
 *
 * Здесь нет ни отрисовки, ни ввода. Мир получает намерение игрока
 * (куда идти, куда смотреть, что нажал) и продвигает себя на dt.
 * Что рисовать — решает render.js, что делают враги — ai.js.
 *
 * Главное правило жанра: с одного удара умирают все, включая игрока.
 * Поэтому здоровья нет ни у кого, а есть только «жив» и «лежит».
 */

import { TILE, blocksMove, blocksSight, blocksShot, breakable } from './level.js';
import { thinkEnemy, buildFlowField } from './ai.js';

export const TILE_SIZE = 32;

/* Радиус тела одинаков у всех: попадание должно читаться на глаз. */
export const BODY = 9;

export const WEAPONS = {
  fists: {
    id: 'fists', name: 'КУЛАКИ', kind: 'melee',
    reach: 28, arc: 1.9, cooldown: 0.22, lethal: false, noise: 70,
  },
  bat: {
    id: 'bat', name: 'БИТА', kind: 'melee',
    reach: 38, arc: 2.0, cooldown: 0.27, lethal: true, noise: 110,
  },
  pistol: {
    id: 'pistol', name: 'ПИСТОЛЕТ', kind: 'gun',
    cooldown: 0.19, clip: 12, speed: 820, spread: 0.03, noise: 460,
  },
};

/*
 * Темп. Игра про то, что всё решается за секунду, поэтому разгон почти
 * мгновенный: между нажатием и движением не должно быть ничего, что
 * чувствуется. Враг бежит заметно медленнее игрока — убегать можно, но
 * от пули это не спасает.
 */
const PLAYER_SPEED = 252;
const PLAYER_ACCEL = 3600;
const ENEMY_WALK = 70;
const ENEMY_RUN = 152;
const DOWN_TIME = 2;

/*
 * Физика замаха.
 *
 * Оружие не появляется в момент нажатия и не исчезает после: оно висит на
 * теле и тянется за поворотом с отставанием. Убивает не факт удара, а
 * скорость кончика — поэтому бег по дуге вокруг врага смертелен сам по
 * себе, а тычок стоящего на месте не стоит ничего.
 *
 * Кнопка удара осталась, но делает она теперь одно: бросает в руку резкий
 * импульс. То есть это не второй способ бить, а тот же самый.
 */
const ARM_FOLLOW = 26;      /* насколько сильно рука тянется за прицелом */
const ARM_DRAG = 4.5;       /* сопротивление: без него рука колеблется вечно */
const SWING_IMPULSE = 26;   /* рывок от кнопки, рад/с */
const SWING_WINDUP = 0.85;  /* на столько рука отводится назад перед махом */

/*
 * Порог убийства считается по вращению руки, а не по скорости кончика в
 * мире. Первая версия мерила вторым — и оказалось, что бег по прямой сам
 * по себе даёт кончику скорость тела: оружие «убивало» просто потому, что
 * игрок быстро идёт. Режет не перенос, а мах, поэтому в счёт идёт только
 * угловая скорость.
 *
 * 220 единиц выбраны по замерам: кнопка даёт 930, разворот мышью на 180°
 * — около 350, аккуратный доворот автонаводки на 90° — 178, спокойный
 * поворот на бегу — 53. Порог проходит между двумя последними: своя рука
 * убивает, автоматика — нет. Иначе автонаводка, доворачивающая
 * игрока к цели, убивала бы за него.
 */
const KILL_SWING_SPEED = 220;
const BULLET_LIFE = 1.6;


/* =========================================================
   МЕЛОЧИ
   ========================================================= */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnToward(from, to, step) {
  const d = angleDelta(from, to);
  return from + clamp(d, -step, step);
}

function rand(a, b) { return a + Math.random() * (b - a); }


/* =========================================================
   СЕТКА
   ========================================================= */

export function tileAt(world, x, y) {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return TILE.WALL;
  return world.tiles[ty * world.w + tx];
}

export function tileIndex(world, x, y) {
  const tx = clamp(Math.floor(x / TILE_SIZE), 0, world.w - 1);
  const ty = clamp(Math.floor(y / TILE_SIZE), 0, world.h - 1);
  return ty * world.w + tx;
}

function solidAt(world, x, y) {
  return blocksMove(tileAt(world, x, y));
}

/*
 * Тело двигается по осям раздельно: так оно скользит вдоль стены, а не
 * залипает в углу. Раздельность важнее точности — в дверном проёме
 * шириной в клетку игрок иначе застревает и умирает не по своей вине.
 */
function moveBody(world, body, dx, dy) {
  const r = BODY;

  if (dx) {
    const nx = body.x + dx;
    const edge = nx + Math.sign(dx) * r;
    if (!solidAt(world, edge, body.y - r + 1) && !solidAt(world, edge, body.y + r - 1)) {
      body.x = nx;
    } else {
      body.vx = 0;
    }
  }

  if (dy) {
    const ny = body.y + dy;
    const edge = ny + Math.sign(dy) * r;
    if (!solidAt(world, body.x - r + 1, edge) && !solidAt(world, body.x + r - 1, edge)) {
      body.y = ny;
    } else {
      body.vy = 0;
    }
  }
}

/*
 * Прямая видимость по клеткам (DDA). Стекло намеренно не мешает: сквозь
 * витрину враг вас увидит, и это единственная подсказка, что она там есть.
 */
export function hasSight(world, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) / (TILE_SIZE * 0.4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (blocksSight(tileAt(world, ax + dx * t, ay + dy * t))) return false;
  }
  return true;
}


/* =========================================================
   ЗВУК КАК ИГРОВАЯ СУЩНОСТЬ
   ========================================================= */

/*
 * Выстрел слышно через стены — это плата за пистолет. Кулаки почти
 * бесшумны. Шум не «оповещает всех», а даёт точку, куда враг придёт
 * смотреть: разница между «услышал» и «увидел» и есть весь стелс.
 */
export function emitNoise(world, x, y, radius, source) {
  world.noises.push({ x, y, radius, life: 0.45, max: 0.45 });

  for (const enemy of world.enemies) {
    if (!enemy.alive || enemy.downed > 0) continue;
    if (Math.hypot(enemy.x - x, enemy.y - y) > radius) continue;
    if (enemy.state === 'chase') continue;
    enemy.heard = { x, y };
    enemy.state = 'alert';
    enemy.think = 0;
    if (source === 'player') enemy.suspicion = Math.min(1, enemy.suspicion + 0.6);
  }
}


/* =========================================================
   ЧАСТИЦЫ, КРОВЬ, ГИЛЬЗЫ
   ========================================================= */

function spark(world, x, y, angle, spread, count, color, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = angle + rand(-spread, spread);
    const v = speed * rand(0.4, 1.2);
    world.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rand(0.2, 0.5), max: 0.5, color, size: rand(1, 2.4),
    });
  }
}

/*
 * Кольцо удара. Расходящаяся окружность в точке касания — самый дешёвый
 * способ ответить на вопрос «попал или нет»: она появляется ровно там,
 * где удар что-то нашёл, и только тогда.
 */
function pop(world, x, y, radius, colour) {
  world.pops.push({ x, y, r: radius, max: radius * 2.4, life: 0.22, span: 0.22, colour });
}

function bleed(world, x, y, angle, force) {
  for (let i = 0; i < 22; i += 1) {
    const a = angle + rand(-0.9, 0.9);
    const v = force * rand(0.2, 1.1);
    world.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rand(0.25, 0.6), max: 0.6, color: '#ff1450', size: rand(1.5, 3.4), wet: true,
    });
  }

  /*
   * Лужа рисуется один раз и остаётся до конца попытки. Она тут не
   * украшение, а карта: по ней видно, где ты уже был и куда идти не надо.
   */
  world.decals.push({ x, y, r: rand(11, 18), a: rand(0.6, 0.9) });
  for (let i = 0; i < 9; i += 1) {
    const a = angle + rand(-0.8, 0.8);
    const d = rand(6, 46);
    world.decals.push({
      x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      r: rand(3, 9), a: rand(0.35, 0.7),
    });
  }
}


/* =========================================================
   СОЗДАНИЕ МИРА
   ========================================================= */

export function createWorld(level) {
  const world = {
    level,
    w: level.w,
    h: level.h,
    tiles: Uint8Array.from(level.tiles),

    player: {
      x: level.spawn.x * TILE_SIZE + TILE_SIZE / 2,
      y: level.spawn.y * TILE_SIZE + TILE_SIZE / 2,
      vx: 0, vy: 0,
      angle: (level.spawn.angle || 0) * (Math.PI / 4),
      alive: true,
      weapon: 'fists',
      ammo: 0,
      cooldown: 0,
      swing: 0,
      step: 0,

      /* Рука живёт своей инерцией: угол, скорость и след кончика. */
      arm: (level.spawn.angle || 0) * (Math.PI / 4),
      armVel: 0,
      side: 1,
      /* Кончик известен с самого начала: иначе первый же мах не измерится. */
      tip: {
        x: level.spawn.x * TILE_SIZE + TILE_SIZE / 2
          + Math.cos((level.spawn.angle || 0) * (Math.PI / 4)) * 28,
        y: level.spawn.y * TILE_SIZE + TILE_SIZE / 2
          + Math.sin((level.spawn.angle || 0) * (Math.PI / 4)) * 28,
      },
      tipSpeed: 0,
      trail: [],
    },

    enemies: [],
    pickups: [],
    bullets: [],
    particles: [],
    pops: [],
    decals: [],
    casings: [],
    noises: [],
    corpses: [],

    time: 0,
    kills: 0,
    total: 0,
    state: 'play',
    exitOpen: false,
    alarm: 0,

    flow: null,
    flowTimer: 0,
    flowFrom: -1,

    fx: { shake: 0, hitstop: 0, flash: 0, punch: 0 },
    events: [],
  };

  for (const entity of level.entities) {
    const x = entity.x * TILE_SIZE + TILE_SIZE / 2;
    const y = entity.y * TILE_SIZE + TILE_SIZE / 2;

    if (entity.type === 0 || entity.type === 1) {
      world.enemies.push({
        kind: entity.type === 0 ? 'thug' : 'shooter',
        weapon: entity.type === 0 ? 'bat' : 'pistol',
        ammo: entity.type === 0 ? 0 : 6,
        x, y, vx: 0, vy: 0,
        home: { x, y },
        angle: (entity.angle || 0) * (Math.PI / 4),
        alive: true,
        downed: 0,
        state: 'idle',
        think: rand(0, 1.2),
        heard: null,
        suspicion: 0,
        windup: 0,
        cooldown: rand(0, 0.5),
        step: 0,
      });
      world.total += 1;
      continue;
    }

    if (entity.type === 3) world.pickups.push({ weapon: 'bat', x, y, angle: rand(0, 6.28), ammo: 0, vx: 0, vy: 0, spin: 0 });
    if (entity.type === 4) world.pickups.push({ weapon: 'pistol', x, y, angle: rand(0, 6.28), ammo: WEAPONS.pistol.clip, vx: 0, vy: 0, spin: 0 });
  }

  world.flow = buildFlowField(world, world.player.x, world.player.y);
  return world;
}


/* =========================================================
   ОРУЖИЕ
   ========================================================= */

function fireGun(world, shooter, from) {
  const weapon = WEAPONS[shooter.weapon];
  const angle = shooter.angle + rand(-weapon.spread, weapon.spread) * (from === 'enemy' ? 2.4 : 1);

  world.bullets.push({
    x: shooter.x + Math.cos(shooter.angle) * 14,
    y: shooter.y + Math.sin(shooter.angle) * 14,
    vx: Math.cos(angle) * weapon.speed,
    vy: Math.sin(angle) * weapon.speed,
    from,
    weapon: shooter.weapon,
    life: BULLET_LIFE,
  });

  shooter.ammo -= 1;
  shooter.cooldown = weapon.cooldown;
  shooter.flash = 0.06;

  world.casings.push({
    x: shooter.x, y: shooter.y,
    vx: Math.cos(angle - 1.6) * rand(50, 90),
    vy: Math.sin(angle - 1.6) * rand(50, 90),
    angle: rand(0, 6.28), spin: rand(-14, 14), life: 0.6,
  });

  spark(world, shooter.x + Math.cos(shooter.angle) * 16, shooter.y + Math.sin(shooter.angle) * 16,
    shooter.angle, 0.4, 6, '#ffe06b', 260);

  emitNoise(world, shooter.x, shooter.y, weapon.noise, from);
  world.fx.shake = Math.max(world.fx.shake, from === 'player' ? 3.5 : 2);
  world.events.push({ type: 'shot', from });
}

/*
 * Удар — не снаряд, а мгновенная проверка сектора. Так он честно
 * попадает по тому, кого игрок видел на экране в момент нажатия.
 */
/*
 * Единственное место, где ближний удар превращается в смерть. Через него
 * идут и мах игрока, и замах врага: иначе правила добивания и щитов
 * разъехались бы по двум веткам.
 */
function landMelee(world, attacker, target, angle, weapon, from) {
  if (target === world.player) {
    killPlayer(world, angle);
    return;
  }

  if (weapon.lethal || target.downed > 0) {
    killEnemy(world, target, angle, 'melee', {
      by: from,
      weapon: attacker.weapon,
      execution: target.downed > 0,
    });
  } else {
    knockDown(world, target, angle);
  }
}


/*
 * Мах игрока. Кончик оружия за кадр проходит отрезок; всё, что этот
 * отрезок задел на достаточной скорости, получает удар. Попадание съедает
 * инерцию — выкосить толпу одним взмахом нельзя, руку придётся разгонять
 * заново.
 */
function updateArm(world, dt, intent) {
  const player = world.player;
  const weapon = WEAPONS[player.weapon];
  const reach = weapon.kind === 'melee' ? weapon.reach : 20;

  const delta = angleDelta(player.arm, player.angle);
  player.armVel += (delta * ARM_FOLLOW - player.armVel * ARM_DRAG) * dt;
  player.arm += player.armVel * dt;

  const tip = {
    x: player.x + Math.cos(player.arm) * reach,
    y: player.y + Math.sin(player.arm) * reach,
  };
  const previous = player.tip || tip;
  player.tipSpeed = Math.hypot(tip.x - previous.x, tip.y - previous.y) / Math.max(dt, 0.0001);
  /* Режущая скорость — только от вращения: перенос тела не рубит. */
  player.swingSpeed = Math.abs(player.armVel) * reach;

  /* Кончик уткнулся в стену — мах гаснет об неё, и это слышно. */
  if (blocksMove(tileAt(world, tip.x, tip.y))) {
    if (Math.abs(player.armVel) > 6) {
      spark(world, tip.x, tip.y, player.arm + Math.PI, 1.2, 5, '#cfc3ff', 120);
      emitNoise(world, tip.x, tip.y, 130, 'player');
      world.events.push({ type: 'clang' });
      world.fx.shake = Math.max(world.fx.shake, 2.5);
    }
    player.armVel *= -0.25;
    player.arm = previous === tip ? player.arm : Math.atan2(previous.y - player.y, previous.x - player.x);
  }

  /*
   * Скачок кончика больше кадра реального маха — это не удар, а перенос
   * тела: перезапуск этажа, смена оружия, отладочная телепортация. Такой
   * кадр не бьёт никого, иначе игрок «убивает» тех, мимо кого его просто
   * переставили.
   */
  const teleported = Math.hypot(tip.x - previous.x, tip.y - previous.y) > 120;

  /*
   * Один мах — одно попадание в каждого. Оружие проходит сквозь цель и на
   * возврате задевает её снова, и без этого правила одно нажатие успевало
   * сбить кулаком и тут же добить лежачего: связка из двух решений
   * схлопывалась в одну кнопку.
   *
   * Мах считается новым, когда рука разогналась заново, — то есть после
   * того, как её скорость упала ниже боевой.
   */
  const fast = player.swingSpeed > KILL_SWING_SPEED;
  if (fast && !player.swinging) {
    player.swinging = true;
    player.swingId = (player.swingId || 0) + 1;
  } else if (!fast) {
    player.swinging = false;
  }

  if (!teleported && weapon.kind === 'melee' && fast) {
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      if (enemy.hitBy === player.swingId) continue;
      if (segmentDistance(enemy.x, enemy.y, previous.x, previous.y, tip.x, tip.y) > BODY + 3) continue;
      if (!hasSight(world, player.x, player.y, enemy.x, enemy.y)) continue;

      enemy.hitBy = player.swingId;

      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      landMelee(world, player, enemy, angle, weapon, 'player');

      /* Тело гасит мах: следующего надо разгонять заново. */
      player.armVel *= 0.45;
      player.swing = 0.16;
      player.swingHit = 0.2;
      world.fx.hitstop = Math.max(world.fx.hitstop, 0.08);
      world.fx.shake = Math.max(world.fx.shake, 7);
      world.fx.punch = 1;
      world.events.push({ type: 'impact', lethal: weapon.lethal, from: 'player' });
    }
  }

  player.tip = tip;

  /* Короткий след: по нему читается, разогнан мах или волочится. */
  player.trail = player.trail || [];
  player.trail.push({ x: tip.x, y: tip.y, speed: player.tipSpeed });
  if (player.trail.length > 7) player.trail.shift();
}

/* Расстояние от точки до отрезка — им и меряется, задел ли кончик тело. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  if (length < 0.0001) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / length;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}


function swingMelee(world, attacker, from) {
  const weapon = WEAPONS[attacker.weapon];
  attacker.cooldown = weapon.cooldown;
  attacker.swing = 0.16;
  emitNoise(world, attacker.x, attacker.y, weapon.noise, from);
  world.events.push({ type: 'swing', from, lethal: weapon.lethal });

  const candidates = from === 'player'
    ? world.enemies.filter((e) => e.alive)
    : [world.player].filter((p) => p.alive);

  attacker.swingHit = 0;

  /*
   * Взмах достаётся одному — ближайшему в секторе.
   *
   * Раньше он доставал всем сразу, и это поймал прогон: бита выносила
   * троих за один кадр, а очередь демонов, стоящая почти секунду
   * уязвимости, оказывалась строго хуже бесплатного удара. Толпа обязана
   * быть проблемой, которую решают чем-то другим, — иначе это «другое»
   * незачем набирать.
   */
  let target = null;
  let best = Infinity;

  for (const candidate of candidates) {
    const dist = Math.hypot(candidate.x - attacker.x, candidate.y - attacker.y);
    if (dist > weapon.reach + BODY || dist >= best) continue;
    const toTarget = Math.atan2(candidate.y - attacker.y, candidate.x - attacker.x);
    if (Math.abs(angleDelta(attacker.angle, toTarget)) > weapon.arc / 2) continue;
    if (!hasSight(world, attacker.x, attacker.y, candidate.x, candidate.y)) continue;
    best = dist;
    target = candidate;
  }

  const connected = Boolean(target);

  if (target) {
    const toTarget = Math.atan2(target.y - attacker.y, target.x - attacker.x);

    landMelee(world, attacker, target, toTarget, weapon, from);
  }

  /*
   * Попадание должно ощущаться иначе, чем промах, — и не одним звуком.
   * Кадр замирает, экран вздрагивает, камера коротко наезжает, а дуга
   * удара наливается белым. Промах не делает ничего из этого.
   */
  if (connected) {
    world.fx.hitstop = Math.max(world.fx.hitstop, 0.08);
    world.fx.shake = Math.max(world.fx.shake, 7);
    world.fx.punch = 1;
    attacker.swingHit = 0.2;
    world.events.push({ type: 'impact', lethal: weapon.lethal, from });
  }
}

export function knockDown(world, enemy, angle) {
  enemy.downed = DOWN_TIME;
  enemy.state = 'down';
  enemy.vx += Math.cos(angle) * 260;
  enemy.vy += Math.sin(angle) * 260;
  enemy.hitFlash = 0.16;
  spark(world, enemy.x, enemy.y, angle, 1.2, 9, '#ffffff', 150);
  pop(world, enemy.x, enemy.y, 14, '255,255,255');
  world.events.push({ type: 'knock' });
}

export function killEnemy(world, enemy, angle, cause, source = {}) {
  if (!enemy.alive) return;
  enemy.alive = false;
  world.kills += 1;

  bleed(world, enemy.x, enemy.y, angle, cause === 'bullet' ? 260 : 190);
  pop(world, enemy.x, enemy.y, 16, '255,20,80');

  world.corpses.push({
    x: enemy.x + Math.cos(angle) * 6,
    y: enemy.y + Math.sin(angle) * 6,
    angle: enemy.angle,
    kind: enemy.kind,
    twitch: 0.5,
  });

  /* Оружие остаётся на полу — из него и собирается следующая минута. */
  if (enemy.weapon) {
    world.pickups.push({
      weapon: enemy.weapon,
      ammo: enemy.ammo,
      x: enemy.x + Math.cos(angle) * 12,
      y: enemy.y + Math.sin(angle) * 12,
      angle: rand(0, 6.28), vx: 0, vy: 0, spin: 0,
    });
  }

  world.fx.hitstop = Math.max(world.fx.hitstop, 0.045);
  world.fx.flash = Math.max(world.fx.flash, 0.25);

  /*
   * Событие несёт не только факт смерти: счёту нужно знать, чьих это рук
   * дело, чем ударили и добивали ли лежачего. Считать это задним числом
   * по состоянию мира уже нельзя — тела к тому моменту одинаковы.
   */
  world.events.push({
    type: 'kill',
    cause,
    by: source.by || 'player',
    weapon: source.weapon || null,
    execution: Boolean(source.execution),
  });

  if (world.kills >= world.total && !world.exitOpen) {
    world.exitOpen = true;
    world.events.push({ type: 'cleared' });
  }
}

export function killPlayer(world, angle) {
  const player = world.player;
  if (!player.alive || world.state !== 'play') return;
  player.alive = false;
  world.state = 'dead';
  bleed(world, player.x, player.y, angle, 240);
  world.fx.hitstop = Math.max(world.fx.hitstop, 0.16);
  world.fx.shake = 11;
  world.events.push({ type: 'death' });
}


/* =========================================================
   ПОДОБРАТЬ И БРОСИТЬ
   ========================================================= */

function tryPickup(world) {
  const player = world.player;
  let best = null;
  let bestDist = 34;

  for (const pickup of world.pickups) {
    if (pickup.flying) continue;
    const dist = Math.hypot(pickup.x - player.x, pickup.y - player.y);
    if (dist < bestDist) { best = pickup; bestDist = dist; }
  }

  if (!best) return;

  const carried = player.weapon;
  const carriedAmmo = player.ammo;

  player.weapon = best.weapon;
  player.ammo = best.ammo;
  world.pickups.splice(world.pickups.indexOf(best), 1);
  world.events.push({ type: 'pickup' });

  if (carried !== 'fists') {
    world.pickups.push({
      weapon: carried, ammo: carriedAmmo,
      x: player.x, y: player.y, angle: rand(0, 6.28), vx: 0, vy: 0, spin: 0,
    });
  }
}

/*
 * Брошенное оружие сбивает с ног, но не убивает. Это выход из положения,
 * когда патроны кончились, а не второй пистолет.
 */
function tryThrow(world) {
  const player = world.player;
  if (player.weapon === 'fists') return;

  world.pickups.push({
    weapon: player.weapon,
    ammo: player.ammo,
    x: player.x + Math.cos(player.angle) * 12,
    y: player.y + Math.sin(player.angle) * 12,
    vx: Math.cos(player.angle) * 560,
    vy: Math.sin(player.angle) * 560,
    angle: player.angle,
    spin: 22,
    flying: true,
  });

  player.weapon = 'fists';
  player.ammo = 0;
  world.events.push({ type: 'throw' });
}


/* =========================================================
   ШАГ МИРА
   ========================================================= */

export function update(world, dt, intent) {
  world.events.length = 0;

  /* Стоп-кадр в момент удара: он и делает попадание «мясным». */
  if (world.fx.hitstop > 0) {
    world.fx.hitstop -= dt;
    dt = Math.min(dt, 0.004);
  }

  world.fx.shake = Math.max(0, world.fx.shake - dt * 26);
  world.fx.flash = Math.max(0, world.fx.flash - dt * 3.2);
  world.fx.punch = Math.max(0, world.fx.punch - dt * 4);

  if (world.state === 'play') world.time += dt;

  updatePlayer(world, dt, intent);

  world.flowTimer -= dt;
  const playerCell = tileIndex(world, world.player.x, world.player.y);
  if (world.flowTimer <= 0 || playerCell !== world.flowFrom) {
    world.flow = buildFlowField(world, world.player.x, world.player.y);
    world.flowFrom = playerCell;
    world.flowTimer = 0.2;
  }

  for (const enemy of world.enemies) updateEnemy(world, enemy, dt);

  updateBullets(world, dt);
  updateLoose(world, dt);

  for (const noise of world.noises) noise.life -= dt;
  world.noises = world.noises.filter((n) => n.life > 0);

  for (const corpse of world.corpses) corpse.twitch = Math.max(0, corpse.twitch - dt);

  if (world.decals.length > 420) world.decals.splice(0, world.decals.length - 420);
}


function updatePlayer(world, dt, intent) {
  const player = world.player;
  if (!player.alive) return;

  const wish = Math.hypot(intent.moveX, intent.moveY);
  const targetX = wish > 0.001 ? (intent.moveX / Math.max(1, wish)) * PLAYER_SPEED : 0;
  const targetY = wish > 0.001 ? (intent.moveY / Math.max(1, wish)) * PLAYER_SPEED : 0;

  player.vx += clamp(targetX - player.vx, -PLAYER_ACCEL * dt, PLAYER_ACCEL * dt);
  player.vy += clamp(targetY - player.vy, -PLAYER_ACCEL * dt, PLAYER_ACCEL * dt);

  moveBody(world, player, player.vx * dt, player.vy * dt);

  player.step += Math.hypot(player.vx, player.vy) * dt;
  if (player.step > 26) {
    player.step = 0;
    emitNoise(world, player.x, player.y, 58, 'player');
    world.events.push({ type: 'step' });
  }

  if (intent.aimAngle !== null && intent.aimAngle !== undefined) {
    player.angle = intent.aimAngle;
  } else if (wish > 0.1) {
    player.angle = turnToward(player.angle, Math.atan2(player.vy, player.vx), dt * 14);
  }

  player.cooldown = Math.max(0, player.cooldown - dt);
  player.swing = Math.max(0, player.swing - dt);
  player.swingHit = Math.max(0, (player.swingHit || 0) - dt);
  player.flash = Math.max(0, (player.flash || 0) - dt);

  if (intent.pickup) tryPickup(world);
  if (intent.throw) tryThrow(world);

  if (intent.attack && player.cooldown <= 0) {
    const weapon = WEAPONS[player.weapon];
    if (weapon.kind === 'gun') {
      if (player.ammo > 0) {
        fireGun(world, player, 'player');
        world.fx.punch = 1;
      } else {
        player.cooldown = 0.25;
        world.events.push({ type: 'dry' });
      }
    } else {
      /*
       * Кнопка не наносит удар сама — она бросает в руку рывок. Дальше
       * решает физика: разогнанный кончик убивает, вялый тычок нет. Так
       * нажатие и разворот корпуса — одно и то же действие, а не два
       * разных способа бить.
       */
      player.side = -player.side;

      /*
       * Замах и пронос. Раньше рывок уводил оружие в сторону от цели, и
       * стоящий прямо перед носом враг оставался жив до обратного маха.
       * Теперь рука сначала отводится назад, а мах идёт сквозь прицел —
       * то есть ровно туда, куда смотрит игрок.
       */
      player.arm = player.angle - player.side * SWING_WINDUP;
      player.armVel = player.side * SWING_IMPULSE;
      player.tip = {
        x: player.x + Math.cos(player.arm) * (WEAPONS[player.weapon].reach || 20),
        y: player.y + Math.sin(player.arm) * (WEAPONS[player.weapon].reach || 20),
      };
      player.cooldown = weapon.cooldown;
      player.swing = 0.16;
      emitNoise(world, player.x, player.y, weapon.noise, 'player');
      world.events.push({ type: 'swing', from: 'player', lethal: weapon.lethal });
    }
  }

  updateArm(world, dt, intent);

  /* Выход открыт — стоя на нём, этаж считается сданным. */
  if (world.exitOpen && world.state === 'play' && tileAt(world, player.x, player.y) === TILE.EXIT) {
    world.state = 'clear';
    world.events.push({ type: 'exit' });
  }
}


function updateEnemy(world, enemy, dt) {
  if (!enemy.alive) {
    enemy.vx *= 0.8;
    enemy.vy *= 0.8;
    return;
  }

  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  enemy.swing = Math.max(0, (enemy.swing || 0) - dt);
  enemy.flash = Math.max(0, (enemy.flash || 0) - dt);
  enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt);

  if (enemy.downed > 0) {
    enemy.downed -= dt;
    enemy.vx *= 0.86;
    enemy.vy *= 0.86;
    moveBody(world, enemy, enemy.vx * dt, enemy.vy * dt);
    if (enemy.downed <= 0) {
      enemy.state = 'alert';
      enemy.heard = { x: world.player.x, y: world.player.y };
    }
    return;
  }

  const move = thinkEnemy(world, enemy, dt, { walk: ENEMY_WALK, run: ENEMY_RUN });

  enemy.vx = lerp(enemy.vx, move.vx, clamp(dt * 9, 0, 1));
  enemy.vy = lerp(enemy.vy, move.vy, clamp(dt * 9, 0, 1));
  moveBody(world, enemy, enemy.vx * dt, enemy.vy * dt);

  /* Тела расталкиваются, иначе толпа слипается в одну точку. */
  for (const other of world.enemies) {
    if (other === enemy || !other.alive) continue;
    const dx = other.x - enemy.x;
    const dy = other.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01 && dist < BODY * 2) {
      const push = (BODY * 2 - dist) * 0.5;
      moveBody(world, enemy, (-dx / dist) * push, (-dy / dist) * push);
    }
  }

  if (move.attack) {
    const weapon = WEAPONS[enemy.weapon];
    if (weapon.kind === 'gun' && enemy.ammo > 0) fireGun(world, enemy, 'enemy');
    else if (weapon.kind === 'melee') swingMelee(world, enemy, 'enemy');
  }

  enemy.step += Math.hypot(enemy.vx, enemy.vy) * dt;
  if (enemy.step > 30) { enemy.step = 0; world.events.push({ type: 'enemystep', x: enemy.x, y: enemy.y }); }
}


function updateBullets(world, dt) {
  for (const bullet of world.bullets) {
    const steps = Math.max(1, Math.ceil(Math.hypot(bullet.vx, bullet.vy) * dt / 6));
    const sx = (bullet.vx * dt) / steps;
    const sy = (bullet.vy * dt) / steps;

    for (let i = 0; i < steps && bullet.life > 0; i += 1) {
      bullet.x += sx;
      bullet.y += sy;

      const tile = tileAt(world, bullet.x, bullet.y);

      if (breakable(tile)) {
        world.tiles[tileIndex(world, bullet.x, bullet.y)] = TILE.FLOOR;
        spark(world, bullet.x, bullet.y, Math.atan2(sy, sx), 2.2, 14, '#9be7ff', 200);
        emitNoise(world, bullet.x, bullet.y, 300, 'glass');
        world.fx.shake = Math.max(world.fx.shake, 3);
        world.events.push({ type: 'glass' });
        /* Витрина запечена в статический слой — его придётся собрать заново. */
        world.rebake = true;
        continue;
      }

      if (blocksShot(tile)) {
        spark(world, bullet.x, bullet.y, Math.atan2(-sy, -sx), 1.1, 5, '#ffe06b', 150);
        pop(world, bullet.x, bullet.y, 5, '255,224,107');
        bullet.life = 0;
        break;
      }

      const angle = Math.atan2(sy, sx);

      if (bullet.from === 'player') {
        for (const enemy of world.enemies) {
          if (!enemy.alive) continue;
          if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < BODY + 1) {
            killEnemy(world, enemy, angle, 'bullet', { by: 'player', weapon: bullet.weapon });
            bullet.life = 0;
            break;
          }
        }
      } else {
        const player = world.player;
        if (player.alive && Math.hypot(player.x - bullet.x, player.y - bullet.y) < BODY + 1) {
          killPlayer(world, angle);
          bullet.life = 0;
        }
        /* Своих тоже задевает: чужая пуля в спину товарища — честный трофей. */
        for (const enemy of world.enemies) {
          if (!enemy.alive || bullet.life <= 0) continue;
          if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < BODY + 1) {
            killEnemy(world, enemy, angle, 'bullet', { by: 'enemy', weapon: bullet.weapon });
            bullet.life = 0;
          }
        }
      }
    }

    bullet.life -= dt;
  }

  world.bullets = world.bullets.filter((b) => b.life > 0);
}


function updateLoose(world, dt) {
  for (const pickup of world.pickups) {
    if (!pickup.flying) continue;

    const nx = pickup.x + pickup.vx * dt;
    const ny = pickup.y + pickup.vy * dt;

    if (blocksMove(tileAt(world, nx, ny))) {
      pickup.flying = false;
      pickup.vx = 0;
      pickup.vy = 0;
      pickup.spin = 0;
      spark(world, pickup.x, pickup.y, Math.atan2(-pickup.vy, -pickup.vx), 1, 4, '#cfc3ff', 90);
      emitNoise(world, pickup.x, pickup.y, 200, 'throw');
      continue;
    }

    pickup.x = nx;
    pickup.y = ny;
    pickup.angle += pickup.spin * dt;

    for (const enemy of world.enemies) {
      if (!enemy.alive || enemy.downed > 0) continue;
      if (Math.hypot(enemy.x - pickup.x, enemy.y - pickup.y) < BODY + 6) {
        knockDown(world, enemy, Math.atan2(pickup.vy, pickup.vx));
        world.events.push({ type: 'thrown-hit' });
        world.fx.hitstop = Math.max(world.fx.hitstop, 0.06);
        world.fx.shake = Math.max(world.fx.shake, 4);
        pickup.flying = false;
        pickup.vx = 0;
        pickup.vy = 0;
        pickup.spin = 0;
        break;
      }
    }

    pickup.vx *= 0.995;
    pickup.vy *= 0.995;
    if (Math.hypot(pickup.vx, pickup.vy) < 60) pickup.flying = false;
  }

  for (const ring of world.pops) ring.life -= dt;
  world.pops = world.pops.filter((ring) => ring.life > 0);

  for (const particle of world.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.9;
    particle.vy *= 0.9;
    particle.life -= dt;
    if (particle.wet && particle.life <= 0 && !blocksMove(tileAt(world, particle.x, particle.y))) {
      world.decals.push({ x: particle.x, y: particle.y, r: rand(1.5, 3.5), a: rand(0.25, 0.5) });
    }
  }
  world.particles = world.particles.filter((p) => p.life > 0);

  for (const casing of world.casings) {
    casing.x += casing.vx * dt;
    casing.y += casing.vy * dt;
    casing.vx *= 0.87;
    casing.vy *= 0.87;
    casing.angle += casing.spin * dt;
    casing.life -= dt;
  }
  world.casings = world.casings.filter((c) => c.life > 0);
}
