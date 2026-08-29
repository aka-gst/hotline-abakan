/*
 * Минимальный читатель PNG — ровно столько, сколько нужно проверке ассетов.
 *
 * Взят не из любви к велосипедам: в игре нет ни одной зависимости, и
 * тащить целую библиотеку ради того, чтобы посчитать одинаковые клетки в
 * атласе, было бы дороже, чем эти сто строк. Поддержаны восьмибитные
 * PNG всех типов цвета — других генераторы и не отдают.
 */
import { inflateSync, deflateSync } from 'node:zlib';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/* Разбор потока чанков: длина, имя, данные, контрольная сумма. */
function chunks(buf) {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (buf[i] !== SIGNATURE[i]) throw new Error('это не PNG');
  }
  const out = [];
  let at = 8;
  while (at < buf.length) {
    const size = buf.readUInt32BE(at);
    const name = buf.toString('ascii', at + 4, at + 8);
    out.push({ name, data: buf.subarray(at + 8, at + 8 + size) });
    at += size + 12;
  }
  return out;
}

/* Обратный фильтр строки — пять способов, описанных в спецификации. */
function unfilter(raw, width, height, pixelBytes) {
  const stride = width * pixelBytes;
  const out = Buffer.alloc(stride * height);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    const kind = raw[at]; at += 1;
    const line = raw.subarray(at, at + stride); at += stride;
    const dst = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= pixelBytes ? dst[x - pixelBytes] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= pixelBytes ? prev[x - pixelBytes] : 0;
      let value = line[x];
      if (kind === 1) value += a;
      else if (kind === 2) value += b;
      else if (kind === 3) value += (a + b) >> 1;
      else if (kind === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      dst[x] = value & 255;
    }
  }
  return out;
}

/* Читает файл и отдаёт { width, height, rgba } — по четыре байта на пиксель. */
export function readPng(buf) {
  const parts = chunks(buf);
  const head = parts.find((c) => c.name === 'IHDR');
  const width = head.data.readUInt32BE(0);
  const height = head.data.readUInt32BE(4);
  const depth = head.data[8];
  const colour = head.data[9];
  if (depth !== 8) throw new Error(`поддержаны только восьмибитные PNG, здесь ${depth}`);
  if (head.data[12] !== 0) throw new Error('чересстрочные PNG не поддержаны');

  const raw = inflateSync(Buffer.concat(parts.filter((c) => c.name === 'IDAT').map((c) => c.data)));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
  const flat = unfilter(raw, width, height, channels);

  const palette = parts.find((c) => c.name === 'PLTE')?.data;
  const alpha = parts.find((c) => c.name === 'tRNS')?.data;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels; const dst = i * 4;
    if (colour === 6) { flat.copy(rgba, dst, src, src + 4); }
    else if (colour === 2) { flat.copy(rgba, dst, src, src + 3); rgba[dst + 3] = 255; }
    else if (colour === 0) { rgba.fill(flat[src], dst, dst + 3); rgba[dst + 3] = 255; }
    else if (colour === 4) { rgba.fill(flat[src], dst, dst + 3); rgba[dst + 3] = flat[src + 1]; }
    else {
      const at = flat[src] * 3;
      rgba[dst] = palette[at]; rgba[dst + 1] = palette[at + 1]; rgba[dst + 2] = palette[at + 2];
      rgba[dst + 3] = alpha && flat[src] < alpha.length ? alpha[flat[src]] : 255;
    }
  }
  return { width, height, rgba };
}

/*
 * Клетка атласа. Кроме числа видимых пикселей и палитры снимаем подпись:
 * восемь на восемь средних цветов. По ней клетки сравниваются на глаз,
 * а не побайтово, — иначе плитки, отличающиеся одним пикселем сетки,
 * считались бы разными, и проверка пропускала бы залитый одним цветом
 * тайлсет. Именно так первая версия этой приёмки и опозорилась.
 */
const SIGN = 8;

export function cell(image, x, y, size) {
  let painted = 0;
  let edge = 0;
  const tones = new Set();
  const block = size / SIGN;
  const sign = new Float64Array(SIGN * SIGN * 4);

  /* Закрашен ли пиксель клетки — с проверкой границ: за краем пусто. */
  const on = (px, py) => {
    if (px < 0 || py < 0 || px >= size || py >= size) return false;
    return image.rgba[((y * size + py) * image.width + (x * size + px)) * 4 + 3] > 8;
  };
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      const at = ((y * size + dy) * image.width + (x * size + dx)) * 4;
      const a = image.rgba[at + 3];
      const cellAt = ((dy / block) | 0) * SIGN * 4 + ((dx / block) | 0) * 4;
      sign[cellAt] += image.rgba[at] * (a / 255);
      sign[cellAt + 1] += image.rgba[at + 1] * (a / 255);
      sign[cellAt + 2] += image.rgba[at + 2] * (a / 255);
      sign[cellAt + 3] += a;
      if (a < 8) continue;
      painted += 1;
      if (!on(dx - 1, dy) || !on(dx + 1, dy) || !on(dx, dy - 1) || !on(dx, dy + 1)) edge += 1;
      tones.add((image.rgba[at] >> 3 << 10) | (image.rgba[at + 1] >> 3 << 5) | (image.rgba[at + 2] >> 3));
    }
  }
  for (let i = 0; i < sign.length; i += 1) sign[i] /= block * block;
  /*
   * Изрезанность силуэта: квадрат периметра, делённый на площадь. У круга
   * это 4π ≈ 12.6 — минимум, какой вообще бывает. У человека с плечами,
   * руками и оружием контур длиннее вдвое-втрое. Число безразмерное, от
   * размера фигуры не зависит, и именно оно отличает нарисованного бойца
   * от тёмного овала с неоновым ободком — то, чего не видно ни по
   * палитре, ни по числу кадров.
   */
  const rugged = painted ? (edge * edge) / painted : 0;
  return { painted, edge, rugged, tones: tones.size, sign };
}

/*
 * Подпись целой картинки — восемь на восемь средних цветов, независимо от
 * её размеров. Нужна, чтобы сравнивать разные файлы между собой: нож,
 * обрез и катана обязаны отличаться друг от друга, а не только от пустоты.
 */
export function signature(image) {
  const SIZE = 8;
  const sign = new Float64Array(SIZE * SIZE * 4);
  const counts = new Float64Array(SIZE * SIZE);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const at = (y * image.width + x) * 4;
      const cell = Math.min(SIZE - 1, Math.floor(y / image.height * SIZE)) * SIZE
        + Math.min(SIZE - 1, Math.floor(x / image.width * SIZE));
      const a = image.rgba[at + 3] / 255;
      sign[cell * 4] += image.rgba[at] * a;
      sign[cell * 4 + 1] += image.rgba[at + 1] * a;
      sign[cell * 4 + 2] += image.rgba[at + 2] * a;
      sign[cell * 4 + 3] += image.rgba[at + 3];
      counts[cell] += 1;
    }
  }
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const n = counts[i] || 1;
    for (let k = 0; k < 4; k += 1) sign[i * 4 + k] /= n;
  }
  return { sign };
}

/* Насколько две клетки различаются на глаз: средняя разница по каналам. */
export function apart(a, b) {
  let sum = 0;
  for (let i = 0; i < a.sign.length; i += 1) sum += Math.abs(a.sign[i] - b.sign[i]);
  return sum / a.sign.length;
}

/* Запись PNG — нужна только затем, чтобы приёмка умела проверять сама себя. */
export function writePng({ width, height, rgba }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (name, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(name, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4);
  head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from(SIGNATURE), chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
