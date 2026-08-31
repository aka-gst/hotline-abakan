/*
 * Измеритель звука.
 *
 * Считает рецепт из audio.js в сэмплы — той же математикой, какой его
 * играет браузер: та же экспоненциальная огибающая, тот же биквад, тот же
 * ход частоты. Отсюда берутся пик, средний уровень и длительность.
 *
 * Лежит в src, а не в прогоне, по той же причине, по которой рецепты
 * лежат данными: у числа должен быть один источник. Прогон меряет им, и
 * пульт живой страницы меряет им же — значит, офлайновые числа и то, что
 * отвечает игра, нельзя развести по недосмотру.
 *
 * Что этот измеритель НЕ доказывает: что звук дошёл до колонок. Он считает
 * ноты, а между нотами и ухом стоит ещё браузер, микшер и железо. Проверка
 * выхода — отдельная работа и отдельный измеритель.
 */

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

export function render(recipe, { silent = false } = {}) {
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

export function measure(samples) {
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

/* Удобная обёртка: имя рецепта → числа. */
export function measureRecipe(recipe) {
  return measure(render(recipe));
}
