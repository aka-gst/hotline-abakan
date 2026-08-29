/*
 * Вырезать фон по ключевому цвету: `node tools/cutkey.mjs вход.png [выход.png]`.
 *
 * Генераторы плохо отдают прозрачность и хорошо — сплошную заливку.
 * Поэтому в заказе на графику разрешено прислать спрайт на ядовито-розовом
 * `#FF00FF`: цвет, которого нет ни в одной нашей палитре, а значит его
 * можно снять машинально и без разбирательств, что тут фон, а что рисунок.
 *
 * Пиксели, близкие к ключевому, становятся прозрачными; края, где розовый
 * подмешался в контур, обесцвечиваются — иначе вокруг спрайта остаётся
 * розовая кайма, которую в игре видно.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readPng, writePng } from '../tests/png.mjs';

const [input, output = input.replace(/\.png$/i, '-cut.png')] = process.argv.slice(2);
if (!input) {
  console.log('нужен путь к файлу: node tools/cutkey.mjs вход.png [выход.png]');
  process.exit(2);
}

const KEY = [255, 0, 255];
const GONE = 90;   /* ближе этого к ключевому — фон */
const EDGE = 190;  /* дальше этого — рисунок, трогать не надо */

const image = readPng(readFileSync(input));
let cut = 0;
let cleaned = 0;

for (let i = 0; i < image.rgba.length; i += 4) {
  const r = image.rgba[i]; const g = image.rgba[i + 1]; const b = image.rgba[i + 2];
  const away = Math.hypot(r - KEY[0], g - KEY[1], b - KEY[2]);
  if (away < GONE) {
    image.rgba[i + 3] = 0;
    cut += 1;
  } else if (away < EDGE) {
    /* Полурозовый край: гасим розовое, оставляя собственный цвет пикселя. */
    image.rgba[i] = Math.min(r, Math.round((r + g + b) / 3) + 40);
    image.rgba[i + 2] = Math.min(b, Math.round((r + g + b) / 3) + 40);
    cleaned += 1;
  }
}

writeFileSync(output, writePng(image));
const total = image.width * image.height;
console.log(`${output} — ${image.width}×${image.height}, снято ${Math.round(cut / total * 100)}% фона`
  + `${cleaned ? `, поправлено краёв: ${cleaned}` : ''}`);
