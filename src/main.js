/*
 * ОДИН УДАР — сборка игры.
 *
 * Здесь живёт то, что связывает остальное: цикл кадра, камера, прицел,
 * экраны между попытками и перезапуск. Правил боя тут нет — они в
 * world.js, поведения врагов нет — оно в ai.js.
 */

import { CAMPAIGN } from './levels.js';
import { decode, encode } from './level.js';
import { createWorld, update, WEAPONS, MOVES, BARE_HP, beatNow } from './world.js';
import { AIM_CONE, assistAim, closeThreat, meleeSnap, hasTargetUnderAim, lockTarget } from './aim.js';
import { createRenderer } from './render.js';
import { createAssets } from './assets.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { parseHash, buildLink, compare, cleanNick, NICK_KEY } from './challenge.js';
import { createScore, readBest, writeBest, rankFor } from './score.js';

const $ = (id) => document.getElementById(id);

const canvas = $('screen');
const assets = createAssets();
const renderer = createRenderer(canvas, assets);

/*
 * Картинки приезжают асинхронно и могут не приехать вовсе. Как только
 * загрузились — просим перепечь уровень: до этого момента он нарисован
 * примитивами, и это нормальный, а не запасной вид.
 */
assets.boot().then((ok) => {
  if (ok) renderer.invalidate();
});
const input = createInput(canvas);
const audio = createAudio();

const ui = {
  weapon: $('weapon'),
  ammo: $('ammo'),
  bare: $('bare'),
  moves: $('moves'),
  kills: $('kills'),
  clock: $('clock'),
  toast: $('toast'),
  dead: $('dead'),
  veil: $('veil'),
  veilLogo: $('veilLogo'),
  veilKicker: $('veilKicker'),
  veilTitle: $('veilTitle'),
  veilText: $('veilText'),
  veilStats: $('veilStats'),
  weaponIcon: $('weaponIcon'),
  veilAction: $('veilAction'),
  veilSecond: $('veilSecond'),
  veilCode: $('veilCode'),
  codeBox: $('codeBox'),
  veilScore: $('veilScore'),
  rankLetter: $('rankLetter'),
  scoreLines: $('scoreLines'),
  scoreTotal: $('scoreTotal'),
  scoreBest: $('scoreBest'),
  score: $('score'),
  rankNow: $('rankNow'),
  combo: $('combo'),
  comboValue: $('comboValue'),
  comboBar: $('comboBar'),
  target: $('target'),
  targetTime: $('targetTime'),
  veilShare: $('veilShare'),
  nickBox: $('nickBox'),
  linkBox: $('linkBox'),
  mute: $('mute'),
  ghostMove: $('ghostMove'),
  ghostAim: $('ghostAim'),
};

/*
 * Удар — это просто удар.
 *
 * Здесь были три приёма по кругу и целая тактика чтения чужого замаха.
 * Механика работала и подтверждалась числами, но в общей свалке её никто
 * не читал: игрок видел «летающие палки» и не понимал, почему удар прошёл
 * мимо. Она уехала к боссам, где будет дуэль один на один; здесь осталась
 * одна кнопка, которая бьёт.
 */
const ATTACK_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'KeyJ'];

const SFX_BY_EVENT = {
  slam: 'slam',
  clash: 'clash',
  parry: 'parry',
  /* Убийство со спины звучит своим звуком — он подставляется в drainEvents. */
  shot: 'shot',
  swing: 'swing',
  impact: 'impact',
  knock: 'knock',
  kill: 'kill',
  death: 'death',
  pickup: 'pickup',
  dry: 'dry',
  glass: 'glass',
  spot: 'spot',
  cleared: 'exit',
};

let custom = false;
let levelIndex = 0;
let challenge = null;   /* чужой результат, если этаж открыт по ссылке */
let locked = null;      /* цель, за которую держится прицел на клавиатуре */
let level = CAMPAIGN[0];
let world = null;
let score = null;
let levelCode = '';
let result = null;
let scene = 'call';          /* call → play → dead | clear, плюс pause */
let view = { x: 0, y: 0 };
let lastView = { zoom: 1, camX: 0, camY: 0 };
let toastTimer = 0;
let deathHold = 0;
let attempts = 0;


/* =========================================================
   ЧУЖОЙ ЭТАЖ ИЗ АДРЕСА
   ========================================================= */

/*
 * Уровень целиком лежит в ссылке. Редактора пока нет, но канал уже
 * рабочий: код из адресной строки проходит тот же путь, что пройдёт код
 * из чужих рук.
 */
