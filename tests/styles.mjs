/*
 * Повторы в стилях.
 *
 * Блок стилей паузы однажды размножился втрое: я вставлял его по якорю
 * `.hud-slot b`, а этот селектор встречается в файле три раза — один раз
 * глобально и дважды в медиазапросах. Две лишние копии легли ниже правила
 * «показать» и перекрыли его. Кнопки не было, притом что правило было
 * верным и стояло на месте.
 *
 * Урок шире одной кнопки: правка по неуникальному якорю не теряется, а
 * размножается, и побеждает последняя копия. Найти это глазами трудно —
 * файл длинный, копии далеко друг от друга и выглядят одинаково
 * правильными. Найти счётом легко: одинаковые блоки в одном файле почти
 * всегда ошибка.
 *
 * Проверка нарочно грубая: ловит только точные повторы селектора вместе с
 * телом. Одинаковый селектор с разными телами — это переопределение в
 * медиазапросе, законное и частое.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let failed = 0;

function check(name, ok, note = '') {
  if (!ok) failed += 1;
  console.log(` ${ok ? ' ok ' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
}

/* Комментарии выкидываем: в них живут объяснения, а не правила. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Разбор на блоки: селектор до «{», тело до парной «}». Вложенных правил
   в этом файле нет, кроме медиазапросов и кадров анимации, — их тела
   разбираются тем же счётчиком скобок. */
function blocks(css) {
  const out = [];
  let at = 0;
  while (at < css.length) {
    const open = css.indexOf('{', at);
    if (open < 0) break;
    const selector = css.slice(at, open).trim().split('\n').pop().trim();
    let depth = 1;
    let i = open + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    const body = css.slice(open + 1, i - 1);
    if (!selector.startsWith('@')) {
      out.push({ selector, body: body.replace(/\s+/g, ' ').trim() });
      at = i;
    } else {
      at = open + 1;                 /* внутрь медиазапроса */
    }
  }
  return out;
}

for (const file of readdirSync(root).filter((f) => f.endsWith('.css'))) {
  const rules = blocks(strip(readFileSync(join(root, file), 'utf8')));
  const seen = new Map();
  const twins = [];
  for (const rule of rules) {
    if (!rule.body) continue;
    /* Шаги анимации — не правила: одинаковый `from { opacity: 0 }` в
       разных @keyframes законен и встречается постоянно. */
    if (/^(from|to|\d+%)$/.test(rule.selector)) continue;
    const key = `${rule.selector}{${rule.body}}`;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count === 2) twins.push(`${rule.selector} (${rule.body.length} символов)`);
  }
  check(`${file}: ${rules.length} правил`, twins.length === 0,
    twins.length ? `повторяются целиком: ${twins.slice(0, 3).join('; ')}` : '');
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nповторов в стилях нет');
process.exit(failed ? 1 : 0);
