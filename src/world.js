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

/*
 * Рукопашная — отдельная игра внутри игры.
 *
 * Пока в руках ничего нет, драка идёт на три приёма по кругу: рука бьёт
 * ногу, нога ломает бросок, бросок ловит руку. Одинаковые приёмы гасят
 * друг друга — никто не получает ничего, и оба отскакивают.
 *
 * Смысл в том, что безоружная драка длинная (три попадания), а найденное
 * оружие возвращает игре её главное правило: один удар — один труп.
 * Поэтому первые двое стоят между игроком и первой битой, а не наоборот.
 */
/*
 * У каждого приёма своё время.
 *
 * startup — сколько идёт замах, прежде чем удар состоится. Это и есть
 * главная разница между приёмами: рука почти мгновенна, нога заметно
 * медленнее, бросок приходится начинать заранее — и всё это время твой
 * приём висит на виду и может быть перебит.
 *
 * recovery — сколько рука занята после. Чем медленнее приём, тем дороже
 * стоит ошибка, и поэтому круг остаётся честным: сильный приём не бывает
 * ещё и быстрым.
 */
export const MOVES = {
  hand: {
    id: 'hand', name: 'РУКА', short: 'Р', beats: 'kick',
    reach: 30, arc: 1.9, startup: 0.07, recovery: 0.2, damage: 1, colour: '#ffe06b',
  },
  kick: {
    id: 'kick', name: 'НОГА', short: 'Н', beats: 'grab',
    reach: 38, arc: 1.5, startup: 0.2, recovery: 0.32, damage: 2, colour: '#76ff9f',
  },
  grab: {
    id: 'grab', name: 'БРОСОК', short: 'Б', beats: 'hand',
    reach: 26, arc: 1.2, startup: 0.28, recovery: 0.3, damage: 1, floors: true, colour: '#ff2d95',
  },
};

/*
 * Круг «камень-ножницы-бумага» остался в коде, но обычных врагов он больше
 * не касается.
 *
 * На живой партии выяснилось простое: в общей свалке размен нечитаем.
 * Игрок не понимает, почему удар прошёл сквозь противника, и перестаёт
 * различать собственные приёмы. Механика хорошая, но она про дуэль один на
 * один, а не про зачистку этажа.
 *
 * Поэтому круг включается только там, где оба бойца помечены как дуэлянты
 * (enemy.duel) — это задел под боссов, где камера и темп будут другими.
 * Обычная драка стала простой: рука бьёт дважды, нога — один раз, бросок
 * валит на пол, оружие убивает с одного касания.
 */

/*
 * Медленное обязано быть сильным, иначе быстрое побеждает всегда.
 *
 * Первый вариант давал всем приёмам по одному попаданию, и прогон сразу
 * показал вырождение: та же рука выигрывала 38 боёв из 40 просто потому,
 * что успевала первой. Теперь нога снимает сразу два деления, а бросок
 * кладёт на пол — и это дороже урона, потому что лежачего добивают чем
 * угодно.
 */

export const MOVE_ORDER = ['hand', 'kick', 'grab'];

/* Сколько попаданий держит безоружный — и игрок, и противник. */
export const BARE_HP = 2;

/*
 * Доля.
 *
 * Музыка в этой игре не фон, а метроном: 108 ударов в минуту, кик на
 * каждой доле. Если бить в долю, удар выходит вдвое сильнее — безоружного
 * кладёт с одного касания, а откат укорачивается, и следующий удар
 * успевает в следующую долю. Так игрок, попавший в такт, идёт по этажу
 * не останавливаясь; сбившийся дерётся как раньше.
 *
 * Метроном идёт и с выключенным звуком: правило не должно зависеть от
 * того, слышно музыку или нет. Пока доли приходят из аудио, считаем от
 * последней; замолчали — считаем от нуля мира по тому же периоду.
 */
export const BEAT_PERIOD = 60 / 108;
export const BEAT_WINDOW = 0.13;
export const BEAT_COOLDOWN = 0.6;

export function beatNow(world) {
  world.fx.beat = 1;
  world.beatAt = world.time;
}