function levelFromHash() {
  const parsed = parseHash(location.hash);
  challenge = parsed.challenge;
  if (!parsed.code) return null;

  try {
    const outside = decode(parsed.code);
    outside.title = challenge ? 'ВЫЗОВ' : 'ЧУЖОЙ ЭТАЖ';
    outside.call = challenge
      ? `${challenge.nick} прошёл этот этаж за ${formatTime(challenge.time)}, ранг ${challenge.rank}. Автоответчик передал вызов — теперь твоя очередь.`
      : 'Код прислали снаружи. Кто там внутри — автоответчик не уточнил.';
    return outside;
  } catch (error) {
    setToast(`КОД НЕ ОТКРЫЛСЯ: ${error.message}`, 5);
    return null;
  }
}


/* =========================================================
   ВЫЗОВ
   ========================================================= */

function readNick() {
  try {
    return cleanNick(localStorage.getItem(NICK_KEY) || '');
  } catch (error) {
    return '';
  }
}

function rememberNick(nick) {
  try { localStorage.setItem(NICK_KEY, nick); } catch (error) { /* приватный режим */ }
}

/* Ссылка перестраивается на каждое нажатие в поле имени: подписаться под
   вызовом должно быть так же дёшево, как его скопировать. */
function refreshLink() {
  if (!result) return;
  const base = location.origin + location.pathname;
  ui.linkBox.value = buildLink(base, levelCode, {
    nick: ui.nickBox.value,
    time: world.time,
    score: result.total,
    rank: result.rank,
  });
}


/* =========================================================
   ЭКРАНЫ
   ========================================================= */

function showVeil(config) {
  /* Логотип уместен на входе и мешает на разборе забега. */
  ui.veilLogo.hidden = config.tone !== 'call';
  ui.veilKicker.textContent = config.kicker || '';
  ui.veilTitle.textContent = config.title || '';
  ui.veilText.textContent = config.text || '';
  ui.veilStats.innerHTML = config.stats || '';
  ui.veilAction.textContent = config.action || 'ДАЛЬШЕ';
  ui.veilSecond.textContent = config.second || '';
  ui.veilSecond.hidden = !config.second;
  ui.veilCode.hidden = !config.code;
  if (config.code) ui.codeBox.value = config.code;

  ui.veilScore.hidden = !config.result;
  if (config.result) fillScore(config.result, config.best, config.record);

  ui.veilShare.hidden = !config.share;
  if (config.share) {
    ui.nickBox.value = readNick();
    refreshLink();
  }
  ui.veil.hidden = false;
  ui.veil.dataset.tone = config.tone || 'call';
  audio.setMenu(true);
}

function hideVeil() {
  stopTyping();
  ui.veil.hidden = true;
  ui.dead.hidden = true;
  audio.setMenu(false);
}

/*
 * Итоги набираются на глазах, строка за строкой.
 *
 * Раньше вся таблица появлялась разом, и её пролистывали не читая. Когда
 * строки набегают по очереди, глаз успевает зацепиться за каждую — и
 * видно, за что именно начислено. Это единственное место в игре, где
 * ожидание уместно: бой уже закончился.
 *
 * Но и здесь оно не навязано: любое нажатие дописывает всё разом, а тем,
 * кто просил систему не анимировать, таблица показывается сразу.
 */
const CHAR_MS = 9;
const LINE_MS = 70;
let typing = null;

function stopTyping() {
  if (!typing) return;
  clearTimeout(typing.timer);
  typing.finish();
  typing = null;
}

function typeScore(final) {
  const rows = final.lines.map((line) => ({
    label: line.label,
    value: line.value ? `+${line.value}` : '—',
  }));

  const html = rows
    .map((row) => `<li><span></span><b hidden>${row.value}</b></li>`)
    .join('');
  ui.scoreLines.innerHTML = html;
  ui.scoreTotal.textContent = '0';

  const items = [...ui.scoreLines.children];
  const finish = () => {
    items.forEach((item, i) => {
      item.querySelector('span').textContent = rows[i].label;
      item.querySelector('b').hidden = false;
    });
    ui.scoreTotal.textContent = final.total;
  };

  /* В скрытой вкладке таймеры браузер придерживает до секунды на шаг:
     вернувшийся игрок увидел бы недопечатанную таблицу. Там, где смотреть
     некому, печатать нечего. */
  if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }

  let row = 0;
  let char = 0;
  typing = { timer: 0, finish };

  const tick = () => {
    if (row >= rows.length) {
      /* Итог не печатается, а набегает: цифра должна выглядеть суммой. */
      const from = performance.now();
      const roll = () => {
        const done = Math.min(1, (performance.now() - from) / 260);
        ui.scoreTotal.textContent = Math.round(final.total * done);
        if (done < 1) typing.timer = setTimeout(roll, 16);
        else typing = null;
      };
      roll();
      return;
    }

    const item = items[row];
    const label = rows[row].label;
    char += 1;
    item.querySelector('span').textContent = label.slice(0, char);

    if (char >= label.length) {
      item.querySelector('b').hidden = false;
      row += 1;
      char = 0;
      typing.timer = setTimeout(tick, LINE_MS);
      return;
    }
    typing.timer = setTimeout(tick, CHAR_MS);
  };

  tick();
}

