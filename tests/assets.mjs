/*
 * Приёмка графики: `node tests/assets.mjs [папка]`.
 *
 * Три поставки подряд приходили с безупречной геометрией и пустым нутром:
 * лист персонажа, где все тридцать кадров — один и тот же тёмный овал в
 * три цвета, и тайлсет, где шестьдесят четыре плитки залиты одной
 * фиолетовой краской. Разница видна за секунду, но только если открыть
 * файл глазами; движок молча кладёт такое поверх честной процедурной
 * графики и делает игру хуже.
 *
 * Поэтому приёмка считает, а не смотрит. Кадр, не отличающийся от
 * соседнего, анимацией не является. Плитка «дверь», совпадающая с
 * плиткой «пол», дверью не является. Силуэт в три цвета человеком не
 * является — у нарисованного человека их два десятка.
 *
 * `--sam` проверяет саму проверку: собирает заведомо годный лист и
 * заведомо пустой и убеждается, что первый принят, а второй забракован.
 */
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPng, writePng, cell, apart, signature } from './png.mjs';

/* Пороги. Числа не с потолка: см. «Откуда пороги» в конце файла. */
const BLANK = 0.02;      // меньше 2% закрашенного — клетка пустая
const TONES = 3;         // меньше трёх цветов в кадре — заливка, а не рисунок
const RUGGED = 18;       // ниже — овал, а не человек: см. «Откуда пороги»
const MOVED = 0.25;      // соседние кадры ряда должны отличаться хотя бы так
const TILE_APART = 8;    // пол, стена, дверь и выход — заметно разные
const TILE_SAME = 3;     // ближе этого две плитки считаем одной

/* Плитки, которые кладутся поверх пола, а не вместо него: у них прозрачно
   всё, кроме самой двери, кромки или трубы. Пустыми они быть могут. */
const OVERLAY = new Set(['wall_edge', 'wall_corner', 'door_h', 'door_v', 'pipe', 'rug', 'vent']);

/*
 * Брак и замечание — разные вещи.
 *
 * Пустая клетка, неотличимая дверь, кадр в одну краску — с этим играть
 * нельзя, это брак. А ряд покоя из двух одинаковых кадров всего лишь
 * значит, что персонаж не дышит: графика рабочая, замечание к следующему
 * заходу. Если валить приёмку и на том, и на другом, она быстро станет
 * тем, что все привыкли видеть красным и не читать.
 */
function makeReport() {
  const lines = [];
  let failed = 0;
  let noted = 0;
  return {
    add(name, ok, note, warn = '') {
      if (!ok) failed += 1;
      else if (warn) noted += 1;
      const mark = !ok ? 'БРАК' : warn ? 'ПРИМ' : ' ok ';
      const tail = note || warn;
      lines.push(` ${mark}  ${name}${tail ? ` — ${tail}` : ''}`);
    },
    get failed() { return failed; },
    get noted() { return noted; },
    get count() { return lines.length; },
    print() { for (const line of lines) console.log(line); },
  };
}

function load(root, rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return null;
  try { return readPng(readFileSync(path)); } catch (err) { return { error: err.message }; }
}

/* Медиана — чтобы один богатый кадр не вытянул лист из трёх цветов. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function checkSheet(report, root, rel, rows, size = 64, cols = 6) {
  const image = load(root, rel);
  if (!image) return;
  if (image.error) { report.add(rel, false, image.error); return; }
  const wantHigh = Math.max(...Object.values(rows).map(([row]) => row)) + 1;
  if (image.width !== cols * size || image.height !== wantHigh * size) {
    report.add(rel, false, `размер ${image.width}×${image.height}, ждали ${cols * size}×${wantHigh * size}`);
    return;
  }

  const blank = [];
  const still = [];
  const tones = [];
  const rugged = [];
  let frames = 0;
  for (const [name, [row, count]] of Object.entries(rows)) {
    const cells = [];
    for (let x = 0; x < count; x += 1) {
      const c = cell(image, x, row, size);
      frames += 1;
      cells.push(c);
      tones.push(c.tones);
      if (c.painted > size * size * BLANK) rugged.push(c.rugged);
      if (c.painted < size * size * BLANK) blank.push(`${name}[${x}]`);
    }
    const moves = cells.slice(1).map((c, i) => apart(c, cells[i]));
    if (count > 1 && Math.max(...moves) < MOVED) still.push(name);
  }

  const palette = median(tones);
  const shape = median(rugged) || 0;
  report.add(`${rel}: ${frames} кадров, цветов ${palette}, изрезанность ${shape.toFixed(0)}`,
    blank.length === 0 && palette >= TONES && shape >= RUGGED,
    [blank.length ? `пустые: ${blank.join(', ')}` : '',
      palette < TONES ? 'заливка вместо рисунка' : '',
      shape < RUGGED ? 'овал вместо человека' : ''].filter(Boolean).join('; '),
    still.length ? `не двигается: ${still.join(', ')}` : '');
}

function checkTiles(report, root, rel, map, size = 64) {
  const image = load(root, rel);
  if (!image) return;
  if (image.error) { report.add(rel, false, image.error); return; }

  const cells = new Map();
  const blank = [];
  for (const [name, [x, y]] of Object.entries(map)) {
    const c = cell(image, x, y, size);
    /* Накладные плитки прозрачны почти целиком — им хватает и десятой доли. */
    const need = OVERLAY.has(name) ? 0.03 : 0.5;
    if (c.painted < size * size * need) blank.push(name);
    cells.set(name, c);
  }

  /* Сколько на самом деле разных плиток: близкие считаем одной. */
  const groups = [];
  for (const c of cells.values()) {
    if (!groups.some((g) => apart(g, c) < TILE_SAME)) groups.push(c);
  }

  /* Эти четыре обязаны отличаться — на них держится читаемость этажа. */
  const key = ['floor', 'wall_body', 'door_h', 'exit'].filter((n) => cells.has(n));
  const same = [];
  for (let i = 0; i < key.length; i += 1) {
    for (let j = i + 1; j < key.length; j += 1) {
      if (apart(cells.get(key[i]), cells.get(key[j])) < TILE_APART) same.push(`${key[i]}=${key[j]}`);
    }
  }

  report.add(`${rel}: ${cells.size} плиток, различных ${groups.length}`,
    same.length === 0 && blank.length === 0 && groups.length >= cells.size * 0.7,
    [blank.length ? `прозрачные: ${blank.join(', ')}` : '',
      same.length ? `не отличить: ${same.join(', ')}` : '',
      groups.length < cells.size * 0.7 ? 'плитки повторяются' : ''].filter(Boolean).join('; '));
}

