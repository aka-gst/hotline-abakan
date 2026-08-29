/*
 * ОДИН УДАР — картинки.
 *
 * Игра рисует себя примитивами и умеет так работать всегда. Если рядом
 * лежит assets/manifest.json, она берёт оттуда тайлы, спрайты и эффекты и
 * рисует ими; чего в манифесте нет — остаётся нарисованным кодом.
 *
 * Так сделано ради одного: графику можно вставлять по частям и в любом
 * порядке. Пришёл тайлсет — этаж стал другим, персонажи ещё старые, игра
 * при этом работает. Ни одного места, где отсутствие файла роняет кадр.
 */

/*
 * Какой кадр листа показать.
 *
 * Вынесено отдельной чистой функцией по одной причине: это единственное
 * место в рисовании, которое можно проверить без браузера, — и проверять
 * его надо, потому что промах здесь выглядит как «персонаж дёргается» и
 * ищется глазами полдня.
 *
 * Ходьба и покой идут по кругу от общих часов: тела в кадре не должны
 * шагать в ногу. Удар, наоборот, привязан к собственному ходу приёма —
 * иначе замах на экране разъедется с замахом в правилах.
 */
const IDLE_RATE = 2.5;
const WALK_RATE = 9;

export function pickFrame(rows, state = {}, time = 0, phase = 0) {
  if (!rows) return { row: 0, col: 0 };
  const has = (name) => Array.isArray(rows[name]) && rows[name][1] > 0;
  const pick = (name, col) => ({ row: rows[name][0], col: Math.max(0, Math.min(rows[name][1] - 1, col)) });

  if (state.dead && has('death')) return pick('death', Math.floor(state.dead * rows.death[1]));
  if (state.attack) {
    const name = state.attack === 'second' && has('attack2') ? 'attack2' : 'attack';
    if (has(name)) return pick(name, Math.floor(phase * rows[name][1]));
  }
  if (state.moving && has('walk')) {
    return pick('walk', Math.floor(time * WALK_RATE + (state.offset || 0)) % rows.walk[1]);
  }
  if (has('idle')) return pick('idle', Math.floor(time * IDLE_RATE + (state.offset || 0)) % rows.idle[1]);
  return { row: 0, col: 0 };
}

export function createAssets(base = 'assets/') {
  const images = new Map();
  let manifest = null;
  let loaded = false;

  function image(path) {
    if (!path) return null;
    return images.get(path) || null;
  }

  function fetchImage(path) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images.set(path, img); resolve(img); };
      /* Битый или отсутствующий файл — не повод падать: рисуем как раньше. */
      img.onerror = () => resolve(null);
      img.src = base + path;
    });
  }

  /* Собираем все пути манифеста, какой бы формы ни была запись. */
  function paths(node, out = []) {
    if (!node) return out;
    if (typeof node === 'string') {
      if (/\.(png|jpg|webp)$/i.test(node)) out.push(node);
      return out;
    }
    if (typeof node !== 'object') return out;
    if (typeof node.image === 'string') out.push(node.image);
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') paths(value, out);
      else if (typeof value === 'string' && /\.(png|jpg|webp)$/i.test(value)) out.push(value);
    }
    return out;
  }

  async function boot() {
    try {
      const response = await fetch(base + 'manifest.json', { cache: 'no-cache' });
      if (!response.ok) return false;
      manifest = await response.json();
    } catch (error) {
      return false;                 /* картинок нет — это норма */
    }

    const list = [...new Set(paths(manifest))];
    await Promise.all(list.map(fetchImage));
    for (const [name, spec] of Object.entries(manifest.actors || {})) {
      if (spec && spec.rows && !worthDrawing(spec)) {
        images.delete(spec.image);
        console.warn(`лист ${name} пустой — рисуем кодом`);
      }
    }
    loaded = images.size > 0;
    return loaded;
  }

  /*
   * Быстрая приёмка листа прямо в браузере.
   *
   * Три поставки подряд приходили с правильными размерами и пустым
   * нутром: тридцать одинаковых силуэтов в три цвета. Движок клал такое
   * поверх процедурной графики и делал игру хуже, молча. Тот же счёт, что
   * в tests/assets.mjs, только короче: если в кадре нет двух десятков
   * оттенков или ходьба не двигается — лист не берём.
   *
   * Проверка стоит один кадр на старте и снимает целый класс поставок,
   * которые выглядят как графика, но графикой не являются.
   */
  function worthDrawing(spec) {
    const img = image(spec.image);
    if (!img) return false;
    const size = spec.size || 64;
    const board = document.createElement('canvas');
    board.width = img.width;
    board.height = img.height;
    const ctx = board.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const read = (col, row) => {
      const data = ctx.getImageData(col * size, row * size, size, size).data;
      const tones = new Set();
      let painted = 0;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        painted += 1;
        ink += data[i] + data[i + 1] + data[i + 2];
        tones.add((data[i] >> 3 << 10) | (data[i + 1] >> 3 << 5) | (data[i + 2] >> 3));
      }
      return { tones: tones.size, painted, ink };
    };

    const walk = spec.rows.walk;
    const first = read(0, spec.rows.idle ? spec.rows.idle[0] : 0);
    if (first.painted < size * size * 0.02 || first.tones < 12) return false;
    if (walk && walk[1] > 1) {
      const a = read(0, walk[0]);
      const b = read(1, walk[0]);
      if (a.painted === b.painted && a.ink === b.ink) return false;
    }
    return true;
  }

  const THEME_KEYS = ['bar', 'server'];

  return {
    boot,
    get ready() { return loaded; },

    /* Тайлсет темы: отдаёт картинку, размер клетки и карту имён. */
    tiles(themeIndex) {
      const key = THEME_KEYS[themeIndex] || THEME_KEYS[0];
      const set = manifest && manifest.tiles && manifest.tiles[key];
      const img = set && image(set.image);
      return img ? { image: img, size: set.size || 64, map: set.map || {} } : null;
    },

    /*
     * Персонаж. Поддержаны обе формы записи: одиночная картинка, как в
     * первой поставке, и лист анимации из шести колонок и пяти рядов,
     * как просит задание. Одиночная отдаётся как есть, лист — вместе с
     * раскладкой, чтобы рисующий сам выбрал ряд и кадр.
     */
    actor(name) {
      const spec = manifest && manifest.actors && manifest.actors[name];
      if (!spec) return null;
      if (typeof spec === 'string') {
        const img = image(spec);
        return img ? { image: img, rows: null } : null;
      }
      const img = image(spec.image);
      if (!img) return null;
      return { image: img, rows: spec.rows || null, size: spec.size || 64, cols: spec.cols || 6 };
    },

    item(name) {
      return image(manifest && manifest.items && manifest.items[name]);
    },

    /* Раскадровка приёма: картинка, число кадров и размер кадра. */
    move(name) {
      const entry = manifest && manifest.moves && manifest.moves[name];
      const img = entry && image(entry.image);
      return img ? { image: img, frames: entry.frames || 1, size: entry.size || 128 } : null;
    },

    fx(name) {
      const entry = manifest && manifest.fx && manifest.fx[name];
      if (!entry) return null;
      if (typeof entry === 'string') {
        const img = image(entry);
        return img ? { image: img, frames: 1, size: img.width } : null;
      }
      const img = image(entry.image);
      return img ? { image: img, frames: entry.frames || 1, size: entry.size || img.height } : null;
    },

    ui(name) {
      const path = manifest && manifest.ui && manifest.ui[name];
      return path ? base + path : null;
    },
  };
}