/*
 * Разбор забега. Строки приходят из score.js уже посчитанными — здесь
 * только вёрстка, чтобы правила начисления жили в одном месте.
 */
function fillScore(final, best, record) {
  ui.veilScore.dataset.rank = final.rank;
  ui.rankLetter.textContent = final.rank;

  typeScore(final);

  if (record) {
    ui.scoreBest.textContent = 'НОВЫЙ РЕКОРД ЭТАЖА';
    ui.scoreBest.dataset.record = '1';
  } else if (best) {
    ui.scoreBest.textContent = `ЛУЧШЕЕ: ${best.total} · РАНГ ${best.rank}`;
    ui.scoreBest.dataset.record = '0';
  } else {
    ui.scoreBest.textContent = '';
    ui.scoreBest.dataset.record = '0';
  }
}

function setToast(text, seconds = 2) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  toastTimer = seconds;
}

function byFinger() {
  return input.isTouch() || matchMedia('(pointer: coarse)').matches;
}

function controlsHint() {
  return byFinger()
    ? 'ЛЕВЫЙ ПАЛЕЦ ВЕДЁТ. ПРАВЫЙ ЦЕЛИТ И БЬЁТ САМ. БЕЙ В ТАКТ МУЗЫКИ — КОЛЬЦО ВОКРУГ ТЕБЯ И ЕСТЬ ДОЛЯ: В НЕЁ КЛАДЁШЬ С ОДНОГО.'
    : 'WASD — ИДТИ, СТРЕЛКИ ИЛИ ЛКМ — БИТЬ, ПРОБЕЛ — ВЗЯТЬ ИЛИ БРОСИТЬ ОРУЖИЕ. БЕЙ В ТАКТ МУЗЫКИ — КЛАДЁШЬ С ОДНОГО УДАРА И БЬЁШЬ ПЕРВЫМ. МИМО ТАКТА НУЖНО ДВА. R — ЗАНОВО.';
}


/* =========================================================
   ЗАПУСК ЭТАЖА
   ========================================================= */

function startLevel(next, { silent } = {}) {
  const changed = next && next !== level;
  level = next || level;
  if (changed || !levelCode) levelCode = encode(level);

  world = createWorld(level);
  view = { x: world.player.x, y: world.player.y };
  renderer.invalidate();
  scene = 'play';
  hideVeil();
  attempts += 1;
  result = null;
  locked = null;
  ui.dead.hidden = true;
  score = createScore(level, attempts);
  if (!silent) audio.playTrack(level.track || 0);
  updateHud(true);
}

function callScreen() {
  scene = 'call';
  const best = readBest(levelCode);

  showVeil({
    tone: 'call',
    kicker: 'СООБЩЕНИЕ · 03:14',
    title: level.title,
    text: level.call,
    stats: `<span>${controlsHint()}</span>`
      + (best ? `<span>ЛУЧШЕЕ ЗДЕСЬ: ${best.total} · РАНГ ${best.rank} · ${formatTime(best.time)}</span>` : ''),
    action: 'ВЗЯТЬ КЛЮЧИ',
  });
}

/*
 * Смерть.
 *
 * Меню здесь было ошибкой: карточка со счётом, попытками и кнопкой
 * заставляет читать и целиться мышью, а Hotline Miami держит игрока в
 * потоке именно тем, что между смертью и новой попыткой нет ничего.
 * Поэтому теперь — красный оттиск, слово «заново» и любая клавиша.
 *
 * Музыку при этом не глушим и не начинаем заново: она и есть тот метроном,
 * по которому игрок продолжает двигаться, пока экран мигает.
 */
