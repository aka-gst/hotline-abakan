/*
 * ОДИН УДАР — звук.
 *
 * Пока своих треков в игре нет, музыка собирается на месте из
 * осцилляторов: тот же размер, тот же темп, та же роль. Как только рядом
 * появится music/manifest.json с файлами, движок молча переключится на
 * них — код игры об этом не узнает.
 *
 * Так сделано не из любви к синтезу, а чтобы не проектировать звук
 * дважды: темп, громкость и переключение по уровням уже отлажены, файлу
 * останется занять готовое место.
 *
 * Формат манифеста:
 *
 *   { "tracks": [ { "id": 0, "title": "...", "file": "floor-1.mp3" } ] }
 *
 * id — тот самый номер трека, что лежит в коде уровня.
 */

const STEP_PER_BAR = 16;
const BPM = 108;

/*
 * Звуки как данные, а не как код.
 *
 * Каждый звук — список слоёв: тон с падающей частотой или отфильтрованный
 * шум. Раньше это были функции, дёргающие WebAudio напрямую, и проверить
 * их можно было только ушами: «функцию вызвали» ничего не говорит о том,
 * что из колонок вышел звук, и тем более о том, насколько он громкий
 * относительно соседних.
 *
 * Теперь рецепт один на две дороги: в браузере из него собираются узлы
 * WebAudio, в прогоне tests/audio.mjs он же считается в сэмплы, и по ним
 * меряются пик и разброс громкости между звуками. Разброс — та самая
 * жалоба «некоторые звуки оч громкие», которую иначе слышно раньше, чем
 * видно.
 */