function checkSingle(report, root, rel, min = BLANK) {
  const image = load(root, rel);
  if (!image) return;
  if (image.error) { report.add(rel, false, image.error); return; }
  let painted = 0;
  for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i] > 8) painted += 1;
  const share = painted / (image.width * image.height);
  report.add(`${rel}: ${image.width}×${image.height}`, share >= min, share < min ? 'почти пустая' : '');
}

export function inspect(root) {
  const report = makeReport();
  const manifestPath = join(root, 'manifest.json');
  if (!existsSync(manifestPath)) {
    report.add('manifest.json', false, 'манифеста нет');
    return report;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const spec of Object.values(manifest.tiles || {})) {
    if (spec && typeof spec.map === 'object') checkTiles(report, root, spec.image, spec.map, spec.size || 64);
  }
  for (const spec of Object.values(manifest.actors || {})) {
    const rel = typeof spec === 'string' ? spec : spec.image;
    if (spec && spec.rows) checkSheet(report, root, rel, spec.rows, spec.size || 64, spec.cols || 6);
    else if (rel) checkSingle(report, root, rel);
  }
  for (const group of ['items', 'props', 'moves', 'fx', 'ui']) {
    const seen = [];
    for (const spec of Object.values(manifest[group] || {})) {
      const rel = typeof spec === 'string' ? spec : spec?.image;
      if (!rel || !rel.endsWith('.png')) continue;
      checkSingle(report, root, rel);
      const image = load(root, rel);
      if (image && !image.error) seen.push({ rel, image, sign: signature(image) });
    }
    /*
     * Разные вещи обязаны выглядеть по-разному. В одной поставке нож,
     * обрез, труба и катана оказались одним и тем же файлом — четыре
     * предмета, отличающиеся именем. Сравниваем только одинаковые по
     * размеру: картинки разных габаритов и так ни с чем не спутать.
     */
    const twins = [];
    for (let i = 0; i < seen.length; i += 1) {
      for (let j = i + 1; j < seen.length; j += 1) {
        const a = seen[i];
        const b = seen[j];
        if (a.image.width !== b.image.width || a.image.height !== b.image.height) continue;
        if (apart(a.sign, b.sign) < 2) twins.push(`${a.rel} = ${b.rel}`);
      }
    }
    if (twins.length) {
      report.add(`${group}: ${seen.length} файлов`, false,
        `одно и то же под разными именами: ${twins.slice(0, 4).join(', ')}`
        + (twins.length > 4 ? ` и ещё ${twins.length - 4}` : ''));
    }
  }
  return report;
}

/* --- проверка проверки ------------------------------------------------ */

const ROWS = { idle: [0, 2], walk: [1, 4], attack: [2, 3], attack2: [3, 3], death: [4, 4] };

function paint(width, height, draw) {
  const rgba = Buffer.alloc(width * height * 4);
  draw((x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = (y * width + x) * 4;
    rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = a;
  });
  return writePng({ width, height, rgba });
}

/*
 * Годный лист: в каждом кадре своя поза, полтора десятка оттенков и
 * силуэт с руками и ногами — то есть изрезанный, а не круглый. Раньше
 * здесь был залитый прямоугольник, и он же проваливал проверку на овал:
 * образец годного обязан быть годным по всем правилам сразу, иначе
 * проверка проверяет не то, что думает.
 */