function deathScreen() {
  scene = 'dead';
  /* Подпись под словом «ЗАНОВО» — про то, что у игрока в руках. */
  const how = ui.dead.querySelector('span');
  if (how) how.textContent = byFinger() ? 'КОСНИСЬ ЭКРАНА' : 'ПРОБЕЛ ИЛИ R';
  ui.dead.hidden = false;
}

/* Есть ли следующий этаж кампании. Чужой этаж по ссылке продолжения не имеет. */
function hasNextFloor() {
  return !custom && levelIndex + 1 < CAMPAIGN.length;
}


function clearScreen() {
  scene = 'clear';

  result = score.finish(world);
  const record = writeBest(levelCode, result, world.time);
  const more = hasNextFloor();

  /* Вызов принят или нет — это первое, что должно быть видно на экране. */
  const duel = compare({ time: world.time, score: result.total }, challenge);
  const verdict = duel
    ? (duel.beaten
      ? `ВЫЗОВ ПРИНЯТ: БЫСТРЕЕ ${challenge.nick} НА ${formatTime(duel.delta)}`
      : `${challenge.nick} ВСЁ ЕЩЁ БЫСТРЕЕ НА ${formatTime(duel.delta)}`)
    : '';

  showVeil({
    tone: 'clear',
    kicker: duel ? (duel.beaten ? 'ВЫЗОВ ОТБИТ' : 'ВЫЗОВ НЕ ВЗЯТ') : 'ЭТАЖ СДАН',
    title: duel ? (duel.beaten ? 'ТЫ БЫСТРЕЕ' : 'ПОКА МЕДЛЕННЕЕ') : (more ? 'СЛЕДУЮЩЕЕ СООБЩЕНИЕ' : 'ТИХО'),
    text: duel
      ? 'Отправь ссылку обратно — в ней твой результат и тот же самый этаж.'
      : (more
        ? 'Автоответчик уже мигает. Очки платят за темп: цепочка обрывается через четыре секунды без убийства.'
        : 'Этаж сдан. Отправь его кому-нибудь: ссылка несёт и уровень, и твоё время.'),
    stats: `<span>ВРЕМЯ ${formatTime(world.time)}</span><span>ПОПЫТОК ${attempts}</span>`
      + (verdict ? `<span>${verdict}</span>` : ''),
    share: true,
    action: more ? 'СЛЕДУЮЩИЙ ЭТАЖ' : 'ПРОЙТИ ЧИЩЕ',
    second: more ? 'ПРОЙТИ ЭТОТ ЧИЩЕ' : 'ВЫЙТИ В МЕНЮ',
    result,
    best: record.best,
    record: record.record,
  });
}

function pauseScreen() {
  scene = 'pause';
  showVeil({
    tone: 'pause',
    kicker: 'ПАУЗА',
    title: level.title,
    text: 'Этаж целиком помещается в эту строку. Скопируй её — и тот, кому дашь, откроет ровно этот же этаж.',
    stats: `<span>${controlsHint()}</span>`,
    action: 'ПРОДОЛЖИТЬ',
    second: 'НАЧАТЬ ЭТАЖ ЗАНОВО',
    code: levelCode,
  });
}

