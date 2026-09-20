/*
 * HOTLINE ABAKAN — процедурные этажи после ручной кампании.
 *
 * Генератор намеренно смешивает два подхода:
 *   1) граф комнат гарантирует связность, основной путь и короткие петли;
 *   2) каждая комната получает игровую роль (арена, перекрёстный огонь,
 *      оружейная, стекло, засада...), чтобы случайность не означала
 *      «одинаковые прямоугольники с рандомными врагами».
 *
 * Это тот же формат уровня, что и у CAMPAIGN: результат можно кодировать,
 * сохранять и пересылать обычной ссылкой.
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

const THEME_NAMES = [
  'БАР', 'СЕРВЕРНАЯ', 'ДВОР', 'КВАРТИРА',
  'ГАРАЖИ', 'РЫНОК', 'ДК', 'ПОЧТА',
];

const CALLS = [
  'Автоответчик снова мигает. Адрес новый, правило старое: стало тихо — уходи.',
  'Дальше карты нет. Только адрес, ключ и люди, которые не ждут гостей.',
  'Ночь продолжается. Комнаты каждый раз другие — ошибки остаются твоими.',
  'Работа простая: войти, не остановиться, выйти. Остальное решишь внутри.',
  'Кто-то переставил мебель и привёл новых людей. Проверь, стало ли сложнее.',
];

const ROLES = ['rush', 'crossfire', 'glass', 'armory', 'duel', 'maze', 'quiet', 'breach', 'pinch', 'overwatch'];
const OFFSETS = [
  [-2, -2], [2, -2], [-2, 2], [2, 2],
  [-3, 0], [3, 0], [0, -2], [0, 2],
];

function key(room) { return `${room.rx},${room.ry}`; }
function edgeKey(a, b) {
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function neighbours(room, at) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = room.rx + dx;
    const ny = room.ry + dy;
    if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows) continue;
    out.push(at(nx, ny));
  }
  return out;
}

function graphDistances(rooms, edges, start) {
  const links = new Map(rooms.map((room) => [key(room), []]));
  for (const [a, b] of edges) {
    links.get(key(a)).push(b);
    links.get(key(b)).push(a);
  }
  const dist = new Map([[key(start), 0]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const room = queue[head];
    for (const next of links.get(key(room))) {
      if (dist.has(key(next))) continue;
      dist.set(key(next), dist.get(key(room)) + 1);
      queue.push(next);
    }
  }
  return dist;
}

function border(a, b) {
  if (a.rx === b.rx) {
    const lower = a.ry > b.ry ? a : b;
    return { x: lower.cx, y: lower.y0 - 1, horizontal: true };
  }
  const right = a.rx > b.rx ? a : b;
  return { x: right.x0 - 1, y: right.cy, horizontal: false };
}

function lane(room, x, y) {
  /* Крест от центра к каждой потенциальной двери всегда свободен. */
  return x === room.cx || y === room.cy;
}