/* Сколько секунд до ближайшей доли — в любую сторону. */
export function beatOff(world) {
  const heard = world.beatAt !== undefined && world.time - world.beatAt < BEAT_PERIOD * 3;
  const since = heard ? world.time - world.beatAt : world.time;
  const phase = ((since % BEAT_PERIOD) + BEAT_PERIOD) % BEAT_PERIOD;
  return Math.min(phase, BEAT_PERIOD - phase);
}

export function inRhythm(world) {
  return beatOff(world) <= BEAT_WINDOW;
}

export const WEAPONS = {
  fists: {
    id: 'fists', name: 'КУЛАКИ', kind: 'melee',
    reach: 29, arc: 1.9, cooldown: 0.15, lethal: false, noise: 70,
  },
  bat: {
    id: 'bat', name: 'БИТА', kind: 'melee',
    reach: 40, arc: 2.0, cooldown: 0.18, lethal: true, noise: 110,
  },
  pistol: {
    id: 'pistol', name: 'ПИСТОЛЕТ', kind: 'gun',
    cooldown: 0.16, clip: 12, speed: 900, spread: 0.03, noise: 460,
  },
};

/*
 * Темп. Игра про то, что всё решается за секунду, поэтому разгон
 * мгновенный: между нажатием и движением не должно быть ничего, что
 * чувствуется. Скорость и откат удара выставлены под жанр — бежишь
 * быстро, бьёшь сразу, ошибаешься один раз.
 *
 * Физику маха здесь пробовали и убрали: оружие с инерцией красиво
 * выглядит, но заставляет ждать, пока рука дойдёт до цели, а вся игра
 * держится на том, что между решением и трупом нет паузы.
 */
