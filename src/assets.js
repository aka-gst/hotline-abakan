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
    loaded = images.size > 0;
    return loaded;
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

    actor(name) {
      return image(manifest && manifest.actors && manifest.actors[name]);
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
