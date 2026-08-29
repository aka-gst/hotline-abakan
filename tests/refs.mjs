/*
 * Оборванные ссылки в исходниках.
 *
 * Правка, которая убрала приёмы, вынесла из main.js константу MOVE_KEYS,
 * но оставила цикл, который по ней ходил. Node такой файл разбирает без
 * жалоб, все прогоны проходят — и игра падает на первом же кадре в
 * браузере. Ловится это за секунду, если знать где смотреть, и за
 * полчаса, если не знать.
 *
 * Проверок две.
 *
 * Первая: имена в ВЕРХНЕМ_РЕГИСТРЕ — это константы модуля. Если такое имя
 * в файле используется, оно должно быть в этом же файле объявлено или
 * импортировано. Обращения через точку (WEAPONS.bat) не в счёт: там
 * проверяется только само WEAPONS.
 *
 * Вторая ловит случай, на котором первая опозорилась. В main.js вызвали
 * beatNow из world.js и забыли его импортировать: имя строчное, под
 * первое правило не попало, прогоны прошли — а в браузере на каждой доле
 * музыки летела ошибка. Поэтому теперь собираются имена, которые модули
 * экспортируют, и любое их употребление в чужом файле без импорта
 * считается ошибкой.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
let failed = 0;

/* Строки и комментарии выкидываем: там свои слова, не имена. */
function strip(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(\\.|[^'\\])*'/g, "''")
    .replace(/"(\\.|[^"\\])*"/g, '""')
    .replace(/`(\\.|[^`\\])*`/g, '``')
    /* Классы символов в выражениях: /^[SABCD]$/ — это буквы, а не имя. */
    .replace(/\[[^\]\n]*\]/g, '[]');
}

/* Что вообще экспортируют модули игры: по этому списку ищется вторая
   ошибка — вызов чужой функции без импорта. */
const files = readdirSync(src).filter((f) => f.endsWith('.js'));
const exported = new Map();
for (const file of files) {
  const code = strip(readFileSync(join(src, file), 'utf8'));
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
    exported.set(m[1], file);
  }
}

for (const file of files) {
  const code = strip(readFileSync(join(src, file), 'utf8'));

  const known = new Set(['NaN', 'Infinity', 'JSON', 'Math', 'Image', 'Audio', 'Map', 'Set', 'Promise']);
  for (const m of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{2,})\b/g)) known.add(m[1]);
  for (const m of code.matchAll(/import\s*\{([^}]*)\}/g)) {
    for (const name of m[1].split(',')) known.add(name.trim().split(/\s+as\s+/).pop());
  }
  /* Поля объектов и ключи — не ссылки: { EXIT: 5 } объявляет, а не зовёт. */
  const declaredKeys = new Set([...code.matchAll(/\b([A-Z][A-Z0-9_]{2,})\s*:/g)].map((m) => m[1]));

  const missing = new Set();
  for (const m of code.matchAll(/(^|[^.\w$])([A-Z][A-Z0-9_]{2,})\b/gm)) {
    const name = m[2];
    if (!known.has(name) && !declaredKeys.has(name)) missing.add(name);
  }

  /* Чужие экспортированные имена: используются, но не импортированы. */
  const imported = new Set();
  for (const m of code.matchAll(/import\s*\{([^}]*)\}/g)) {
    for (const name of m[1].split(',')) imported.add(name.trim().split(/\s+as\s+/).pop());
  }
  const local = new Set([...code.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const borrowed = new Set();
  for (const [name, from] of exported) {
    if (from === file || imported.has(name) || local.has(name)) continue;
    /* Ищем вызов или упоминание не после точки: obj.beatNow не в счёт. */
    if (new RegExp(`(^|[^.\\w$])${name}\\s*\\(`, 'm').test(code)) borrowed.add(`${name} (из ${from})`);
  }

  if (missing.size || borrowed.size) {
    failed += 1;
    const notes = [];
    if (missing.size) notes.push(`не объявлено: ${[...missing].join(', ')}`);
    if (borrowed.size) notes.push(`вызвано без импорта: ${[...borrowed].join(', ')}`);
    console.log(` FAIL  src/${file} — ${notes.join('; ')}`);
  } else {
    console.log(`  ok   src/${file}`);
  }
}

console.log(failed ? `\nПРОВАЛЕНО ФАЙЛОВ: ${failed}` : '\nоборванных ссылок нет');
process.exit(failed ? 1 : 0);