function freeCells(map, room, { lanes = true } = {}) {
  const cells = [];
  for (let y = room.y0; y <= room.y1; y += 1) {
    for (let x = room.x0; x <= room.x1; x += 1) {
      if (map[y][x] !== '.') continue;
      if (!lanes && lane(room, x, y)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

function place(map, room, x, y, char, { keepLane = true } = {}) {
  if (x < room.x0 || x > room.x1 || y < room.y0 || y > room.y1) return false;
  if (map[y][x] !== '.') return false;
  if (keepLane && lane(room, x, y)) return false;
  map[y][x] = char;
  return true;
}

function paintRoom(map, room, role, random) {
  const cx = room.cx;
  const cy = room.cy;
  const put = (dx, dy, char) => place(map, room, cx + dx, cy + dy, char);

  switch (role) {
    case 'crossfire':
      put(-2, -2, '|'); put(2, 2, '|');
      put(-2, 2, '='); put(2, -2, '=');
      break;
    case 'glass':
      put(-2, -2, '|'); put(-1, -2, '|'); put(1, 2, '|'); put(2, 2, '|');
      put(-2, 2, ','); put(2, -2, ',');
      break;
    case 'armory':
      put(-2, -2, '='); put(2, -2, '='); put(-2, 2, '='); put(2, 2, '=');
      put(-3, 2, ','); put(3, -2, ',');
      break;
    case 'duel':
      put(-2, 0, ','); put(2, 0, ',');
      put(-2, -2, '='); put(2, 2, '=');
      break;
    case 'maze':
      put(-2, -2, '='); put(-2, -1, '=');
      put(2, 1, '='); put(2, 2, '=');
      put(-2, 2, '|'); put(2, -2, '|');
      break;
    case 'quiet':
      put(-2, -2, ','); put(-1, -2, ','); put(-2, -1, ',');
      put(2, 2, '=');
      break;
    case 'breach':
      /* Узкий вход + прозрачная угроза за ним: сначала читаешь дверь/стекло, потом врываешься. */
      put(-2, 0, '|'); put(2, 0, '|');
      put(-2, -2, '='); put(2, -2, '=');
      put(-3, 2, ','); put(3, 2, ',');
      break;
    case 'overwatch':
      /* Дальний прострел с укрытиями: игрок видит линию снайпера и выбирает окно для рывка. */
      put(-2, -2, '='); put(2, -2, '=');
      put(-3, 1, '|'); put(3, 1, '|');
      put(-1, 2, ','); put(1, 2, ',');
      break;
    case 'pinch':
      /* Две диагональные позиции вынуждают двигаться, а не держать один угол. */
      put(-2, -2, '='); put(2, 2, '=');
      put(-2, 2, '|'); put(2, -2, '|');
      put(0, -2, ','); put(0, 2, ',');
      break;
    case 'rush':
    default:
      put(-2, -2, '='); put(2, 2, '=');
      if (random() < 0.55) put(-2, 2, '=');
      break;
  }
}

function placeEnemySet(map, room, role, depth, random) {
  const cells = freeCells(map, room, { lanes: false });
  /*
   * Не только состав, но и позиция задаёт encounter. Случайность остаётся,
   * но сначала комнаты получают читаемую геометрию: crossfire/pinch тянут
   * врагов к разным краям, rush — ближе к центру, quiet — подальше.
   */
  const jitter = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, random()]));
  const scoreCell = (cell) => {
    const dx = Math.abs(cell.x - room.cx);
    const dy = Math.abs(cell.y - room.cy);
    const edge = dx + dy;
    if (role === 'crossfire' || role === 'pinch' || role === 'overwatch') return dx * 2 + dy + jitter.get(`${cell.x},${cell.y}`);
    if (role === 'breach' || role === 'glass') return dy * 1.4 + dx * .5 + jitter.get(`${cell.x},${cell.y}`);
    if (role === 'rush' || role === 'duel') return -edge + jitter.get(`${cell.x},${cell.y}`);
    if (role === 'quiet') return edge + jitter.get(`${cell.x},${cell.y}`);
    return jitter.get(`${cell.x},${cell.y}`);
  };
  cells.sort((a, b) => scoreCell(b) - scoreCell(a));

  let recipe;
  switch (role) {
    case 'crossfire': recipe = depth >= 3 ? ['s', 's', 'k'] : ['s', 'k']; break;
    case 'armory': recipe = depth >= 5 ? ['t', 's', 'k'] : ['t', 'k']; break;
    case 'duel': recipe = ['k', 'k', ...(depth >= 4 ? ['t'] : [])]; break;
    case 'maze': recipe = ['t', 'k', ...(depth >= 6 ? ['s'] : [])]; break;
    case 'quiet': recipe = [random() < 0.65 ? 'k' : 't']; break;
    case 'glass': recipe = ['s', ...(depth >= 3 ? ['k'] : [])]; break;
    case 'breach': recipe = depth >= 4 ? ['s', 'k', 't'] : ['s', 'k']; break;
    case 'pinch': recipe = depth >= 5 ? ['s', 's', 'k', 't'] : ['s', 'k', 't']; break;
    case 'overwatch': recipe = depth >= 7 ? ['q', 's', 'k'] : ['q', 'k']; break;
    case 'rush':
    default: recipe = ['t', 'k', ...(depth >= 2 ? ['k'] : []), ...(depth >= 7 ? ['t'] : [])];
  }

  const cap = Math.min(recipe.length, 1 + Math.floor(depth / 2) + 2);
  let placed = 0;
  for (let i = 0; i < cap && i < cells.length; i += 1) {
    const cell = cells[i];
    if (map[cell.y][cell.x] !== '.') continue;
    map[cell.y][cell.x] = recipe[i];
    placed += 1;
  }
  return placed;
}

function placeWeapon(map, room, role, depth, random) {
  const quiet = depth >= 4 ? ['b', 'n', 'r', 'o', 'l', 'c', 'h'] : ['b', 'n', 'r', 'o'];
  const guns = depth >= 5 ? ['p', 'p', 'g'] : ['p', 'g'];
  let choices = quiet;
  if (role === 'armory') choices = random() < 0.55 ? guns : quiet;
  else if (role === 'crossfire' && random() < 0.25) choices = guns;
  else if (random() > 0.34) return false;

  const cells = freeCells(map, room, { lanes: false });
  if (!cells.length) return false;
  const cell = cells[Math.floor(random() * cells.length)];
  map[cell.y][cell.x] = choices[Math.floor(random() * choices.length)];
  return true;
}

/*
 * depth — номер процедурного этажа после ручной кампании. Он влияет на
 * плотность и состав комнат, но не меняет базовые правила: один удар,
 * читаемые телеграфы, быстрый рестарт.
 */
export function generateLevel(seed = 1, { depth = 1 } = {}) {
  const random = seedRandom(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const w = GRID.cols * ROOM.w + 1;
  const h = GRID.rows * ROOM.h + 1;
  const map = Array.from({ length: h }, () => Array(w).fill('#'));

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

  /* Старт прыгает между углами: уже на входе меняется направление чтения карты. */
  const corners = [at(0, 0), at(GRID.cols - 1, 0), at(0, GRID.rows - 1), at(GRID.cols - 1, GRID.rows - 1)];
  const startRoom = pick(corners);

  /* Рандомизированный Prim: связный остов, затем короткие петли для обходов. */
  const linked = new Set([key(startRoom)]);
  const edges = [];
  const edgeSeen = new Set();
  const addEdge = (a, b) => {
    const ek = edgeKey(a, b);
    if (edgeSeen.has(ek)) return false;
    edgeSeen.add(ek);
    edges.push([a, b]);
    return true;
  };

  while (linked.size < rooms.length) {
    const frontier = [];
    for (const room of rooms) {
      if (!linked.has(key(room))) continue;
      for (const next of neighbours(room, at)) {
        if (!linked.has(key(next))) frontier.push([room, next]);
      }
    }
    const [from, to] = pick(frontier);
    linked.add(key(to));
    addEdge(from, to);
  }

  const loopChance = Math.min(0.52, 0.24 + depth * 0.025);
  for (const room of rooms) {
    for (const next of neighbours(room, at)) {
      if ((next.rx < room.rx) || (next.rx === room.rx && next.ry < room.ry)) continue;
      if (random() < loopChance) addEdge(room, next);
    }
  }

  const distances = graphDistances(rooms, edges, startRoom);
  const exitRoom = rooms.reduce((best, room) => (
    (distances.get(key(room)) || 0) > (distances.get(key(best)) || 0) ? room : best
  ), startRoom);

  for (const [a, b] of edges) {
    const gap = border(a, b);
    map[gap.y][gap.x] = random() < 0.62 ? '+' : '.';
    /* Некоторые связи шире одной клетки: комнаты читаются менее «решёткой». */
    if (map[gap.y][gap.x] === '.' && random() < 0.45) {
      const nx = gap.x + (gap.horizontal ? 1 : 0);
      const ny = gap.y + (gap.horizontal ? 0 : 1);
      if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1) map[ny][nx] = '.';
    }
  }

  /* Сначала роли и обстановка, потом актёры: encounter строится вокруг пространства. */
  const roomRoles = new Map();
  for (const room of rooms) {
    if (room === startRoom) { roomRoles.set(key(room), 'start'); continue; }
    if (room === exitRoom) { roomRoles.set(key(room), depth >= 4 ? 'crossfire' : 'rush'); continue; }
    const d = distances.get(key(room)) || 1;
    const weighted = d <= 1 ? ['quiet', 'duel', 'rush'] : ROLES;
    roomRoles.set(key(room), pick(weighted));
  }

  if (depth >= 3) {
    const required = depth >= 5
      ? (depth >= 7 ? ['quiet', 'armory', 'crossfire', 'rush', 'breach', 'pinch', 'overwatch'] : ['quiet', 'armory', 'crossfire', 'rush', 'breach', 'pinch'])
      : ['quiet', 'armory', 'crossfire', 'rush'];
    const candidates = rooms
      .filter(room => room !== startRoom && room !== exitRoom)
      .sort((a, b) => (distances.get(key(b)) || 0) - (distances.get(key(a)) || 0));
    const used = new Set();
    for (const role of required) {
      if ([...roomRoles.values()].includes(role)) continue;
      const counts = [...roomRoles.values()].reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, {});
      const room = candidates.find((candidate) => {
        if (used.has(key(candidate))) return false;
        const current = roomRoles.get(key(candidate));
        /* Не крадём единственный экземпляр уже гарантированной роли. */
        return !required.includes(current) || (counts[current] || 0) > 1;
      });
      if (!room) break;
      roomRoles.set(key(room), role);
      used.add(key(room));
    }
  }

  for (const room of rooms) {
    const role = roomRoles.get(key(room));
    if (role !== 'start') paintRoom(map, room, role, random);
  }

  map[startRoom.cy][startRoom.cx] = '@';
  map[exitRoom.cy][exitRoom.cx] = 'X';

  let enemies = 0;
  let weapons = 0;
  for (const room of rooms) {
    if (room === startRoom) continue;
    const role = roomRoles.get(key(room));
    const d = distances.get(key(room)) || 1;
    enemies += placeEnemySet(map, room, role, Math.max(1, depth + Math.floor(d / 3)), random);
    if (placeWeapon(map, room, role, depth, random)) weapons += 1;
  }

  /* В стартовой комнате всегда есть тихий выбор, но не гарантированное огнестрельное. */
  const startCells = freeCells(map, startRoom, { lanes: false });
  if (startCells.length) {
    const cell = startCells[Math.floor(random() * startCells.length)];
    map[cell.y][cell.x] = pick(depth >= 5 ? ['b', 'n', 'r', 'o', 'l', 'c', 'h'] : ['b', 'n', 'r', 'o']);
    weapons += 1;
  }

  const theme = Math.floor(random() * THEME_NAMES.length);
  const level = fromAscii(map.map((row) => row.join('')), { theme, track: theme % 2 });
  level.title = `${THEME_NAMES[theme]} · НОЧЬ ${Math.max(1, depth)}`;
  level.call = `${pick(CALLS)} Зерно ${seed}.`;
  level.seed = seed;
  level.depth = Math.max(1, depth);
  level.enemies = enemies;
  level.weapons = weapons;
  level.generator = 3;
  level.encounterArc = [...roomRoles.values()].reduce((acc, role) => {
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
  level.roomRoles = Object.fromEntries([...roomRoles.entries()]);
  return level;
}
