/*
 * Звук меряется выходом, а не вызовами.
 *
 * «Функцию дёрнули» ничего не говорит о том, что из колонок вышел звук, и
 * тем более о том, насколько он громкий относительно соседних. Поэтому
 * рецепты из src/audio.js здесь считаются в сэмплы — тем же способом, что
 * их играет браузер, только без браузера, — и по сэмплам меряются пик,
 * средний уровень и длительность.
 *
 * Главное число тут не пик отдельного звука, а разброс между звуками.
 * Ровно на этом ловится жалоба «некоторые звуки оч громкие»: её слышно
 * раньше, чем видно, и правится она одной константой, потому что звуки
 * синтезированные, а не записанные.
 *
 * Проверка проверяется поломкой: `node tests/audio.mjs --sam` зануляет
 * огибающую и убеждается, что тишина не проходит.
 */
import { RECIPES, wantsQuiet } from '../src/audio.js';

const RATE = 44100;
let failed = 0;

function check(name, ok, note = '') {
  if (!ok) failed += 1;
  console.log(` ${ok ? ' ok ' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
}

/* Одна ступень биквада по Роберту Брситоу-Джонсону: та же математика, что
   в BiquadFilterNode, иначе шум мерился бы неотфильтрованным. */
function biquad(type, freq, q) {
  const w = (2 * Math.PI * freq) / RATE;
  const cos = Math.cos(w);
  const sin = Math.sin(w);
  const alpha = sin / (2 * (q || 0.7071));
  let b0; let b1; let b2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  if (type === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
  } else {
    b0 = alpha; b1 = 0; b2 = -alpha;            /* bandpass */
  }

  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  return (x) => {
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2
      - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/* Осциллятор с той же экспоненциальной прогонкой частоты, что в браузере. */
function wave(type, phase) {
  if (type === 'sine') return Math.sin(phase);
  if (type === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
  if (type === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  const t = (phase / (2 * Math.PI)) % 1;        /* sawtooth */
  return 2 * t - 1;
}

/* Тот же ход огибающей: setValueAtTime + exponentialRampToValueAtTime к 0.0001. */
function envelopeAt(gain, t, duration, silent) {
  if (silent) return 0;
  const end = 0.0001;
  const done = Math.min(1, t / duration);
  return gain * ((end / gain) ** done);
}

function render(recipe, { silent = false } = {}) {
  const duration = Math.max(...recipe.map((l) => l.duration)) + 0.02;
  const frames = Math.ceil(duration * RATE);
  const out = new Float64Array(frames);

  for (const layer of recipe) {
    if (layer.kind === 'tone') {
      let phase = 0;
      for (let i = 0; i < frames; i += 1) {
        const t = i / RATE;
        if (t > layer.duration) break;
        const done = t / layer.duration;
        const freq = layer.from * ((Math.max(20, layer.to) / layer.from) ** done);
        phase += (2 * Math.PI * freq) / RATE;
        out[i] += wave(layer.type, phase) * envelopeAt(layer.gain, t, layer.duration, silent);
      }
    } else {
      const filter = biquad(layer.filter, layer.frequency, layer.q);
      /* Шум с постоянным зерном: прогон обязан давать одно и то же число. */
      let seed = 12345;
      for (let i = 0; i < frames; i += 1) {
        const t = i / RATE;
        if (t > layer.duration) break;
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const white = (seed / 0x3fffffff) - 1;
        out[i] += filter(white) * envelopeAt(layer.gain, t, layer.duration, silent);
      }
    }
  }
  return out;
}

function measure(samples) {
  let peak = 0;
  let sum = 0;
  let heard = 0;
  for (const value of samples) {
    const abs = Math.abs(value);
    if (abs > peak) peak = abs;
    sum += value * value;
    if (abs > 0.01) heard += 1;
  }
  return {
    peak,
    rms: Math.sqrt(sum / samples.length),
    seconds: heard / RATE,
  };
}

const db = (value) => 20 * Math.log10(Math.max(value, 1e-6));

/* --- немой запуск по адресу ------------------------------------------ */

/*
 * Кириллица в адресе приезжает закодированной: браузер превращает `?тихо`
 * в `?%D1%82%D0%B8%D1%85%D0%BE`. Сравнение по сырой строке этого не
 * видит, и параметр работал только латиницей — поймано замером на бою,
 * не глазами. Поэтому оба написания и обе формы проверяются здесь.
 */
const QUIET_CASES = [
  ['?тихо', true],
  ['?%D1%82%D0%B8%D1%85%D0%BE', true],
  ['?quiet', true],
  ['?QUIET', true],
  ['#тихо', true],
  ['?a=1&%D1%82%D0%B8%D1%85%D0%BE', true],
  ['?quiet=1', true],
  ['?quiet=true', true],
  ['?tiho', true],
  /* Обратный контроль: обычный адрес и коды уровней звук не глушат. */
  ['', false],
  ['?l=ABC', false],
  ['#l=GNcAUtjICCACSAD', false],
  ['?quietly', false],
  ['?disquiet', false],
  ['?тихони', false],
  ['?тихонько', false],
  ['?%D1%82%D0%B8%D1%85%D0%BE%D0%BD%D1%8C%D0%BA%D0%BE', false],
  /* Битый процент не должен ронять звук. */
  ['?%E0%A4%A', false],
];

{
  const wrong = QUIET_CASES.filter(([text, want]) => wantsQuiet(text) !== want);
  check('немой запуск понимает оба написания', wrong.length === 0,
    wrong.length ? wrong.map(([t]) => t || '(пусто)').join(', ') : `${QUIET_CASES.length} случаев`);
}

/* --- поломкой ------------------------------------------------------- */

if (process.argv.includes('--sam')) {
  console.log('ПРОВЕРКА ПРОВЕРЯЕТ САМУ СЕБЯ\n');
  const loud = measure(render(RECIPES.impact));
  const dead = measure(render(RECIPES.impact, { silent: true }));
  check('живой звук слышно', loud.peak > 0.05, `пик ${loud.peak.toFixed(3)}`);
  check('занулённая огибающая не проходит', dead.peak < 0.001, `пик ${dead.peak.toFixed(6)}`);
  process.exit(failed ? 1 : 0);
}

/* --- измерение ------------------------------------------------------ */

console.log('ЗВУК: пик, средний уровень, длительность\n');

const rows = [];
for (const [name, recipe] of Object.entries(RECIPES)) {
  const m = measure(render(recipe));
  rows.push({ name, ...m });
  console.log(`  ${name.padEnd(10)} пик ${m.peak.toFixed(3)}  ср ${m.rms.toFixed(4)}  ${m.seconds.toFixed(2)} с`);
}

const silent = rows.filter((r) => r.peak < 0.03);
check('\nкаждый звук слышно', silent.length === 0,
  silent.length ? `тихие: ${silent.map((r) => r.name).join(', ')}` : `${rows.length} штук`);

/* Разброс: между самым громким и самым тихим. Пороги взяты по замеру
   соседнего проекта, где жалоба «оч громкие» стоила 26.6 дБ. */
const peaks = rows.map((r) => r.peak);
const spread = db(Math.max(...peaks)) - db(Math.min(...peaks));
const loudest = rows.find((r) => r.peak === Math.max(...peaks));
const quietest = rows.find((r) => r.peak === Math.min(...peaks));
check('разброс громкости в пределах 12 дБ', spread < 12,
  `${spread.toFixed(1)} дБ: громче всех ${loudest.name}, тише всех ${quietest.name}`);

/* Ни один звук не должен клиппировать: сумма слоёв легко переваливает за
   единицу, и тогда в браузере он трещит. */
const clipping = rows.filter((r) => r.peak > 0.98);
check('ничего не клиппирует', clipping.length === 0,
  clipping.length ? clipping.map((r) => `${r.name} ${r.peak.toFixed(2)}`).join(', ') : '');

console.log(failed ? `\nПРОВАЛЕНО ПРОВЕРОК: ${failed}` : '\nзвук измерен');
process.exit(failed ? 1 : 0);
