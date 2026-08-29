/*
 * ОДИН УДАР — свои этажи.
 *
 * Случайный этаж существует ровно до того, как игрок закроет вкладку:
 * зерно нигде не остаётся, и «тот самый этаж, где я выбил ранг S» уже не
 * найти. Поэтому этажи можно оставлять себе — списком в браузере, вместе
 * с лучшим результатом на каждом.
 *
 * Хранится не сам уровень, а то, из чего он собирается: зерно для
 * сгенерированных, код для нарисованных. Зерно короче кода в двадцать раз,
 * и по нему этаж воспроизводится один в один.
 */

const KEY = 'udar-floors';
const LIMIT = 12;

function storage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;                  /* приватный режим — молча живём без списка */
  }
}

export function readFloors() {
  const box = storage();
  if (!box) return [];
  try {
    const list = JSON.parse(box.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => item && (item.seed || item.code)) : [];
  } catch (error) {
    return [];
  }
}

function writeFloors(list) {
  const box = storage();
  if (!box) return;
  try {
    box.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch (error) {
    /* место кончилось — список не главное, что есть в игре */
  }
}

/* Один и тот же этаж не заводится дважды: он узнаётся по зерну или коду. */
export function sameFloor(a, b) {
  if (!a || !b) return false;
  if (a.seed && b.seed) return a.seed === b.seed;
  return Boolean(a.code) && a.code === b.code;
}

export function saveFloor(entry) {
  if (!entry || (!entry.seed && !entry.code)) return readFloors();
  const list = readFloors().filter((item) => !sameFloor(item, entry));
  list.unshift({
    seed: entry.seed || null,
    code: entry.seed ? null : entry.code,
    title: entry.title || 'ЭТАЖ',
    score: entry.score || 0,
    rank: entry.rank || null,
    time: entry.time || 0,
  });
  writeFloors(list);
  return readFloors();
}

export function forgetFloor(entry) {
  writeFloors(readFloors().filter((item) => !sameFloor(item, entry)));
  return readFloors();
}

/* Отметить результат, если он лучше прежнего: список заодно служит дневником. */
export function markResult(entry, score, rank, time) {
  const list = readFloors();
  const found = list.find((item) => sameFloor(item, entry));
  if (!found || score <= found.score) return list;
  found.score = score;
  found.rank = rank;
  found.time = time;
  writeFloors(list);
  return readFloors();
}