function formatTime(seconds) {
  const total = Math.floor(seconds * 10) / 10;
  const minutes = Math.floor(total / 60);
  const rest = (total - minutes * 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${rest}`;
}


/* =========================================================
   ПРИЦЕЛ
   ========================================================= */

function buildIntent(raw) {
  const player = world.player;
  const intent = {
    moveX: raw.moveX,
    moveY: raw.moveY,
    aimAngle: null,
    attack: false,
    move: null,
    /* Пробел один отвечает и за подбор, и за бросок: выбирает обстановка. */
    grab: input.tookKey('Space') || input.tookKey('Pickup'),
    pickup: input.tookKey('KeyE'),
    throw: input.tookKey('KeyQ') || input.tookKey('Throw'),
  };

  if (raw.aimStick !== null) {
    locked = null;
    world.locked = null;
    intent.aimAngle = assistAim(world, raw.aimStick, AIM_CONE.stick);
  } else if (raw.aimKeys) {
    intent.aimAngle = assistAim(world, Math.atan2(raw.aimKeys.y, raw.aimKeys.x), AIM_CONE.keys);
  } else if (!raw.touch && raw.mouse.moved) {
    locked = null;
    world.locked = null;
    const worldX = lastView.camX + (raw.mouse.x - canvas.clientWidth / 2) / lastView.zoom;
    const worldY = lastView.camY + (raw.mouse.y - canvas.clientHeight / 2) / lastView.zoom;
    intent.aimAngle = assistAim(world, Math.atan2(worldY - player.y, worldX - player.x), AIM_CONE.mouse);
  } else {
    /*
     * Ни мыши, ни стрелок — прицел держится за живую цель сам. Бежать при
     * этом можно куда угодно: направление бега больше не решает, куда
     * смотрит игрок.
     */
    locked = lockTarget(world, locked, player.angle);
    world.locked = locked;

    if (locked) {
      intent.aimAngle = Math.atan2(locked.y - player.y, locked.x - player.x);
    } else if (raw.moveX || raw.moveY) {
      intent.aimAngle = assistAim(world, Math.atan2(raw.moveY, raw.moveX), AIM_CONE.run);
    } else {
      intent.aimAngle = closeThreat(world);
    }
  }

  /* Удержание — это очередь ударов, а не один: темп задаёт откат оружия. */
  const fired = input.tookKey('Fire') || ATTACK_KEYS.some((code) => input.tookKey(code));
  intent.attack = fired || raw.attackHeld;

  /*
   * Палец не умеет одновременно целиться стиком и жать кнопку: это один и
   * тот же большой палец. Поэтому наведённый на цель стик бьёт сам —
   * но только когда цель действительно под прицелом, иначе обойма
   * уходит в стену за две секунды.
   */
  if (!intent.attack && raw.aimStick !== null && intent.aimAngle !== null) {
    intent.attack = hasTargetUnderAim(world, intent.aimAngle);
  }

  if (intent.attack) {
    const snapped = meleeSnap(world, intent.aimAngle === null ? player.angle : intent.aimAngle);
    if (snapped !== null) intent.aimAngle = snapped;
  }

  return intent;
}

/* =========================================================
   HUD
   ========================================================= */

function updateHud(force) {
  const player = world.player;
  const weapon = WEAPONS[player.weapon];

  if (force || ui.weapon.textContent !== weapon.name) ui.weapon.textContent = weapon.name;

  /* Иконка того, что в руках. Оружие берём из тех же файлов, которыми оно
     нарисовано на полу, — тогда поднятое с пола и показанное в углу
     совпадают, и узнавать приходится один раз. */
  const icon = player.weapon === 'bat' ? 'assets/items/bat.png'
    : player.weapon === 'pistol' ? 'assets/items/pistol.png'
      : 'assets/ui/fists.png';
  if (ui.weaponIcon && !ui.weaponIcon.src.endsWith(icon)) ui.weaponIcon.src = icon;

  if (weapon.kind === 'gun') {
    ui.ammo.innerHTML = '<i></i>'.repeat(Math.max(0, player.ammo));
    ui.ammo.dataset.empty = player.ammo === 0 ? '1' : '0';
  } else {
    ui.ammo.innerHTML = '';
    ui.ammo.dataset.empty = '0';
  }

  /*
   * Голыми руками игрок держит три попадания и дерётся приёмами —
   * значит, и то и другое должно быть на экране, пока это правда.
   */
  const bare = player.weapon === 'fists';
  if (ui.bare.hidden === bare) {
    ui.bare.hidden = !bare;
    ui.moves.hidden = true;
  }
  if (bare) {
    const hp = player.hp === undefined ? BARE_HP : player.hp;
    for (let i = 0; i < ui.bare.children.length; i += 1) {
      ui.bare.children[i].dataset.lost = i < hp ? '0' : '1';
    }
  }

  ui.kills.textContent = `${world.kills}/${world.total}`;
  ui.clock.textContent = formatTime(world.time);

  if (challenge) {
    ui.target.hidden = false;
    ui.targetTime.textContent = `${challenge.nick} ${formatTime(challenge.time)}`;
    ui.target.dataset.late = world.time > challenge.time ? '1' : '0';
  } else if (!ui.target.hidden) {
    ui.target.hidden = true;
  }

  ui.score.textContent = score.state.score;

  /*
   * Ранг показывается прямо в бою, а не только в конце. Иначе связь
   * «цепочка → очки → буква» остаётся невидимой: игрок за весь забег ни
   * разу не увидит, ради чего он держит темп.
   */
  const rank = rankFor(score.state.score, world.total);
  if (ui.rankNow.textContent !== rank) ui.rankNow.textContent = rank;

  const combo = score.state.combo;
  if (combo > 1) {
    const left = Math.max(0, score.state.comboLeft / 4);
    ui.combo.hidden = false;
    ui.comboBar.style.transform = `scaleX(${left})`;
    ui.combo.dataset.urgent = left < 0.3 ? '1' : '0';

    if (ui.combo.dataset.value !== String(combo)) {
      ui.combo.dataset.value = String(combo);
      ui.comboValue.textContent = `×${combo}`;
      /* Пересборка анимации: без неё каждое следующее убийство не «щёлкает». */
      ui.combo.style.animation = 'none';
      void ui.combo.offsetWidth;
      ui.combo.style.animation = '';
    }
  } else if (!ui.combo.hidden) {
    ui.combo.hidden = true;
    ui.combo.dataset.value = '';
  }
}

function drainEvents() {
  for (const event of world.events) {
    const name = SFX_BY_EVENT[event.type];
    if (name) audio.sfx(name);

    if (event.type === 'kill') {
      if (event.silent) audio.sfx('backstab');
      vibrate(12);
    } else if (event.type === 'death') {
      vibrate([40, 30, 90]);
      deathHold = 0.14;
    } else if (event.type === 'cleared') {
      setToast('ЭТАЖ ЧИСТ — К ВЫХОДУ', 3);
    } else if (event.type === 'dry') {
      setToast('ПУСТО', 1.2);
    } else if (event.type === 'pickup') {
      setToast(WEAPONS[world.player.weapon].name, 1.2);
    } else if (event.type === 'exit') {
      clearScreen();
    }
  }
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (error) { /* браузер против */ }
  }
}


/* =========================================================
   КАДР
   ========================================================= */

let previous = performance.now();

/*
 * Один упавший кадр не должен вешать игру.
 *
 * Ровно это и случилось на живом прохождении: на выходе с этажа вызывалась
 * функция, которую забыли перенести, исключение убивало
 * requestAnimationFrame — и всё замирало без единого слова на экране.
 * Игрок видит зависание и не может ни доиграть, ни рассказать, что было.
 */
function frame(now) {
  try {
    step(now);
  } catch (error) {
    console.error(error);
    setToast(`СБОЙ: ${error.message}`, 6);
  }

  input.endFrame();
  requestAnimationFrame(frame);
}


function step(now) {
  /* Шаг зажат с обеих сторон: сверху — чтобы после сворачивания вкладки
     мир не прыгнул на секунду вперёд, снизу — чтобы время ни при каких
     обстоятельствах не пошло назад. Отрицательный шаг откручивает все
     отсчёты вспять: вспышка вместо затухания копится, откаты растут. */
  const dt = Math.max(0, Math.min(0.05, (now - previous) / 1000));
  previous = now;

  resize();

  const raw = input.read();

  if (input.tookKey('Escape') || input.tookKey('KeyP')) {
    if (scene === 'play') pauseScreen();
    else if (scene === 'pause') { hideVeil(); scene = 'play'; }
  }

  if (input.tookKey('KeyM')) toggleMute();

  if (scene === 'play') {
    const intent = buildIntent(raw);
    update(world, dt, intent);
    score.feed(world.events);
    score.update(dt);
    drainEvents();

    const alerted = world.enemies.filter((e) => e.alive && e.state === 'chase').length;
    audio.setIntensity(world.total ? alerted / world.total : 0);

    if (world.state === 'dead') {
      deathHold = 0.14;
      scene = 'dying';
    }

    updateHud(false);
  } else if (scene === 'dying') {
    update(world, dt, { moveX: 0, moveY: 0, aimAngle: null, attack: false });
    drainEvents();
    deathHold -= dt;
    if (deathHold <= 0) deathScreen();
  } else if (world && scene !== 'call') {
    /* На паузе и после смерти мир не двигается, но кадр всё равно рисуем. */
    update(world, 0, { moveX: 0, moveY: 0, aimAngle: null, attack: false });
  }

  /* R перезапускает этаж откуда угодно, кроме экрана звонка. */
  const restart = input.tookKey('KeyR');
  if (scene === 'dead' || scene === 'dying') {
    /* После смерти перезапускает всё, что под рукой: R, пробел, удар,
       а на телефоне — касание в любом месте экрана. */
    if (restart || input.tookKey('Fire') || input.tookKey('Space')
      || input.tookKey('Tap') || ATTACK_KEYS.some((code) => input.tookKey(code))) {
      startLevel(level, { silent: true });
    }
  } else if (restart && (scene === 'play' || scene === 'pause')) {
    startLevel(level, { silent: true });
  }

  if (world) {
    /* Камера смотрит чуть вперёд по прицелу и догоняет быстро: на этой
       скорости мягкое слежение отстаёт и игрок упирается в край кадра. */
    const player = world.player;
    /*
     * Упреждение камеры — роскошь широкого экрана. На телефоне оно уводит
     * игрока к краю, а он там и так оказывается: этаж помещается целиком,
     * камера упирается в его границы, и персонаж гуляет по всему кадру.
     * Пальцем в таком режиме играть нельзя — смотришь то в один угол, то
     * в другой. Поэтому на сенсоре камера держит игрока по центру и
     * выходит за края этажа, показывая темноту.
     */
    const lead = byFinger() ? 0 : 60;
    view.x += (player.x + Math.cos(player.angle) * lead - view.x) * Math.min(1, dt * 13);
    view.y += (player.y + Math.sin(player.angle) * lead - view.y) * Math.min(1, dt * 13);
    view.centred = byFinger();
    lastView = renderer.draw(world, view);

    /*
     * Сколько мира влезло в экран — знает только камера, а нужно это ИИ.
     * Кладём радиус в мир: стрелки не станут бить из невидимого.
     */
    world.viewRadius = Math.min(
      canvas.clientWidth / (2 * lastView.zoom),
      canvas.clientHeight / (2 * lastView.zoom),
    ) - 24;
    drawSticks(raw);
  }

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) ui.toast.hidden = true;
  }

}


/* Призраки стиков: палец должен видеть, что игра его поняла. */
function drawSticks(raw) {
  for (const [ghost, stick] of [[ui.ghostMove, raw.sticks.move], [ui.ghostAim, raw.sticks.aim]]) {
    if (!stick.active) { ghost.hidden = true; continue; }
    ghost.hidden = false;
    ghost.style.left = `${stick.baseX}px`;
    ghost.style.top = `${stick.baseY}px`;
    ghost.firstElementChild.style.transform = `translate(${stick.dx}px, ${stick.dy}px)`;
  }
}


/* =========================================================
   ОБВЯЗКА
   ========================================================= */

function toggleMute() {
  audio.setMuted(!audio.isMuted());
  ui.mute.dataset.off = audio.isMuted() ? '1' : '0';
  ui.mute.textContent = audio.isMuted() ? 'ЗВУК ВЫКЛ' : 'ЗВУК ВКЛ';
}

/*
 * Размер сверяется каждый кадр, а не только по событию resize: в Safari
 * адресная строка меняет высоту окна без события, а в фоновой вкладке
 * окно какое-то время сообщает нули.
 */
function resize() {
  const width = window.innerWidth || document.documentElement.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight;
  if (width < 1 || height < 1) return;
  /* Повтор ничего не стоит: холст сам отбросит вызов, если размер тот же. */
  renderer.resize(width, height, window.devicePixelRatio || 1);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

ui.veilAction.addEventListener('click', (event) => {
  audio.unlock();
  audio.sfx('ui');
  /* Снимаем фокус: иначе пробел в бою повторно нажимал бы эту кнопку. */
  event.currentTarget.blur();

  if (scene === 'call') { startLevel(level); offerHomeScreen(); }
  else if (scene === 'dead') startLevel(level, { silent: true });
  else if (scene === 'clear') { attempts = 0; startLevel(level, { silent: true }); }
  else if (scene === 'pause') { hideVeil(); scene = 'play'; }
});

ui.veilSecond.addEventListener('click', (event) => {
  audio.sfx('ui');
  event.currentTarget.blur();
  if (scene === 'pause') startLevel(level, { silent: true });
  else if (scene === 'clear') { attempts = 0; callScreen(); }
});

ui.codeBox.addEventListener('focus', () => ui.codeBox.select());

ui.nickBox.addEventListener('input', () => {
  const clean = cleanNick(ui.nickBox.value);
  if (ui.nickBox.value !== clean) ui.nickBox.value = clean;
  rememberNick(clean);
  refreshLink();
});

$('copyLink').addEventListener('click', async () => {
  refreshLink();
  ui.linkBox.select();
  try {
    await navigator.clipboard.writeText(ui.linkBox.value);
    setToast('ССЫЛКА СКОПИРОВАНА — ОТПРАВЬ ЕЁ', 2.4);
  } catch (error) {
    document.execCommand('copy');
  }
});

ui.linkBox.addEventListener('focus', () => ui.linkBox.select());

$('copyCode').addEventListener('click', async () => {
  ui.codeBox.select();
  try {
    await navigator.clipboard.writeText(ui.codeBox.value);
    setToast('КОД СКОПИРОВАН', 1.6);
  } catch (error) {
    document.execCommand('copy');
  }
});

ui.mute.addEventListener('click', () => {
  audio.unlock();
  toggleMute();
});

input.bindButton($('btnAttack'), 'attack');
input.bindButton($('btnPickup'), 'pickup');
input.bindButton($('btnThrow'), 'throw');

/*
 * Уход из вкладки и возвращение.
 *
 * Уходя, игра встаёт на паузу. Возвращаясь — будит звук: телефон
 * усыпляет AudioContext, пока приложение свёрнуто, и сам он не
 * просыпается. Раньше подписка на первое касание снималась после первого
 * же жеста, поэтому «вышел — зашёл — звука нет» и не лечилось ничем,
 * кроме перезагрузки страницы.
 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (scene === 'play') pauseScreen();
    return;
  }
  audio.unlock();
});

/*
 * Подсказка про домашний экран.
 *
 * В Safari на айфоне вкладки в горизонтальном режиме съедают верх экрана,
 * и убрать их со страницы нельзя — полноэкранного режима для элемента там
 * нет. Зато игра, добавленная на домашний экран, открывается отдельным
 * окном без адресной строки. Говорим об этом один раз и только тем, кому
 * это доступно: в отдельном окне подсказка уже не нужна.
 */
function offerHomeScreen() {
  const standalone = window.navigator.standalone === true
    || matchMedia('(display-mode: fullscreen)').matches
    || matchMedia('(display-mode: standalone)').matches;
  const apple = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone || !apple) return;
  try {
    if (localStorage.getItem('udar-home') === '1') return;
    localStorage.setItem('udar-home', '1');
  } catch (error) {
    return;                       /* приватный режим — молчим */
  }
  setToast('ПОДЕЛИТЬСЯ → НА ЭКРАН «ДОМОЙ»: ИГРА ОТКРОЕТСЯ ВО ВЕСЬ ЭКРАН', 6);
}

/* Возврат из фонового режима на iOS приходит и этим событием — оно
   срабатывает, когда страницу достали из кэша «назад/вперёд». */
window.addEventListener('pageshow', () => audio.unlock());

/* Кадр дышит в такт музыки: подписываемся один раз при старте. */
audio.onBeat(() => {
  if (world) beatNow(world);
  /* Кнопка удара мигает вместе с долей: на телефоне палец держат на ней,
     и метроном должен быть там же, где взгляд. */
  const key = $('btnAttack');
  if (!key) return;
  key.classList.remove('on-beat');
  void key.offsetWidth;
  key.classList.add('on-beat');
});

/* Касание разрешает звук. Подписка не снимается: браузер может усыпить
   контекст в любой момент, а разбудить его можно только по жесту. */
window.addEventListener('pointerdown', () => audio.unlock());

/* Нажатие во время печати итогов дописывает их разом: ждать заставляют
   только те игры, которые не уважают чужое время. */
window.addEventListener('pointerdown', stopTyping);
window.addEventListener('keydown', stopTyping);

/*
 * Диагностический вход. Через него проверяется то, что не проверить
 * снаружи: дошло ли нажатие до мира и в каком состоянии игра. Ничего не
 * меняет — только отдаёт ссылки на живые объекты.
 */
window.avto = {
  get world() { return world; },
  get scene() { return scene; },
  get level() { return level; },
  /* Ручной кадр: в скрытой панели предпросмотра requestAnimationFrame
     заморожен, и без него нельзя проверить ничего, что происходит во
     времени, — например, что этаж вообще засчитывается. */
  step,
  /* Экраны напрямую. Дойти до итогов «по-настоящему» в панели
     предпросмотра стоит десятка шагов и всё равно упирается в то, что
     событие выхода живёт один кадр; а посмотреть на карточку глазами
     надо после каждой правки её вёрстки. */
  screens: { call: callScreen, clear: clearScreen, dead: deathScreen, pause: pauseScreen },
};

const fromHash = levelFromHash();
if (fromHash) { level = fromHash; custom = true; }

resize();
levelCode = encode(level);
world = createWorld(level);
score = createScore(level, 0);
view = { x: world.player.x, y: world.player.y };
updateHud(true);
callScreen();
ui.mute.dataset.off = audio.isMuted() ? '1' : '0';
ui.mute.textContent = audio.isMuted() ? 'ЗВУК ВЫКЛ' : 'ЗВУК ВКЛ';
requestAnimationFrame(frame);