export const RECIPES = {
  shot: [
    { kind: 'noise', duration: 0.16, filter: 'highpass', frequency: 900, gain: 0.387 },
    { kind: 'tone', type: 'square', from: 320, to: 60, duration: 0.14, gain: 0.246 },
  ],
  swing: [
    { kind: 'noise', duration: 0.16, filter: 'bandpass', frequency: 1500, gain: 0.861, q: 1.2 },
  ],
  /* Глухой удар в тело: низ даёт вес, шум — треск. Свист остаётся промахом. */
  impact: [
    { kind: 'tone', type: 'sine', from: 240, to: 55, duration: 0.2, gain: 0.48 },
    { kind: 'noise', duration: 0.14, filter: 'lowpass', frequency: 900, gain: 0.377 },
    { kind: 'tone', type: 'square', from: 110, to: 45, duration: 0.1, gain: 0.192 },
  ],
  /* Приём в приём: звонкий металлический щелчок, ни на что не похожий. */
  clash: [
    { kind: 'tone', type: 'square', from: 1400, to: 700, duration: 0.12, gain: 0.229 },
    { kind: 'noise', duration: 0.12, filter: 'highpass', frequency: 3000, gain: 0.213 },
  ],
  /* Твой удар погасили: глухой шлепок без звона. */
  parry: [
    { kind: 'noise', duration: 0.14, filter: 'lowpass', frequency: 800, gain: 0.545 },
    { kind: 'tone', type: 'sine', from: 260, to: 140, duration: 0.12, gain: 0.343 },
  ],
  knock: [
    { kind: 'tone', type: 'sine', from: 180, to: 50, duration: 0.18, gain: 0.467 },
    { kind: 'noise', duration: 0.1, filter: 'lowpass', frequency: 500, gain: 0.28 },
  ],
  kill: [
    { kind: 'noise', duration: 0.28, filter: 'lowpass', frequency: 1200, gain: 0.781 },
    { kind: 'tone', type: 'sawtooth', from: 140, to: 40, duration: 0.3, gain: 0.546 },
  ],
  /* Тихое убийство: короткий влажный срез вместо грохота. */
  backstab: [
    { kind: 'noise', duration: 0.16, filter: 'bandpass', frequency: 2600, gain: 0.324, q: 2 },
    { kind: 'tone', type: 'sine', from: 420, to: 90, duration: 0.18, gain: 0.325 },
  ],
  death: [
    { kind: 'tone', type: 'sawtooth', from: 420, to: 40, duration: 0.9, gain: 0.512 },
    { kind: 'noise', duration: 0.6, filter: 'lowpass', frequency: 700, gain: 0.41 },
  ],
  pickup: [
    { kind: 'tone', type: 'square', from: 620, to: 940, duration: 0.09, gain: 0.28 },
  ],
  dry: [
    { kind: 'noise', duration: 0.05, filter: 'highpass', frequency: 3000, gain: 0.253 },
  ],
  glass: [
    { kind: 'noise', duration: 0.5, filter: 'highpass', frequency: 2600, gain: 0.27, q: 6 },
  ],
  spot: [
    { kind: 'tone', type: 'square', from: 700, to: 1300, duration: 0.12, gain: 0.3 },
  ],
  /* Шаг: короткий низкий шлепок. Один только отфильтрованный шум на 380 Гц
     давал пик 0.009 — то есть тишину: фильтр съедал всё, что в него клали. */
  step: [
    { kind: 'tone', type: 'sine', from: 120, to: 60, duration: 0.05, gain: 0.287 },
    { kind: 'noise', duration: 0.05, filter: 'lowpass', frequency: 900, gain: 0.205 },
  ],
  exit: [
    { kind: 'tone', type: 'triangle', from: 520, to: 1040, duration: 0.35, gain: 0.367 },
  ],
  ui: [
    { kind: 'tone', type: 'square', from: 300, to: 520, duration: 0.06, gain: 0.22 },
  ],
  /* Дверь: тяжёлый деревянный хлопок, ни на что другое не похожий. */
  slam: [
    { kind: 'tone', type: 'sine', from: 150, to: 45, duration: 0.22, gain: 0.631 },
    { kind: 'noise', duration: 0.18, filter: 'lowpass', frequency: 700, gain: 0.473 },
  ],
  /* Оружие рассыпалось в руках. */
  broke: [
    { kind: 'noise', duration: 0.22, filter: 'highpass', frequency: 2400, gain: 0.246, q: 4 },
    { kind: 'tone', type: 'triangle', from: 900, to: 300, duration: 0.16, gain: 0.102 },
  ],
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let musicFilter = null;
  let sfxBus = null;
  let noiseBuffer = null;

  let manifest = null;
  let element = null;      /* когда играют настоящие файлы */
  let synth = null;        /* когда играет синтез */
  let muted = false;
  let started = false;
  let intensity = 0;
  let onBeat = null;

  /*
    На боевом сайте музыка включена с первой секунды — так
    задумано. А локальный предпросмотр открывается заново
    десятки раз за вечер, каждый раз на новом порту, и
    localStorage там всегда пустой: музыка запускалась бы
    снова и снова. Поэтому на localhost умолчание — тишина,
    а явно сохранённый выбор всё равно сильнее умолчания.
  */
  try {
    const saved = localStorage.getItem('avto-muted');

    const local =
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(
        window.location.hostname);

    muted = saved === null ? local : saved === '1';
  } catch (error) {
    muted = false;
  }

  fetch('music/manifest.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => { manifest = data && Array.isArray(data.tracks) ? data : null; })
    .catch(() => { manifest = null; });


  function ensure() {
    if (ctx) return ctx;

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;

    ctx = new Ctor();

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 18000;

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.42;
    musicBus.connect(musicFilter);
    musicFilter.connect(master);

    /*
     * Короткое эхо с затуханием. Без него синтез звучит впритык к уху и
     * давит — именно на это и жаловались. Свёртки нет, обходимся линией
     * задержки: дёшево, а воздух появляется.
     */
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.33;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const echo = ctx.createGain();
    echo.gain.value = 0.5;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 2200;

    musicBus.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(echoFilter);
    echoFilter.connect(echo);
    echo.connect(musicFilter);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(master);

    const frames = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }


  /* =======================================================
     ЭФФЕКТЫ
     ======================================================= */

  function noise(duration, filterType, frequency, gain, q) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    if (q) filter.Q.value = q;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(sfxBus);
    source.start();
    source.stop(ctx.currentTime + duration + 0.02);
  }

  function tone(type, from, to, duration, gain) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), ctx.currentTime + duration);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(envelope);
    envelope.connect(sfxBus);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  function sfx(name) {
    if (muted || !ensure() || ctx.state !== 'running') return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    for (const layer of recipe) {
      if (layer.kind === 'tone') tone(layer.type, layer.from, layer.to, layer.duration, layer.gain);
      else noise(layer.duration, layer.filter, layer.frequency, layer.gain, layer.q);
    }
  }


  /* =======================================================
     СИНТЕЗИРОВАННЫЙ ТРЕК
     ======================================================= */

  /*
   * Планировщик смотрит вперёд на 150 мс и раскладывает ноты по точному
   * времени AudioContext. Играть по setInterval «сейчас» нельзя: таймер
   * браузера гуляет на десятки миллисекунд, и ритм разъезжается.
   */
  function startSynth(trackId) {
    stopSynth();

    const seconds = 60 / BPM / 4;

    /*
     * Трек длиной в 32 такта, а не в четыре.
     *
     * Раньше он повторялся каждые несколько секунд и оттого давил: ухо
     * успевало выучить петлю и начинало её ждать. Теперь есть гармония из
     * четырёх ступеней, которая меняется раз в четыре такта, и разделы —
     * где-то только бас, где-то с барабаном, где-то пусто. Пустые такты
     * важнее полных: тишина и делает громкое громким.
     */
    const DEGREES = [0, -3, -5, -7];           /* минорный ход вниз */
    const SECTIONS = [
      /* такты 0–7 */   { drums: false, bass: true, arp: false, pad: true },
      /* такты 8–15 */  { drums: true, bass: true, arp: false, pad: true },
      /* такты 16–23 */ { drums: true, bass: true, arp: true, pad: false },
      /* такты 24–31 */ { drums: false, bass: false, arp: true, pad: true },
    ];

    const BASS = [
      [0, 0, 7, 0, 5, 0, 3, 0],
      [0, 3, 5, 3, 7, 5, 3, 0],
    ];

    const root = [55, 49, 58, 46][trackId % 4];
    let step = 0;
    let next = ctx.currentTime + 0.06;

    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.6);
    bus.connect(musicBus);

    function note(type, frequency, at, duration, gain, filter) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, at);

      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

      if (filter) {
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.setValueAtTime(filter, at);
        low.Q.value = 6;
        osc.connect(low);
        low.connect(envelope);
      } else {
        osc.connect(envelope);
      }

      envelope.connect(bus);
      osc.start(at);
      osc.stop(at + duration + 0.05);
    }

    /* Пад держит гармонию и даёт тот воздух, которого не хватало. */
    function pad(frequency, at, duration) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, at);
        osc.detune.setValueAtTime(detune, at);

        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(0.055, at + duration * 0.4);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.setValueAtTime(900 + intensity * 1200, at);

        osc.connect(low);
        low.connect(envelope);
        envelope.connect(bus);
        osc.start(at);
        osc.stop(at + duration + 0.1);
      }
    }

    function percussion(at, kind) {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      const envelope = ctx.createGain();
      let tail;

      if (kind === 'hat') {
        filter.type = 'highpass';
        filter.frequency.value = 8000;
        envelope.gain.setValueAtTime(0.075, at);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
        tail = 0.06;
      } else {
        filter.type = 'bandpass';
        filter.frequency.value = 1600;
        filter.Q.value = 0.7;
        envelope.gain.setValueAtTime(0.18, at);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        tail = 0.18;
      }

      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(bus);
      source.start(at);
      source.stop(at + tail);
    }

    /*
     * Доля отдаётся наружу: по ней кадр коротко «дышит». В Hotline Miami
     * ритм — не фон, а метроном движения, и когда картинка живёт в том же
     * такте, игрок начинает двигаться по нему, не думая об этом.
     */
    function beat(at) {
      if (!onBeat) return;
      const delay = Math.max(0, (at - ctx.currentTime) * 1000);
      setTimeout(() => { if (onBeat) onBeat(); }, delay);
    }

    function kick(at) {
      beat(at);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, at);
      osc.frequency.exponentialRampToValueAtTime(44, at + 0.13);

      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.55, at);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);

      osc.connect(envelope);
      envelope.connect(bus);
      osc.start(at);
      osc.stop(at + 0.32);
    }

    function schedule() {
      while (next < ctx.currentTime + 0.15) {
        const inBar = step % STEP_PER_BAR;
        const bar = Math.floor(step / STEP_PER_BAR) % 32;
        const section = SECTIONS[Math.floor(bar / 8)];
        const degree = DEGREES[Math.floor(bar / 4) % DEGREES.length];
        const base = root * Math.pow(2, degree / 12);

        if (section.pad && inBar === 0) pad(base * 2, next, seconds * 14);

        if (section.drums) {
          if (inBar === 0 || inBar === 6 || inBar === 10) kick(next);
          if (inBar === 8) percussion(next, 'snare');
          if (inBar % 4 === 2) percussion(next, 'hat');
        } else if (inBar === 0) {
          kick(next);
        }

        if (section.bass && inBar % 2 === 0) {
          const line = BASS[Math.floor(bar / 8) % BASS.length];
          const semitone = line[(inBar / 2) % line.length];
          note('sawtooth', base * Math.pow(2, semitone / 12), next, seconds * 1.6, 0.26,
            420 + intensity * 1100);
        }

        /* Аркада входит только в своей части — иначе она и есть то самое давление. */
        if (section.arp && inBar % 2 === 1) {
          const shape = [12, 15, 19, 22, 19, 15];
          const semitone = shape[Math.floor(step / 1) % shape.length];
          note('square', base * 2 * Math.pow(2, semitone / 12), next, seconds * 0.8,
            0.045 + intensity * 0.05, 2600);
        }

        next += seconds;
        step += 1;
      }
    }

    const timer = setInterval(schedule, 40);
    schedule();

    synth = {
      stop() {
        clearInterval(timer);
        try {
          bus.gain.cancelScheduledValues(ctx.currentTime);
          bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
          bus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
        } catch (error) { /* контекст уже закрыт */ }
      },
    };
  }

  function stopSynth() {
    if (!synth) return;
    synth.stop();
    synth = null;
  }


  /* =======================================================
     ТРЕК УРОВНЯ
     ======================================================= */

  function playTrack(trackId) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;

    const entry = manifest && manifest.tracks.find((track) => track.id === trackId);

    if (entry) {
      stopSynth();
      if (!element) {
        element = new Audio();
        element.loop = true;
        element.crossOrigin = 'anonymous';
        /*
         * Манифест может пережить сами файлы: в репозитории аудио не
         * версионируется, и в свежем клоне его нет. Тишина в этом случае
         * хуже синтеза — возвращаемся к нему, а не молчим.
         */
        element.addEventListener('error', () => {
          element = null;
          startSynth(trackId || 0);
        });
        const source = ctx.createMediaElementSource(element);
        source.connect(musicBus);
      }
      const file = `music/${entry.file}`;
      if (!element.src.endsWith(entry.file)) element.src = file;
      element.play().catch(() => { /* браузер ещё не отпустил автоплей */ });
      return;
    }

    if (element) { element.pause(); }
    startSynth(trackId || 0);
  }

  function stop() {
    stopSynth();
    if (element) element.pause();
    started = false;
  }

  /* В меню трек не выключается, а глохнет — как будто дверь в зал закрыли. */
  function setMenu(inMenu) {
    if (!ctx) return;
    const target = inMenu ? 420 : 18000;
    musicFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.15);
    musicBus.gain.setTargetAtTime(inMenu ? 0.32 : 0.55, ctx.currentTime, 0.15);
  }

  function setIntensity(value) { intensity = Math.max(0, Math.min(1, value)); }

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem('avto-muted', muted ? '1' : '0'); } catch (error) { /* приватный режим */ }
    if (!ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  }

  return {
    unlock, sfx, playTrack, stop, setMenu, setIntensity, setMuted,
    onBeat(callback) { onBeat = callback; },
    isMuted: () => muted,
    isPlaying: () => started,
    hasFiles: () => Boolean(manifest),
  };
}
