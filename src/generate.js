/*
 * ОДИН УДАР — этажи, которые собираются сами.
 *
 * Встроенных этажей мало, а нужен повод открыть игру завтра. Поэтому
 * этаж умеет собираться из зерна: одно число — один и тот же этаж у всех,
 * кто откроет ссылку. Своего формата у него нет: генератор выдаёт ту же
 * картинку из символов, что лежит в src/levels.js, и дальше её читает тот
 * же fromAscii. Значит, сгенерированный этаж кодируется, пересылается и
 * проверяется ровно как нарисованный руками.
 *
 * Комнаты режутся сеткой, а не деревом: сетка даёт узнаваемые прямоугольные
 * помещения с дверями — то, во что играют в этом жанре, — и её проще
 * держать связной. Связность здесь не пожелание: этаж, где до выхода не
 * дойти, — это не «сложный уровень», а сломанный.
 */

import { fromAscii } from './level.js';

export const GRID = { cols: 4, rows: 3 };
export const ROOM = { w: 9, h: 8 };

/* Зерно даёт один и тот же этаж всем, у кого он открылся. */
export function seedRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THEMES = ['БАР', 'СЕРВЕРНАЯ'];

const CALLS = [
  'Тебя ждут. Ключи под ковриком, оружие найдёшь на месте.',
  'Адрес тот же, люди новые. Убери всех и выйди тем же путём.',
  'Это автоответчик. Гости уже внутри, тебя не ждали.',
  'Работа простая: зайти, стало тихо, выйти.',
];

/*
 * Этаж.
 *
 * Возвращает уровень в том же виде, в каком его отдаёт CAMPAIGN, — с
 * заголовком и текстом звонка, чтобы карточка перед началом выглядела
 * так же, как у нарисованных вручную.
 */
export function generateLevel(seed = 1) {
  const random = seedRandom(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const range = (a, b) => a + Math.floor(random() * (b - a + 1));

  const w = GRID.cols * ROOM.w + 1;
  const h = GRID.rows * ROOM.h + 1;
  const map = Array.from({ length: h }, () => Array(w).fill('#'));

  /* Комнаты. Внутренности вырезаются, стены остаются общими для соседей. */
  const rooms = [];
  for (let ry = 0; ry < GRID.rows; ry += 1) {
    for (let rx = 0; rx < GRID.cols; rx += 1) {
      const x0 = rx * ROOM.w + 1;
      const y0 = ry * ROOM.h + 1;
      const x1 = x0 + ROOM.w - 2;
      const y1 = y0 + ROOM.h - 2;
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) map[y][x] = '.';
      rooms.push({ rx, ry, x0, y0, x1, y1, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1 });
    }
  }

  const at = (rx, ry) => rooms[ry * GRID.cols + rx];

  /*
   * Двери. Сначала остовное дерево — оно и делает этаж проходимым, — потом
   * несколько лишних проходов: без них этаж превращается в коридор с одним
   * маршрутом, а вся игра держится на том, что противника можно обойти.
   */
  const linked = new Set(['0,0']);
  const edges = [];
  const border = (a, b) => {
    if (a.rx === b.rx) {
      const y = Math.max(a.y1, b.y1) === b.y1 ? b.y0 - 1 : a.y0 - 1;
      return { x: a.cx, y };
    }
    const x = Math.max(a.x1, b.x1) === b.x1 ? b.x0 - 1 : a.x0 - 1;
    return { x, y: a.cy };
  };

  while (linked.size < rooms.length) {
    const frontier = [];
    for (const room of rooms) {
      if (!linked.has(`${room.rx},${room.ry}`)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = room.rx + dx;
        const ny = room.ry + dy;
        if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows) continue;
        if (linked.has(`${nx},${ny}`)) continue;
        frontier.push([room, at(nx, ny)]);
      }
    }
    const [from, to] = frontier[Math.floor(random() * frontier.length)];
    linked.add(`${to.rx},${to.ry}`);
    edges.push([from, to]);
  }

  for (const room of rooms) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = room.rx + dx;
      const ny = room.ry + dy;
      if (nx >= GRID.cols || ny >= GRID.rows) continue;
      if (random() < 0.35) edges.push([room, at(nx, ny)]);
    }
  }

  for (const [a, b] of edges) {
    const gap = border(a, b);
    map[gap.y][gap.x] = random() < 0.55 ? '+' : '.';
    /* Проход шириной в клетку легко пропустить взглядом: рядом с дверью
       вырезаем ещё одну, если это не ломает стену насквозь. */
    if (map[gap.y][gap.x] === '.' && random() < 0.5) {
      const side = a.rx === b.rx ? [1, 0] : [0, 1];
      const nx = gap.x + side[0];
      const ny = gap.y + side[1];
      if (nx < w - 1 && ny < h - 1) map[ny][nx] = '.';
    }
  }

  /* Вход и выход — в противоположных углах: этаж надо пройти, а не пересечь. */
  const startRoom = at(0, GRID.rows - 1);
  const exitRoom = at(GRID.cols - 1, 0);
  map[startRoom.cy][startRoom.cx] = '@';
  map[exitRoom.cy][exitRoom.cx] = 'X';

  /* Обстановка: мебель и ковры, но не в дверных проёмах и не на входе. */
  const free = (x, y) => map[y][x] === '.';
  for (const room of rooms) {
    const spots = range(0, 3);
    for (let i = 0; i < spots; i += 1) {
      const x = range(room.x0 + 1, room.x1 - 1);
      const y = range(room.y0 + 1, room.y1 - 1);
      if (!free(x, y)) continue;
      const what = random();
      map[y][x] = what < 0.45 ? '=' : what < 0.8 ? ',' : '|';
    }
  }

  /*
   * Кого поставить. Плотность растёт от входа: комната, где игрок
   * появляется, остаётся пустой — смерть на первой секунде не учит ничему.
   */
  const kinds = ['k', 'k', 't', 's'];
  let enemies = 0;
  for (const room of rooms) {
    if (room === startRoom) continue;
    const far = Math.abs(room.rx - startRoom.rx) + Math.abs(room.ry - startRoom.ry);
    const count = Math.min(3, range(far > 2 ? 1 : 0, far > 2 ? 3 : 2));
    for (let i = 0; i < count; i += 1) {
      const x = range(room.x0, room.x1);
      const y = range(room.y0, room.y1);
      if (!free(x, y)) continue;
      map[y][x] = pick(kinds);
      enemies += 1;
    }
  }

  /* Оружие: без него безоружный этаж превращается в марафон из двух ударов. */
  const guns = range(1, 2);
  const bats = range(1, 3);
  for (let i = 0; i < guns + bats; i += 1) {
    const room = rooms[Math.floor(random() * rooms.length)];
    const x = range(room.x0, room.x1);
    const y = range(room.y0, room.y1);
    if (!free(x, y)) continue;
    map[y][x] = i < guns ? 'p' : 'b';
  }

  const theme = seed % 2;
  const level = fromAscii(map.map((row) => row.join('')), { theme, track: theme });
  level.title = `${THEMES[theme]} · ЭТАЖ ${seed}`;
  level.call = pick(CALLS);
  level.seed = seed;
  level.enemies = enemies;
  return level;
}
