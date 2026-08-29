/*
 * ОДИН УДАР — сборка игры.
 *
 * Здесь живёт то, что связывает остальное: цикл кадра, камера, прицел,
 * экраны между попытками и перезапуск. Правил боя тут нет — они в
 * world.js, поведения врагов нет — оно в ai.js.
 */

import { CAMPAIGN } from './levels.js';
import { decode, encode } from './level.js';
import { createWorld, update, WEAPONS, MOVES, BARE_HP } from './world.js';
import { AIM_CONE, assistAim, closeThreat, meleeSnap, hasTargetUnderAim, lockTarget } from './aim.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { parseHash, buildLink, compare, cleanNick, NICK_KEY } from './challenge.js';
import { createScore, readBest, writeBest, rankFor } from './score.js';

const $ = (id) => document.getElementById(id);

const canvas = $('screen');
const renderer = createRenderer(canvas);
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
  veilKicker: $('veilKicker'),
  veilTitle: $('veilTitle'),
  veilText: $('veilText'),
  veilStats: $('veilStats'),
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
 * Приёмы рукопашной на стрелках: нажатие и выбирает приём, и бьёт им.
 * Отдельная кнопка «ударить» добавила бы шаг между решением и ударом, а
 * вся игра держится на его отсутствии.
 *
 * С оружием в руках все три бьют одинаково — железо не разбирает, рукой
 * ты замахнулся или ногой.
 */
const MOVE_KEYS = {
  ArrowLeft: 'hand',
  ArrowRight: 'kick',
  ArrowUp: 'grab',
  Digit1: 'hand',
  Digit2: 'kick',
  Digit3: 'grab',
};

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
  ui.veil.hidden = true;
  ui.dead.hidden = true;
  audio.setMenu(false);
}

/*
 * Разбор забега. Строки приходят из score.js уже посчитанными — здесь
 * только вёрстка, чтобы правила начисления жили в одном месте.
 */
function fillScore(final, best, record) {
  ui.veilScore.dataset.rank = final.rank;
  ui.rankLetter.textContent = final.rank;

  ui.scoreLines.innerHTML = final.lines
    .map((line) => `<li><span>${line.label}</span><b>${line.value ? '+' + line.value : '—'}</b></li>`)
    .join('');

  ui.scoreTotal.textContent = final.total;

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

function controlsHint() {
  return input.isTouch() || matchMedia('(pointer: coarse)').matches
    ? 'ЛЕВЫЙ ПАЛЕЦ ВЕДЁТ. ПРАВЫЙ ЦЕЛИТ И БЬЁТ САМ, КОГДА ЦЕЛЬ ПОД ПРИЦЕЛОМ. КНОПКИ СПРАВА — ВЗЯТЬ И БРОСИТЬ.'
    : 'WASD — ИДТИ. ← РУКА, → НОГА, ↑ БРОСОК. РУКА БЬЁТ НОГУ, НОГА — БРОСОК, БРОСОК — РУКУ. ТУСКЛОЕ КОЛЬЦО — СТОЙКА, В НЕЁ БИТЬ БЕСПОЛЕЗНО; ЯРКОЕ С ДУГОЙ — ЗАМАХ, ВОТ ТУТ И ОТВЕЧАЙ ТЕМ, ЧТО ЕГО БЬЁТ. ПРОБЕЛ — ВЗЯТЬ ИЛИ БРОСИТЬ ОРУЖИЕ. R — ЗАНОВО.';
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
  for (const code of Object.keys(MOVE_KEYS)) {
    if (input.tookKey(code)) {
      intent.move = MOVE_KEYS[code];
      intent.attack = true;
    }
  }

  const fired = input.tookKey('Fire') || input.tookKey('KeyJ');
  intent.attack = intent.attack || fired || raw.attackHeld;

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
    ui.moves.hidden = !bare;
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
  const dt = Math.min(0.05, (now - previous) / 1000);
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
    /* После смерти перезапускает всё, что под рукой: R, пробел, удар. */
    if (restart || input.tookKey('Fire') || input.tookKey('Space')
      || input.tookKey('ArrowLeft') || input.tookKey('KeyJ')) {
      startLevel(level, { silent: true });
    }
  } else if (restart && (scene === 'play' || scene === 'pause')) {
    startLevel(level, { silent: true });
  }

  if (world) {
    /* Камера смотрит чуть вперёд по прицелу и догоняет быстро: на этой
       скорости мягкое слежение отстаёт и игрок упирается в край кадра. */
    const player = world.player;
    const lead = 60;
    view.x += (player.x + Math.cos(player.angle) * lead - view.x) * Math.min(1, dt * 13);
    view.y += (player.y + Math.sin(player.angle) * lead - view.y) * Math.min(1, dt * 13);
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

  if (scene === 'call') startLevel(level);
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

document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene === 'play') pauseScreen();
});

/* Первое касание экрана разрешает звук: без жеста браузер его не пустит. */
/* Кадр дышит в такт музыки: подписываемся один раз при старте. */
audio.onBeat(() => { if (world) world.fx.beat = 1; });

const wake = () => { audio.unlock(); window.removeEventListener('pointerdown', wake); };
window.addEventListener('pointerdown', wake);

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