const PLAYER_SPEED = 290;
const PLAYER_ACCEL = 4600;
const ENEMY_WALK = 76;
const ENEMY_RUN = 168;
const DOWN_TIME = 1.7;
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
      hp: BARE_HP,
      move: null,        /* приём, который сейчас идёт */
      moveStart: 0,      /* сколько осталось до попадания */
      moveLeft: 0,
      swing: 0,
      step: 0,
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

    fx: { shake: 0, hitstop: 0, flash: 0, punch: 0, beat: 0 },
    events: [],
  };

  for (const entity of level.entities) {
    const x = entity.x * TILE_SIZE + TILE_SIZE / 2;
    const y = entity.y * TILE_SIZE + TILE_SIZE / 2;

    if (entity.type === 0 || entity.type === 1 || entity.type === 10) {
      world.enemies.push({
        kind: entity.type === 10 ? 'brawler' : entity.type === 0 ? 'thug' : 'shooter',
        weapon: entity.type === 10 ? null : entity.type === 0 ? 'bat' : 'pistol',
        ammo: entity.type === 0 || entity.type === 10 ? 0 : 6,
        hp: BARE_HP,
        move: null,
        moveStart: 0,
        moveLeft: 0,
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
 * Удар со спины.
 *
 * Тот, кто не знает про игрока и стоит к нему спиной, умирает от чего
 * угодно — даже от кулака, который иначе только сбивает с ног. И умирает
 * тихо: шум такого удара почти не расходится, поэтому этаж можно
 * разбирать по одному, пока никто не обернулся.
 *
 * Это второй темп внутри той же игры: красться и срываться в резню —
 * разные скорости, и выбирать между ними должен игрок, а не уровень.
 */
export function fromBehind(world, attacker, target) {
  if (!target || target === world.player || !target.alive) return false;
  if (target.downed > 0 || target.state === 'chase') return false;

  const toAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
  return Math.abs(angleDelta(target.angle, toAttacker)) > 1.9;
}


/* Готово ли убийство со спины прямо сейчас — для метки на экране. */
export function backstabReady(world, enemy) {
  const player = world.player;
  if (!player.alive || !enemy.alive) return false;

  const weapon = WEAPONS[player.weapon];
  if (weapon.kind !== 'melee') return false;

  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  if (Math.hypot(dx, dy) > weapon.reach + BODY) return false;
  if (Math.abs(angleDelta(player.angle, Math.atan2(dy, dx))) > weapon.arc / 2) return false;
  if (!hasSight(world, player.x, player.y, enemy.x, enemy.y)) return false;

  return fromBehind(world, player, enemy);
}


/*
 * Рукопашный размен.
 *
 * Оба приёма встречаются в воздухе: одинаковые гасятся, разные решает
 * круг. Проигравший получает одно попадание из трёх и на треть секунды
 * выключается — этого хватает, чтобы добавить второе, но не хватает,
 * чтобы забить безнаказанно.
 */
function bareStrike(world, attacker, target, move, from) {
  /*
   * Отбить может только тот, кто сам сейчас замахивается.
   *
   * Пока «живым» считался любой недавний приём, длинный бросок работал
   * ещё и щитом: прогон показал, что «всегда бросок» выигрывает 40 боёв
   * из 40. Приём защищает ровно столько, сколько длится его замах, — и
   * тогда медленный приём остаётся сильным, но перестаёт быть бесплатным.
   */
  const defence = target.duel && attacker.duel
    ? (target.moveStart > 0 ? target.move : (target.guard || null))
    : null;
  const away = Math.atan2(target.y - attacker.y, target.x - attacker.x);
  const between = { x: (attacker.x + target.x) / 2, y: (attacker.y + target.y) / 2 };

  if (defence && defence === move.id) {
    /* Приём в приём: обоих отбрасывает, никто ничего не получает. */
    attacker.vx -= Math.cos(away) * 210;
    attacker.vy -= Math.sin(away) * 210;
    target.vx += Math.cos(away) * 210;
    target.vy += Math.sin(away) * 210;
    target.move = null;
    target.guardLeft = 0;
    attacker.move = null;
    attacker.cooldown = Math.max(attacker.cooldown, 0.22);

    pop(world, between.x, between.y, 16, '255,255,255');
    spark(world, between.x, between.y, away, 2.4, 10, '#ffffff', 170);
    world.fx.shake = Math.max(world.fx.shake, 5);
    world.fx.hitstop = Math.max(world.fx.hitstop, 0.05);
    world.events.push({ type: 'clash', move: move.id, x: between.x, y: between.y });
    return;
  }

  if (defence && MOVES[defence] && MOVES[defence].beats === move.id) {
    /*
     * Приём перебит.
     *
     * Раньше здесь прилетало нападавшему, и это читалось как несправедливость:
     * я ударил — а получил я же. Теперь удар просто гасится: атака пропала,
     * рука занята треть секунды, и этого хватает, чтобы противник успел
     * ответить по-настоящему. Наказание есть, но оно за темп, а не вместо
     * собственного удара.
     */
    attacker.move = null;
    attacker.cooldown = Math.max(attacker.cooldown, 0.34);
    target.guardLeft = 0;
    attacker.vx -= Math.cos(away) * 120;
    attacker.vy -= Math.sin(away) * 120;

    pop(world, between.x, between.y, 14, '255,224,107');
    spark(world, between.x, between.y, away + Math.PI, 1.6, 7, MOVES[defence].colour, 150);
    world.fx.shake = Math.max(world.fx.shake, 3.5);
    world.events.push({ type: 'parry', move: defence, by: from === 'player' ? 'enemy' : 'player' });
    return;
  }

  damageBare(world, target, attacker, move, from);
}


function damageBare(world, victim, striker, move, from) {
  const angle = Math.atan2(victim.y - striker.y, victim.x - striker.x);

  /*
   * Бьющий в долю бьёт первым.
   *
   * Без этого правила ритм не окупался: ждать долю значит не бить, а
   * дуэли выигрывал тот, кто молотит без остановки — 12 из 12 в прогоне
   * против 10 у играющего по музыке. Сила удара этого не перевешивала:
   * за период бьющий как попало успевает дважды и набирает те же два
   * очка урона, что и один удар в долю.
   *
   * Поэтому доля даёт не только силу, но и право первого удара: пока
   * идёт замах, начатый в долю, чужой кулак не доходит. От пули это не
   * спасает — иначе ритм превращался бы в неуязвимость.
   */
  if (victim.onBeat && victim.swing > 0) {
    pop(world, victim.x, victim.y, 10, '118,255,159');
    world.events.push({ type: 'beatpass', from });
    return;
  }

  const beat = !!striker.onBeat;
  victim.hp = (victim.hp === undefined ? BARE_HP : victim.hp) - (beat ? BARE_HP : (move.damage || 1));
  victim.move = null;
  victim.moveLeft = 0;
  victim.hitFlash = 0.14;
  victim.vx += Math.cos(angle) * 130;
  victim.vy += Math.sin(angle) * 130;

  /*
   * Отметка попадания. Её ставило только оружие, а рукопашная — нет,
   * поэтому дуга удара кулаком всегда рисовалась как промах: тонкая
   * линия вместо белого сектора. Отсюда и «непонятно, как мы дерёмся» —
   * игра показывала промах на каждом попадании.
   */
  striker.swingHit = 0.2;
  striker.beatHit = beat ? 0.2 : 0;

  world.fx.hitstop = Math.max(world.fx.hitstop, beat ? 0.08 : 0.05);
  world.fx.shake = Math.max(world.fx.shake, beat ? 9 : 6);
  world.events.push({ type: 'bare', move: move.id, from, left: victim.hp, beat });

  if (victim === world.player) {
    if (victim.hp <= 0) killPlayer(world, angle);
    else victim.cooldown = Math.max(victim.cooldown, 0.3);
    return;
  }

  if (victim.hp <= 0) {
    killEnemy(world, victim, angle, 'bare', { by: from, weapon: 'bare', beat });
    return;
  }

  /* Бросок валит на пол: лежачего добивают чем угодно, и это решает бой. */
  if (move.floors) {
    knockDown(world, victim, angle);
    return;
  }

  victim.stagger = 0.32;
  pop(world, victim.x, victim.y, 12, '255,255,255');
}


/*
 * Безоружный приём. Живёт короткое окно после нажатия: за это время в
 * него может прилететь чужой приём — так и получается размен, а не обмен
 * очередями. Против вооружённого работает по старым правилам: кулак
 * сбивает с ног, удар со спины убивает.
 */
function bareAttack(world, attacker, moveId, from) {
  const move = MOVES[moveId] || MOVES.hand;

  /*
   * Нажатие только начинает приём. Удар случится через startup — и всё
   * это время приём виден противнику и может быть перебит. Отсюда и
   * разница характеров: рукой отвечают, ногой наказывают, бросок
   * приходится заказывать заранее.
   */
  /* В долю попадает нажатие, а не попадание: игрок стучит по музыке, а
     не подгадывает момент, когда кулак долетит. */
  attacker.onBeat = from === 'player' && inRhythm(world);

  attacker.move = move.id;
  attacker.moveStart = move.startup;
  attacker.moveLeft = move.startup + 0.16;
  attacker.moveFrom = from;
  attacker.cooldown = (move.startup + move.recovery) * (attacker.onBeat ? BEAT_COOLDOWN : 1);
  world.events.push({ type: 'wind', move: move.id, from, beat: attacker.onBeat });
}


/* Момент, когда замах превращается в удар. */
function resolveBare(world, attacker, from) {
  const move = MOVES[attacker.move];
  if (!move) return;

  attacker.swing = 0.16;

  const candidates = from === 'player'
    ? world.enemies.filter((e) => e.alive)
    : [world.player].filter((p) => p.alive);

  let target = null;
  let best = Infinity;

  for (const candidate of candidates) {
    const dist = Math.hypot(candidate.x - attacker.x, candidate.y - attacker.y);
    if (dist > move.reach + BODY || dist >= best) continue;
    const toTarget = Math.atan2(candidate.y - attacker.y, candidate.x - attacker.x);
    if (Math.abs(angleDelta(attacker.angle, toTarget)) > move.arc / 2) continue;
    if (!hasSight(world, attacker.x, attacker.y, candidate.x, candidate.y)) continue;
    best = dist;
    target = candidate;
  }

  const silent = from === 'player' && fromBehind(world, attacker, target);
  emitNoise(world, attacker.x, attacker.y, silent ? 50 : 75, from);
  world.events.push({ type: 'move', move: move.id, from, silent });

  if (!target) return;

  const toTarget = Math.atan2(target.y - attacker.y, target.x - attacker.x);

  /* Со спины — сразу насмерть, безоружный он или нет. */
  if (silent) {
    killEnemy(world, target, toTarget, 'backstab',
      { by: from, weapon: 'bare', silent: true });
    world.fx.hitstop = Math.max(world.fx.hitstop, 0.05);
    return;
  }

  /* Вооружённого голыми руками не размениваешь — только сбиваешь с ног. */
  const armed = target !== world.player && Boolean(target.weapon);
  if (armed || (target === world.player && WEAPONS[target.weapon] && WEAPONS[target.weapon].lethal)) {
    if (target === world.player) killPlayer(world, toTarget);
    else if (target.downed > 0) {
      killEnemy(world, target, toTarget, 'melee', { by: from, weapon: 'bare', execution: true });
    } else {
      knockDown(world, target, toTarget);
    }
    world.fx.hitstop = Math.max(world.fx.hitstop, 0.05);
    world.fx.shake = Math.max(world.fx.shake, 6);
    return;
  }

  bareStrike(world, attacker, target, move, from);
}


/* Отсчёт замаха: общий для игрока и для врага. */
function tickMove(world, ent, dt, from) {
  if (ent.moveStart > 0) {
    ent.moveStart -= dt;
    if (ent.moveStart <= 0) {
      ent.moveStart = 0;
      resolveBare(world, ent, from);
    }
  }

  ent.moveLeft = Math.max(0, (ent.moveLeft || 0) - dt);
  if (ent.moveLeft <= 0 && ent.moveStart <= 0) ent.move = null;
}


function swingMelee(world, attacker, from) {
  const weapon = WEAPONS[attacker.weapon];
  /* Оружие и так убивает с касания, поэтому доля даёт не силу, а темп:
     замахнувшийся по музыке успевает к следующей доле. */
  attacker.onBeat = from === 'player' && inRhythm(world);
  attacker.cooldown = weapon.cooldown * (attacker.onBeat ? BEAT_COOLDOWN : 1);
  attacker.swing = 0.16;

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
  const silent = from === 'player' && fromBehind(world, attacker, target);

  /*
   * Шум зависит от того, вышло ли тихо. Тихий удар почти не расходится —
   * на этом и держится вторая скорость игры.
   */
  emitNoise(world, attacker.x, attacker.y, silent ? 55 : weapon.noise, from);
  world.events.push({ type: 'swing', from, lethal: weapon.lethal, silent });

  if (target) {
    const toTarget = Math.atan2(target.y - attacker.y, target.x - attacker.x);

    if (target === world.player) {
      killPlayer(world, toTarget);
    } else if (silent || weapon.lethal || target.downed > 0) {
      /* Со спины и лежачего добивают даже кулаком. */
      killEnemy(world, target, toTarget, silent ? 'backstab' : 'melee', {
        by: from,
        weapon: attacker.weapon,
        execution: target.downed > 0,
        silent,
        beat: Boolean(attacker.onBeat),
      });
    } else {
      knockDown(world, target, toTarget);
    }
  }

  /*
   * Попадание должно ощущаться иначе, чем промах, — и не одним звуком.
   * Кадр замирает, экран вздрагивает, камера коротко наезжает, а дуга
   * удара наливается белым. Промах не делает ничего из этого.
   */
  if (connected) {
    world.fx.hitstop = Math.max(world.fx.hitstop, 0.05);
    world.fx.shake = Math.max(world.fx.shake, 7);
    world.fx.punch = 1;
    attacker.swingHit = 0.2;
    world.events.push({ type: 'impact', lethal: weapon.lethal, from });
  }
}

export function knockDown(world, enemy, angle) {
  enemy.downed = DOWN_TIME;
  enemy.downedFor = DOWN_TIME;
  /* Падает по направлению удара — по этой оси его и будет видно лежащим. */
  enemy.prone = angle;
  enemy.state = 'down';
  /*
   * Отбрасывает несильно: сбитый должен оставаться под ногами, иначе
   * связка «сбил — добил» превращается в догонялки, а игра обещает
   * обратное — что всё решается на месте и мгновенно.
   */
  enemy.vx += Math.cos(angle) * 150;
  enemy.vy += Math.sin(angle) * 150;
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

  world.fx.hitstop = Math.max(world.fx.hitstop, 0.035);
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
    silent: Boolean(source.silent),
    beat: Boolean(source.beat),
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
  world.fx.hitstop = Math.max(world.fx.hitstop, 0.14);
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
  /* С железом в руках правила снова простые: один удар — один труп. */
  player.move = null;
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
  /*
   * Пульс доли. Пока музыка играет, доли приходят из неё; с выключенным
   * звуком метроном идёт сам — иначе правило про удар в долю работает, а
   * увидеть долю нельзя, и игра начинает врать глазами.
   */
  const heard = world.beatAt !== undefined && world.time - world.beatAt < BEAT_PERIOD * 3;
  if (!heard) {
    const tick = Math.floor(world.time / BEAT_PERIOD);
    if (tick !== world.beatTick) {
      world.beatTick = tick;
      world.fx.beat = 1;
    }
  }

  world.fx.beat = Math.max(0, world.fx.beat - dt * 5);

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

  /*
   * Дверь как оружие. Влетевший в неё на бегу сбивает с ног того, кто
   * стоит за ней, — и это единственная механика здесь, которая награждает
   * за то, что игрок не остановился. Ровно за это жанр и любят: скорость
   * должна быть решением, а не риском.
   */
  player.slam = Math.max(0, (player.slam || 0) - dt);
  const dash = Math.hypot(player.vx, player.vy);

  if (dash > 210 && player.slam <= 0) {
    const ahead = {
      x: player.x + (player.vx / dash) * 22,
      y: player.y + (player.vy / dash) * 22,
    };

    if (tileAt(world, ahead.x, ahead.y) === TILE.DOOR) {
      player.slam = 0.5;
      emitNoise(world, ahead.x, ahead.y, 240, 'player');
      world.events.push({ type: 'slam' });
      world.fx.shake = Math.max(world.fx.shake, 5);

      for (const enemy of world.enemies) {
        if (!enemy.alive || enemy.downed > 0) continue;
        if (Math.hypot(enemy.x - ahead.x, enemy.y - ahead.y) > 42) continue;
        knockDown(world, enemy, Math.atan2(enemy.y - player.y, enemy.x - player.x));
        world.fx.hitstop = Math.max(world.fx.hitstop, 0.05);
      }
    }
  }

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
  tickMove(world, player, dt, 'player');
  player.swingHit = Math.max(0, (player.swingHit || 0) - dt);
  player.beatHit = Math.max(0, (player.beatHit || 0) - dt);
  player.flash = Math.max(0, (player.flash || 0) - dt);

  /*
   * Одна кнопка на подбор и бросок. Что именно она делает, решает
   * обстановка: рядом лежит оружие — берём (меняя то, что в руках), не
   * лежит ничего и руки заняты — швыряем. Две отдельные клавиши для
   * действий, которые никогда не спорят между собой, — лишняя нагрузка
   * на пальцы.
   */
  if (intent.grab) {
    const near = world.pickups.some((pickup) => !pickup.flying
      && Math.hypot(pickup.x - player.x, pickup.y - player.y) < 34);

    if (near) tryPickup(world);
    else tryThrow(world);
  }

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
    } else if (player.weapon === 'fists') {
      /* Ввод приёмов не присылает: у игрока одна кнопка удара. Аргумент
         оставлен ради дуэлей с боссами, где приёмы вернутся. */
      bareAttack(world, player, intent.move || 'hand', 'player');
    } else {
      swingMelee(world, player, 'player');
    }
  }

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
  tickMove(world, enemy, dt, 'enemy');

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
    if (!enemy.weapon) {
      bareAttack(world, enemy, enemy.nextMove || 'hand', 'enemy');
    } else {
      const weapon = WEAPONS[enemy.weapon];
      if (weapon.kind === 'gun' && enemy.ammo > 0) fireGun(world, enemy, 'enemy');
      else if (weapon.kind === 'melee') swingMelee(world, enemy, 'enemy');
    }
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