function goodSheet() {
  return paint(384, 320, (dot) => {
    for (const [, [row, count]] of Object.entries(ROWS)) {
      for (let f = 0; f < count; f += 1) {
        const ox = f * 64;
        const oy = row * 64;
        const ink = (x, y, seed) => {
          const shade = (x * 3 + y * 5 + f * 17 + row * 29 + seed) % 24;
          dot(ox + x, oy + y, 20 + shade * 4, 60 + shade * 6, 30 + shade * 3);
        };
        /* туловище */
        for (let y = 24; y < 44; y += 1) for (let x = 26; x < 40; x += 1) ink(x, y, 0);
        /* голова */
        for (let y = 16; y < 25; y += 1) for (let x = 29; x < 37; x += 1) ink(x, y, 7);
        /* руки: одна вытянута вперёд и меняет длину от кадра к кадру */
        for (let x = 40; x < 48 + f * 2; x += 1) for (let y = 28; y < 32; y += 1) ink(x, y, 3);
        for (let x = 20; x < 26; x += 1) for (let y = 30 + (f % 2); y < 34 + (f % 2); y += 1) ink(x, y, 5);
        /* ноги */
        for (let y = 44; y < 52; y += 1) for (let x = 27; x < 31; x += 1) ink(x, y, 11);
        for (let y = 44; y < 50 + (f % 3); y += 1) for (let x = 35; x < 39; x += 1) ink(x, y, 13);
      }
    }
  });
}

/* Брак: тот самый тёмный овал в три цвета, одинаковый во всех кадрах. */
function blobSheet() {
  return paint(384, 320, (dot) => {
    for (const [, [row, count]] of Object.entries(ROWS)) {
      for (let f = 0; f < count; f += 1) {
        for (let y = 12; y < 52; y += 1) {
          for (let x = 16; x < 48; x += 1) {
            const inside = ((x - 32) / 16) ** 2 + ((y - 32) / 20) ** 2 < 1;
            if (inside) dot(f * 64 + x, row * 64 + y, 18, 35, 26);
          }
        }
      }
    }
  });
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'udar-assets-'));
  mkdirSync(join(root, 'actors'));
  const manifest = { actors: { player: { image: 'actors/player.png', size: 64, cols: 6, rows: ROWS } } };
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));

  writeFileSync(join(root, 'actors/player.png'), goodSheet());
  const good = inspect(root).failed === 0;

  writeFileSync(join(root, 'actors/player.png'), blobSheet());
  const bad = inspect(root).failed === 1;

  console.log(` ${good ? ' ok ' : 'БРАК'}  нарисованный лист приёмку проходит`);
  console.log(` ${bad ? ' ok ' : 'БРАК'}  пустой силуэт приёмку не проходит`);
  return good && bad ? 0 : 1;
}

/* --- запуск ----------------------------------------------------------- */

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv.includes('--sam')) {
  console.log('ПРИЁМКА ПРОВЕРЯЕТ САМУ СЕБЯ\n');
  process.exit(selfTest());
} else {
  const root = process.argv[2] || join(here, '..', 'assets');
  console.log(`ПРИЁМКА ГРАФИКИ: ${root}\n`);
  const report = inspect(root);
  report.print();
  console.log(`\nпроверено: ${report.count}, брак: ${report.failed}, замечаний: ${report.noted}`);
  process.exit(report.failed ? 1 : 0);
}

/*
 * Откуда пороги
 *
 * Замерено на присланном. Пустой тайлсет: все плитки различаются на 0.00
 * при двух цветах в клетке. Честный: соседние плитки в среднем на 25,
 * ключевые до 125. Порог «не отличить» — 8, вдесятеро выше шума и втрое
 * ниже реальной разницы.
 *
 * Порог по цветам сначала стоял на двенадцати: рассуждение было, что у
 * нарисованного человека их два десятка, а у пустого силуэта три. Оно
 * оказалось неверным дважды. Размытый восьмиугольник с неоновым свечением
 * набирал сто сорок оттенков на одних градиентах и проходил проверку.
 * Честный плоский пиксель-арт — четыре-пять цветов на кадр — не проходил.
 * Считать по палитре, человек ли на картинке, нельзя; это видно глазами и
 * только глазами. Осталась защита от заливки: меньше трёх цветов — не
 * рисунок.
 *
 * Изрезанность силуэта — квадрат периметра к площади. У круга это 4π,
 * около 12.6, и меньше не бывает ни у чего. Замерено на двух поставках:
 * тёмные овалы с неоновым ободком дают 10–16, крупные фигуры с руками и
 * ногами — 26–31. Порог 18 стоит ровно между. Это единственное число,
 * которое отличает нарисованного человека от заготовки; ни палитра, ни
 * число кадров этого не ловят — обе поставки по ним неразличимы.
 *
 * Порог движения снижен с 1.0 до 0.25: в поставке, где удар честно
 * нарисован тремя кадрами, соседние расходятся на 0.5, а одинаковые
 * копии дают ровно 0.00. Между этими числами и стоит порог.
 */
