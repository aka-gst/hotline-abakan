/*
 * Выбор кадра из листа анимации.
 *
 * Единственная часть рисования, которую видно без браузера, — и потому
 * единственная, которую можно поймать числами. Промах здесь выглядит как
 * «персонаж дёргается» и ищется глазами полдня.
 */
import { pickFrame } from '../src/assets.js';

const ROWS = { idle: [0, 2], walk: [1, 4], attack: [2, 3], attack2: [3, 3], death: [4, 4] };
let failed = 0;

function check(name, ok, note = '') {
  if (!ok) failed += 1;
  console.log(` ${ok ? ' ok ' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
}

const still = pickFrame(ROWS, { moving: false }, 0);
check('покой берёт свой ряд', still.row === 0 && still.col === 0);

const walking = pickFrame(ROWS, { moving: true }, 0.2);
check('ходьба берёт свой ряд', walking.row === 1);

/* Цикл ходьбы обязан пройти все четыре кадра и вернуться в начало. */
const cycle = new Set();
for (let t = 0; t < 1; t += 0.01) cycle.add(pickFrame(ROWS, { moving: true }, t).col);
check('ходьба проходит весь цикл', cycle.size === 4, `кадров ${cycle.size}`);

const punch = pickFrame(ROWS, { attack: true }, 0, 0.5);
check('удар голыми руками — ряд удара', punch.row === 2 && punch.col === 1);

const swing = pickFrame(ROWS, { attack: 'second' }, 0, 0.9);
check('удар оружием — ряд замаха', swing.row === 3 && swing.col === 2);

/* Доля пройденного приходит из мира и может дойти до единицы. */
const last = pickFrame(ROWS, { attack: true }, 0, 1);
check('конец приёма не вылезает из ряда', last.col === 2, `колонка ${last.col}`);

const fall = pickFrame(ROWS, { dead: 0.99 }, 0);
check('смерть берёт последний кадр', fall.row === 4 && fall.col === 3);

/* Неполный лист — обычное дело: графику вставляют по частям. */
const partial = pickFrame({ idle: [0, 1] }, { moving: true }, 0.4);
check('без ряда ходьбы падаем в покой', partial.row === 0 && partial.col === 0);
check('без листа вовсе — первый кадр', pickFrame(null, { moving: true }, 5).col === 0);

/* Соседи не должны шагать в ногу. */
const a = pickFrame(ROWS, { moving: true, offset: 0 }, 0.05);
const b = pickFrame(ROWS, { moving: true, offset: 2 }, 0.05);
check('смещение разводит фазы соседей', a.col !== b.col);

console.log(failed ? `\nПРОВАЛЕНО ПРОВЕРОК: ${failed}` : '\nвыбор кадра работает');
process.exit(failed ? 1 : 0);
