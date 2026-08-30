/*
 * ОДИН УДАР — отрисовка.
 *
 * Вид сверху, всё нарисовано фигурами, а не спрайтами: ни одного
 * заимствованного пикселя, зато палитру и пропорции можно менять
 * одной строкой. Отсылка к жанру держится на трёх вещах — кислотный
 * контраст, жёсткие чёрные тени и кровь, которая остаётся до конца
 * забега.
 *
 * Пол и стены пекутся один раз в отдельный холст: перерисовывать
 * тысячу клеток каждый кадр телефон не обязан. Слой обновляется, только
 * когда уровень меняется — то есть когда пуля разбивает витрину.
 */

import { TILE } from './level.js';
import { pickFrame } from './assets.js';
import { TILE_SIZE, BODY, WEAPONS, MOVES, BARE_HP, BEAT_PERIOD, backstabReady, beatAhead } from './world.js';

/*
 * Пол светлее стен, а не наоборот. Первый вариант палитры был собран
 * по-другому — светящиеся стены и почти чёрный пол, — и на скриншоте
 * читался как лабиринт из неоновых полос: глаз принимал стены за
 * проходы. Здесь стена — тёмная масса с одной подсвеченной кромкой.
 */
/*
 * Палитра кислотная намеренно: у Hotline Miami цвет не описывает
 * помещение, а задаёт пульс. Пол насыщенный и тёплый, стена — почти
 * чёрная масса с одной ядовитой кромкой, и весь контраст держится на этой
 * паре, а не на светотени.
 */
export const THEMES = [
  {
    name: 'бар',
    floor: '#4a1f63',
    floorAlt: '#57256f',
    grout: '#2a1038',
    wall: '#12081c',
    wallTop: '#33184a',
    wallEdge: '#ff1f8f',
    door: '#7a2f9e',
    rug: '#a01050',
    table: '#5c3620',
    tableEdge: '#ffa93d',
    glass: '#5ce1ff',
    haze: '#ff1f8f',
  },

  /* Серверная: та же кислота, но в холодном конце спектра. */
  {
    name: 'серверная',
    floor: '#12414f',
    floorAlt: '#16505f',
    grout: '#08222c',
    wall: '#04101a',
    wallTop: '#0f3446',
    wallEdge: '#2ce8ff',
    door: '#1a6c8c',
    rug: '#0f4a5c',
    table: '#1d3b45',
    tableEdge: '#7ef0ff',
    glass: '#a8f2ff',
    haze: '#2ce8ff',
  },
  {
    name: 'двор',
    floor: '#8fa3b8',
    floorAlt: '#9db0c4',
    grout: '#5f7183',
    wall: '#1a222c',
    wallTop: '#2b3644',
    wallEdge: '#2ce8ff',
    door: '#3f5a70',
    rug: '#6b7f92',
    table: '#3d4a58',
    tableEdge: '#a8d8ff',
    glass: '#cfe8ff',
    haze: '#7ec8ff',
  },
  {
    name: 'квартира',
    floor: '#6b5a3a',
    floorAlt: '#77653f',
    grout: '#3a3020',
    wall: '#2a2118',
    wallTop: '#4a3c28',
    wallEdge: '#e8c060',
    door: '#8a6a3a',
    rug: '#8a3a2a',
    table: '#5c4620',
    tableEdge: '#ffd07a',
    glass: '#cfe8ff',
    haze: '#e8c060',
  },
  {
    name: 'гаражи',
    floor: '#3d4249',
    floorAlt: '#464c54',
    grout: '#22262c',
    wall: '#171a1f',
    wallTop: '#2a2f36',
    wallEdge: '#ff7b2d',
    door: '#5a4634',
    rug: '#4a3a2a',
    table: '#4a4f58',
    tableEdge: '#ffa93d',
    glass: '#bcd6e8',
    haze: '#ff7b2d',
  },
  {
    name: 'рынок',
    floor: '#3a4a52',
    floorAlt: '#43545d',
    grout: '#1e282e',
    wall: '#141c20',
    wallTop: '#24323a',
    wallEdge: '#7ef0ff',
    door: '#2f5a68',
    rug: '#3a5a4a',
    table: '#4a5a62',
    tableEdge: '#a8f2ff',
    glass: '#dff6ff',
    haze: '#7ef0ff',
  },
  {
    name: 'дом культуры',
    floor: '#5c3a2a',
    floorAlt: '#674332',
    grout: '#32201a',
    wall: '#20140e',
    wallTop: '#3d2a1e',
    wallEdge: '#ff3b3b',
    door: '#7a3a2a',
    rug: '#8a1f1f',
    table: '#6b4a30',
    tableEdge: '#ffb08a',
    glass: '#ffd9c9',
    haze: '#ff3b3b',
  },
  {
    name: 'почта',
    floor: '#2f4a3a',
    floorAlt: '#365443',
    grout: '#18281f',
    wall: '#101c16',
    wallTop: '#20362a',
    wallEdge: '#76ff9f',
    door: '#2f6a4a',
    rug: '#3a5a46',
    table: '#4a5c4a',
    tableEdge: '#b8ffcf',
    glass: '#dfffe8',
    haze: '#76ff9f',
  }
];


export function createRenderer(canvas, assets = null) {
  const ctx = canvas.getContext('2d', { alpha: false });

  /*
   * Уровень печётся в два слоя. Пол ложится под всё, стены — поверх всего,
   * включая конусы зрения и частицы: иначе луч, упёршийся в стену, всё
   * равно красит её изнутри, и стена перестаёт читаться как преграда.
   */
  const baked = document.createElement('canvas');
  const bakedCtx = baked.getContext('2d');
  const walls = document.createElement('canvas');
  const wallsCtx = walls.getContext('2d');

  let dpr = 1;
  let viewW = 0;
  let viewH = 0;
  let bakedFor = null;

  /*
   * Сравнивать здесь надо со своим же состоянием, а не с размером элемента
   * в вёрстке: холст растянут на весь экран правилом inset: 0, и его CSS-размер
   * совпадает с окном всегда — даже когда буфер под рисование остался
   * дефолтным 300×150. На этом однажды и попались: игра шла, часы тикали,
   * а мир рисовался в углу экрана.
   */
  function resize(cssW, cssH, ratio) {
    const next = Math.min(ratio || 1, 2.5);
    if (viewW === cssW && viewH === cssH && dpr === next) return;

    dpr = next;
    viewW = cssW;
    viewH = cssH;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }

  /*
   * Масштаб.
   *
   * Считался от короткой стороны — и на телефоне, поставленном стоймя,
   * это давало полосу шириной в пять с половиной клеток: противник
   * появлялся из-за края и убивал раньше, чем его видно. В игре, где
   * умирают с одного касания, это не сложность, а нечестность.
   *
   * Поэтому масштаб берётся по обеим сторонам сразу: столько, чтобы в
   * кадр всегда влезала полоса мира не уже WIDE и не ниже TALL. На
   * широком мониторе решает высота, на вертикальном телефоне — ширина,
   * и в обоих случаях видно примерно одинаковый кусок этажа.
   *
   * От этого же числа считается, как далеко игрок видит, а значит и с
   * какого расстояния стрелкам разрешено открывать огонь.
   */
  const WIDE = 520;
  const TALL = 420;

  function zoomFor() {
    return Math.max(0.7, Math.min(2, Math.min(viewW / WIDE, viewH / TALL)));
  }

  function bake(world) {
    const theme = THEMES[world.level.theme] || THEMES[0];
    const sheet = assets && assets.ready ? assets.tiles(world.level.theme || 0) : null;
    const w = world.w * TILE_SIZE;
    const h = world.h * TILE_SIZE;

    if (baked.width !== w || baked.height !== h) {
      baked.width = w;
      baked.height = h;
      walls.width = w;
      walls.height = h;
    }

    bakedCtx.fillStyle = theme.grout;
    bakedCtx.fillRect(0, 0, w, h);
    wallsCtx.clearRect(0, 0, w, h);

    for (let y = 0; y < world.h; y += 1) {
      for (let x = 0; x < world.w; x += 1) {
        const tile = world.tiles[y * world.w + x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (tile === TILE.WALL) continue;

        if (sheet) {
          blit(bakedCtx, sheet, ((x + y) & 1) ? 'floor' : 'floor_alt', px, py);
          if (tile === TILE.RUG) blit(bakedCtx, sheet, 'rug', px, py);
          if (tile === TILE.DOOR) {
            const left = x > 0 ? world.tiles[y * world.w + (x - 1)] : TILE.WALL;
            const right = x < world.w - 1 ? world.tiles[y * world.w + (x + 1)] : TILE.WALL;
            blit(bakedCtx, sheet, left === TILE.WALL && right === TILE.WALL ? 'door_v' : 'door_h', px, py);
          }
          continue;
        }

        bakedCtx.fillStyle = ((x + y) & 1) ? theme.floor : theme.floorAlt;
        bakedCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        /* Тонкий шов между плитами: без него пол выглядит пустотой. */
        bakedCtx.fillStyle = theme.grout;
        bakedCtx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
        bakedCtx.fillRect(px + TILE_SIZE - 1, py, 1, TILE_SIZE);

        if (tile === TILE.RUG) {
          bakedCtx.fillStyle = theme.rug;
          bakedCtx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          bakedCtx.fillStyle = 'rgba(255,255,255,.05)';
          bakedCtx.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        }

        /*
         * Дверь — это проём, а не квадратик с точкой. Косяки ставятся с
         * той стороны, где стена, поэтому проход виден как проход: сквозь
         * него идёт пол, а поперёк лежит порог.
         */
        if (tile === TILE.DOOR) {
          const left = x > 0 ? world.tiles[y * world.w + (x - 1)] : TILE.WALL;
          const right = x < world.w - 1 ? world.tiles[y * world.w + (x + 1)] : TILE.WALL;
          const vertical = left === TILE.WALL && right === TILE.WALL;

          bakedCtx.fillStyle = theme.door;
          bakedCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          bakedCtx.fillStyle = ((x + y) & 1) ? theme.floor : theme.floorAlt;
          bakedCtx.fillRect(px + (vertical ? 4 : 0), py + (vertical ? 0 : 4),
            TILE_SIZE - (vertical ? 8 : 0), TILE_SIZE - (vertical ? 0 : 8));

          bakedCtx.fillStyle = theme.wallEdge;
          if (vertical) {
            bakedCtx.fillRect(px, py, 4, TILE_SIZE);
            bakedCtx.fillRect(px + TILE_SIZE - 4, py, 4, TILE_SIZE);
          } else {
            bakedCtx.fillRect(px, py, TILE_SIZE, 4);
            bakedCtx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
          }
        }
      }
    }

    /*
     * Стены рисуются вторым проходом и в свой слой.
     *
     * Первая версия была почти чёрной полосой с тонкой неоновой чертой
     * снизу — и на живой партии выяснилось, что стену от пустоты не
     * отличить. Теперь у стены есть тело, освещённая верхняя грань и
     * яркая кромка с каждой стороны, которая смотрит в пол. Тень под ней
     * отделяет её от пола окончательно.
     */
    for (let y = 0; y < world.h; y += 1) {
      for (let x = 0; x < world.w; x += 1) {
        const tile = world.tiles[y * world.w + x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        const at = (dx, dy) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) return TILE.WALL;
          return world.tiles[ny * world.w + nx];
        };

        if (tile === TILE.WALL) {
          wallsCtx.fillStyle = theme.wall;
          wallsCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          wallsCtx.fillStyle = theme.wallTop;
          wallsCtx.fillRect(px, py, TILE_SIZE, 9);

          wallsCtx.fillStyle = theme.wallEdge;
          if (at(0, 1) !== TILE.WALL) wallsCtx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
          if (at(0, -1) !== TILE.WALL) wallsCtx.fillRect(px, py, TILE_SIZE, 2);
          if (at(-1, 0) !== TILE.WALL) wallsCtx.fillRect(px, py, 2, TILE_SIZE);
          if (at(1, 0) !== TILE.WALL) wallsCtx.fillRect(px + TILE_SIZE - 2, py, 2, TILE_SIZE);

          if (at(0, 1) !== TILE.WALL) {
            wallsCtx.fillStyle = 'rgba(0,0,0,.55)';
            wallsCtx.fillRect(px, py + TILE_SIZE, TILE_SIZE, 10);
          }
        }

        if (tile === TILE.TABLE) {
          bakedCtx.fillStyle = 'rgba(0,0,0,.5)';
          bakedCtx.fillRect(px + 4, py + 6, TILE_SIZE - 4, TILE_SIZE - 4);
          bakedCtx.fillStyle = theme.table;
          bakedCtx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          bakedCtx.strokeStyle = theme.tableEdge;
          bakedCtx.lineWidth = 2;
          bakedCtx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        }

        if (tile === TILE.GLASS) {
          bakedCtx.fillStyle = 'rgba(122,217,255,.2)';
          bakedCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          bakedCtx.strokeStyle = theme.glass;
          bakedCtx.lineWidth = 2;
          bakedCtx.beginPath();
          bakedCtx.moveTo(px + 2, py + 2);
          bakedCtx.lineTo(px + TILE_SIZE - 2, py + TILE_SIZE - 2);
          bakedCtx.moveTo(px + TILE_SIZE - 2, py + 2);
          bakedCtx.lineTo(px + 2, py + TILE_SIZE - 2);
          bakedCtx.stroke();
        }
      }
    }

    bakedFor = world;
  }

  function invalidate() { bakedFor = null; }

  /* Клетка из атласа в клетку уровня. Имени нет в карте — молча пропускаем:
     неполный тайлсет должен рисовать что может, а не падать. */
  function blit(target, sheet, name, px, py) {
    const cell = sheet.map[name];
    if (!cell) return false;
    target.drawImage(sheet.image, cell[0] * sheet.size, cell[1] * sheet.size, sheet.size, sheet.size,
      px, py, TILE_SIZE, TILE_SIZE);
    return true;
  }

/*
 * Что сейчас делает тело — в терминах листа анимации.
 *
 * Замах и удар держатся в разных полях (приём отсчитывает moveStart,
 * оружие — swing), но листу всё равно: ему нужен ряд и доля пройденного.
 * Смещение по координатам разводит фазы соседей — иначе три громилы в
 * кадре шагают в ногу, и это сразу видно.
 */
  function actorState(a) {
    const busy = Math.max(a.swing || 0, a.moveStart || 0, a.windup || 0);
    return {
      moving: Math.hypot(a.vx || 0, a.vy || 0) > 30,
      attack: busy > 0 ? (a.weapon && a.weapon !== 'fists' ? 'second' : true) : null,
      offset: (a.x + a.y) * 0.03,
    };
  }

  function actorPhase(a) {
    const left = Math.max(a.swing || 0, a.moveStart || 0, a.windup || 0);
    return left > 0 ? Math.max(0, Math.min(0.99, 1 - left / 0.28)) : 0;
  }

  /* Кадр из листа анимации — та же посадка, только вырезка из атласа. */
  function sheetSprite(g, art, frame, x, y, angle, size) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.drawImage(art.image, frame.col * art.size, frame.row * art.size, art.size, art.size,
      -size / 2, -size / 2, size, size);
    g.restore();
  }

  /* Спрайт по центру и по углу: у всех наших картинок нос смотрит вправо. */
  function sprite(g, img, x, y, angle, size) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.drawImage(img, -size / 2, -size / 2, size, size);
    g.restore();
  }


  /* =======================================================
     ФИГУРЫ
     ======================================================= */

  /*
   * Тело.
   *
   * Кислотный киберпанк здесь означает конкретное: тёмный силуэт, по
   * которому идёт неоновая кромка, и одна яркая деталь — визор. Цвет
   * несёт роль, а не украшение: по кромке видно, кто перед тобой, ещё до
   * того, как разберёшь оружие.
   */
  function body(g, x, y, angle, palette, opts = {}) {
    const lean = opts.lean || 0;

    /* Есть спрайт — рисуем его; тень всё равно наша, она общая для всех. */
    const art = opts.art && assets && assets.ready ? assets.actor(opts.art) : null;
    if (art) {
      g.save();
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.beginPath();
      g.ellipse(x + 3, y + 4, BODY + 2, BODY + 1, 0, 0, 6.29);
      g.fill();
      g.restore();

      /*
       * Кольцо под спрайтом.
       *
       * Присланные персонажи нарисованы честно, но тёмным по тёмному, и
       * на тридцати двух пикселях посреди фиолетового пола сливаются в
       * пятно. Раньше роль читалась неоновой кромкой, которую рисовал
       * код; теперь кромка ушла под спрайт и осталась ровно тем, чем
       * была, — ответом на вопрос «кто это» раньше, чем разберёшь оружие.
       */
      g.save();
      g.strokeStyle = palette.neon;
      g.globalAlpha = opts.mine ? 0.95 : 0.5;
      g.lineWidth = opts.mine ? 2.5 : 1.5;
      g.beginPath();
      g.ellipse(x, y, BODY + 3, BODY + 2.5, 0, 0, 6.29);
      g.stroke();

      /*
       * Клин перед своим.
       *
       * «Кто из них я» — первый вопрос, который задаёт человек, впервые
       * открывший игру, и по одинаковым кольцам на него не ответить.
       * У своего кольцо ярче и толще, а перед ним лежит сплошной клин:
       * он же показывает, куда смотришь, а значит, куда придётся удар.
       * У чужих ни того, ни другого — им хватает цвета кромки.
       */
      if (opts.mine) {
        g.globalAlpha = 0.9;
        g.fillStyle = palette.neon;
        g.beginPath();
        g.moveTo(x + Math.cos(angle) * (BODY + 12), y + Math.sin(angle) * (BODY + 12));
        g.lineTo(x + Math.cos(angle + 0.5) * (BODY + 3), y + Math.sin(angle + 0.5) * (BODY + 3));
        g.lineTo(x + Math.cos(angle - 0.5) * (BODY + 3), y + Math.sin(angle - 0.5) * (BODY + 3));
        g.closePath();
        g.fill();
      }
      g.restore();

      /*
       * Спрайт крупнее хитбокса, и так и задумано: тело сталкивается
       * кругом радиусом BODY, а рисунок занимает всю клетку листа. Если
       * подгонять картинку под столкновения, персонаж превращается в
       * точку; если наоборот — дерёшься на расстоянии вытянутой руки, а
       * выглядит будто вплотную. Сорок пикселей — то, на чём и фигура
       * читается, и промах не выглядит попаданием.
       */
      const SIZE = 40;
      if (art.rows) {
        const frame = pickFrame(art.rows, opts.state || {}, opts.time || 0, opts.phase || 0);
        sheetSprite(g, art, frame, x, y, angle, SIZE);
      } else {
        sprite(g, art.image, x, y, angle, SIZE);
      }

      /*
       * Оружие в руке.
       *
       * Листы анимации есть только на кулаки, биту и пистолет; с ножом,
       * трубой, бутылкой и обрезом персонаж рисовался безоружным, и на
       * вопрос «что у меня в руках» отвечали только показания в углу.
       * Теперь всё, чего нет на листе, дорисовывается поверх — и в
       * момент удара становится ярче и длиннее, потому что именно тогда
       * на него и смотрят.
       */
      const ON_SHEET = ['fists', 'bat', 'pistol'];
      if (art.rows && opts.weapon && !ON_SHEET.includes(opts.weapon)) {
        g.save();
        g.translate(x, y);
        g.rotate(angle);
        const hit = (opts.swing || 0) > 0;
        if (hit) {
          g.shadowColor = '#ffffff';
          g.shadowBlur = 8;
          g.scale(1.25, 1.25);
        }
        drawWeapon(g, opts.weapon, opts.swing || 0, opts.windup || 0);
        g.restore();
      }

      if (!art.rows && opts.weapon && opts.weapon !== 'fists') {
        const item = assets.item(opts.weapon);
        if (item) {
          g.save();
          g.translate(x, y);
          g.rotate(angle);
          g.drawImage(item, 4, -8, 32, 16);
          g.restore();
        }
      }
      return;
    }

    /*
     * Человек, нарисованный кодом.
     *
     * Три поставки подряд не дали годных персонажей, и каждая следующая
     * ломалась по-своему: то овалы, то кривые фигуры. Рисовать их здесь
     * оказалось и быстрее, и надёжнее: всё под контролем до пикселя,
     * силуэт одинаковый на любом масштабе, а цвет роли, оружие в руке и
     * фаза удара берутся из тех же данных, что и правила боя.
     *
     * Вид сверху означает конкретное: видно плечи и макушку, ступни
     * выглядывают из-за плеч, руки уходят вперёд. Ничего, что можно
     * увидеть только сбоку, здесь нет.
     */
    g.save();
    g.translate(x, y);

    /* Жёсткая тень со смещением — весь объём этой игры держится на ней. */
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath();
    g.ellipse(3, 4, BODY + 3, BODY + 2, 0, 0, 6.29);
    g.fill();

    g.rotate(angle);
    /*
     * Фигура крупнее хитбокса.
     *
     * Тело сталкивается кругом радиусом BODY — девять пикселей, — и если
     * рисовать человека по нему, на экране остаётся точка. Спрайты
     * рисовались в сорок пикселей, и фигура должна занимать столько же,
     * иначе разница между «подошёл» и «достал» перестаёт читаться.
     */
    g.scale(1.7, 1.7);

    const state = opts.state || {};
    const phase = opts.phase || 0;
    const busy = (opts.swing || 0) > 0 || (opts.windup || 0) > 0;
    /* Шаг: ступни ходят в противофазе, пока тело движется. */
    const stride = state.moving
      ? Math.sin((opts.time || 0) * 11 + (state.offset || 0)) * 3
      : 0;
    /* Замах уводит руку назад, удар выбрасывает её вперёд. */
    const reachOut = busy ? (-4 + phase * 13) : 0;
    const lean2 = lean * 0.5 + (busy ? phase : 0);

    const limb = (fx, fy, tx, ty, width, colour) => {
      g.strokeStyle = colour;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(tx, ty);
      g.stroke();
    };

    /*
     * Порядок важен: сначала то, что за спиной, потом тело, потом голова.
     * Ступни торчат позади плеч — по ним вид сверху и читается.
     */
    limb(-5, -4, -9 - stride, -5, 3.6, palette.legs);
    limb(-5, 4, -9 + stride, 5, 3.6, palette.legs);

    /* Дальняя рука — вдоль тела, чуть в сторону. */
    limb(-1, -6, 4, -8.5, 3, palette.legs);

    /* Плечи и корпус: широкий поперёк взгляда, короткий вдоль. */
    g.fillStyle = palette.body;
    g.beginPath();
    if (g.roundRect) g.roundRect(lean2 - 7, -7, 11, 14, 4);
    else g.ellipse(lean2 - 1, 0, 6, 7, 0, 0, 6.29);
    g.fill();
    g.strokeStyle = palette.neon;
    g.lineWidth = 1.1;
    g.stroke();

    /* Бьющая рука: во время удара уходит далеко вперёд. */
    limb(lean2 + 1, 5.5, lean2 + 7 + reachOut, 4 - (busy ? 3 : 0), 3.2, palette.legs);

    /*
     * Голова выступает вперёд за плечи — иначе фигура читается кругом.
     * Тон темнее тела, визор по переднему краю: он и показывает, куда
     * смотрит.
     */
    g.fillStyle = palette.head;
    g.beginPath();
    g.ellipse(lean2 + 5.5, 0, 4.4, 4.4, 0, 0, 6.29);
    g.fill();
    g.strokeStyle = palette.neon;
    g.lineWidth = 0.9;
    g.stroke();

    g.save();
    g.shadowColor = palette.visor;
    g.shadowBlur = 5;
    g.fillStyle = palette.visor;
    g.fillRect(lean2 + 7.4, -2.8, 2.2, 5.6);
    g.restore();

    /* Оружие — в бьющей руке, вместе с ней. */
    if (opts.weapon && opts.weapon !== 'fists') {
      g.save();
      g.translate(lean2 + 7 + reachOut * 0.85, 4.5);
      if (busy) {
        g.shadowColor = '#ffffff';
        g.shadowBlur = 6;
      }
      drawWeapon(g, opts.weapon, opts.swing || 0, opts.windup || 0);
      g.restore();
    }

    g.restore();
  }


  /*
   * Удар руками и ногами видно.
   *
   * Раньше безоружная драка выглядела как два кружка, стоящие рядом:
   * приём читался только по букве над головой. Теперь рука выбрасывается
   * вперёд кулаком, нога уходит по дуге, бросок — двумя руками сразу.
   */
  /*
   * Конечности по фазам.
   *
   * Приём теперь занимает время, и это время должно быть видно целиком:
   * рука сначала уходит назад (замах), потом выстреливает (удар), потом
   * возвращается (восстановление). В игре, где размен решают доли
   * секунды, игрок обязан читать не только чужой выбор, но и то, на какой
   * стадии этот выбор находится.
   */
  /* Есть ли у персонажей листы анимации: если есть, удар уже нарисован в
     кадрах, и вторая рука поверх спрайта — та самая «рука сзади». */
  function sheetsInUse() {
    if (!assets || !assets.ready) return false;
    const art = assets.actor('player');
    return !!(art && art.rows);
  }

  function limbs(g, ent, palette) {
    const id = ent.move;
    if (!id || !MOVES[id]) return;
    if (sheetsInUse()) return;

    const move = MOVES[id];
    const winding = (ent.moveStart || 0) > 0;
    const wind = winding ? 1 - ent.moveStart / move.startup : 1;
    const hit = ent.swing > 0 ? 1 - ent.swing / 0.16 : -1;

    if (!winding && hit < 0) return;

    /*
     * Если художник прислал раскадровку — рисуем её: кадр выбирается фазой,
     * а не временем, поэтому длинный замах броска и короткий замах руки
     * читаются одинаково.
     */
    const sheet = assets && assets.ready ? assets.move(id) : null;
    if (sheet) {
      const frame = winding ? 0 : (hit < 0.55 ? 1 : 2);
      const index = Math.min(sheet.frames - 1, frame);

      if (winding) {
        g.save();
        g.strokeStyle = move.colour;
        g.globalAlpha = 0.35 + wind * 0.5;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(ent.x, ent.y, BODY + 12, -Math.PI / 2, -Math.PI / 2 + wind * 6.28);
        g.stroke();
        g.restore();
      }

      g.save();
      g.translate(ent.x, ent.y);
      g.rotate(ent.angle);
      g.drawImage(sheet.image, index * sheet.size, 0, sheet.size, sheet.size, -32, -32, 64, 64);
      g.restore();
      return;
    }

    /* Дуга набора вокруг бойца: сколько осталось до удара. */
    if (winding) {
      g.save();
      g.strokeStyle = move.colour;
      g.globalAlpha = 0.35 + wind * 0.5;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(ent.x, ent.y, BODY + 12, -Math.PI / 2, -Math.PI / 2 + wind * 6.28);
      g.stroke();
      g.restore();
    }

    /* Замах уводит конечность назад, удар выбрасывает её вперёд. */
    const push = winding ? -0.35 * wind : Math.sin(Math.min(1, hit) * Math.PI);

    g.save();
    g.translate(ent.x, ent.y);
    g.rotate(ent.angle);
    g.strokeStyle = move.colour;
    g.fillStyle = move.colour;
    g.shadowColor = move.colour;
    g.shadowBlur = winding ? 6 : 12;
    g.globalAlpha = winding ? 0.75 : 1;
    g.lineCap = 'round';

    if (id === 'hand') {
      const reach = 6 + push * 26;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(2, -3);
      g.lineTo(reach, -2);
      g.stroke();
      g.beginPath();
      g.arc(reach, -2, winding ? 3.5 : 5, 0, 6.29);
      g.fill();
    } else if (id === 'kick') {
      /* Нога заносится назад по дуге и проходит вперёд с длинным следом. */
      const swing = winding ? -1.1 - wind * 0.4 : -1.1 + Math.min(1, hit) * 2.2;
      const reach = 12 + Math.max(0, push) * 28;
      g.rotate(swing);
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(0, 4);
      g.lineTo(reach, 4);
      g.stroke();
      g.fillRect(reach - 4, -1, 10, 10);

      if (!winding) {
        g.globalAlpha = 0.35;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, reach, -1.1, swing);
        g.stroke();
      }
    } else {
      /* Бросок раскрывается заранее: руки расходятся шире по мере замаха. */
      const spread = winding ? 4 + wind * 8 : 6 + push * 4;
      const reach = 6 + Math.max(0, push) * 22 + (winding ? wind * 4 : 0);
      g.lineWidth = 3.5;
      for (const side of [-spread, spread]) {
        g.beginPath();
        g.moveTo(2, side * 0.4);
        g.lineTo(reach, side);
        g.stroke();
        g.beginPath();
        g.arc(reach, side, 3.5, 0, 6.29);
        g.fill();
      }
    }

    g.restore();
  }


  function drawWeapon(g, weapon, swing, windup) {
    const push = swing > 0 ? 8 - swing * 30 : 0;
    const raise = windup > 0 ? -windup * 12 : 0;

    if (weapon === 'bat') {
      g.save();
      g.rotate(-0.5 + push * 0.09 + raise * 0.06);
      g.fillStyle = '#c9a06a';
      g.fillRect(4, -2, 22, 4);
      g.fillStyle = '#f0d6a8';
      g.fillRect(20, -3.5, 8, 7);
      g.restore();
      return;
    }

    if (weapon === 'pipe') {
      g.save();
      g.rotate(-0.4 + push * 0.09 + raise * 0.06);
      g.fillStyle = '#9aa3b8';
      g.fillRect(4, -2.5, 26, 5);
      g.fillStyle = '#5f6980';
      g.fillRect(26, -3.5, 5, 7);
      g.restore();
      return;
    }

    if (weapon === 'knife') {
      g.save();
      g.rotate(-0.2 + push * 0.06);
      g.fillStyle = '#2a2130';
      g.fillRect(4, -1.5, 7, 3);
      g.fillStyle = '#eaf6ff';
      g.beginPath();
      g.moveTo(11, -2.5);
      g.lineTo(22, 0);
      g.lineTo(11, 2.5);
      g.closePath();
      g.fill();
      g.restore();
      return;
    }

    if (weapon === 'bottle') {
      g.save();
      g.rotate(-0.45 + push * 0.08);
      g.fillStyle = '#4fd6a0';
      g.fillRect(4, -4, 12, 8);
      g.fillRect(16, -2, 8, 4);
      g.fillStyle = '#d8fff0';
      g.fillRect(6, -3, 3, 6);
      g.restore();
      return;
    }

    if (weapon === 'shotgun') {
      g.fillStyle = '#6b4a2a';
      g.fillRect(2, -2, 9, 4);
      g.fillStyle = '#cfd6e8';
      g.fillRect(11, -2.5, 16, 2.2);
      g.fillRect(11, 0.3, 16, 2.2);
      return;
    }

    if (weapon === 'pistol') {
      g.fillStyle = '#dfe6ff';
      g.fillRect(6, -1.5, 13, 3.5);
      g.fillStyle = '#7b7f99';
      g.fillRect(8, 1, 4, 4);
      return;
    }

    g.fillStyle = '#f6e6ff';
    g.fillRect(7 + push * 0.4, -6, 5, 4);
    g.fillRect(7 + push * 0.4, 2, 5, 4);
  }

  /*
   * Цвет здесь — роль, а не украшение. Игрок горит кислотно-зелёным,
   * безоружный боец — голубым, вооружённый громила — розовым, стрелок —
   * оранжевым. По одной кромке видно, чем этот будет бить, ещё до того,
   * как разглядишь, что у него в руках.
   */
/*
 * Цвет — это роль. Тело даёт узнавание издалека, кромка обводит силуэт,
 * визор показывает, куда смотрит, ноги остаются тёмными у всех: по ним
 * фигура читается как фигура, а не как пятно.
 */
  const PALETTE = {
    player: { body: '#2f8f5a', head: '#1c5c39', neon: '#76ff9f', visor: '#ffe06b', legs: '#101a2c' },
    brawler: { body: '#1f6f8f', head: '#12475c', neon: '#2ce8ff', visor: '#d8fbff', legs: '#0b1620' },
    thug: { body: '#8f2050', head: '#5c122f', neon: '#ff1f8f', visor: '#ffd0e8', legs: '#1a0a12' },
    shooter: { body: '#a05a1c', head: '#6b3a10', neon: '#ff9b2d', visor: '#ffe0b3', legs: '#1c1208' },
    dead: { body: '#3a3244', head: '#241e2c', neon: '#4a3d55', visor: '#6d5c76', legs: '#141019' },
  };


  /* =======================================================
     КАДР
     ======================================================= */

  function draw(world, view) {
    if (bakedFor !== world || world.rebake) { bake(world); world.rebake = false; }

    const theme = THEMES[world.level.theme] || THEMES[0];
    const zoom = zoomFor();
    const halfW = viewW / (2 * zoom);
    const halfH = viewH / (2 * zoom);

    let camX = view.x;
    let camY = view.y;
    const worldW = world.w * TILE_SIZE;
    const worldH = world.h * TILE_SIZE;
    /*
     * Куда смотрит камера.
     *
     * По той оси, где этаж длиннее экрана, камера идёт за игроком и
     * упирается в стены — иначе за краем видна пустота. По той, где этаж
     * короче, она стоит посередине этажа: игрока туда не поставить при
     * всём желании, а пустоту лучше поделить поровну сверху и снизу, где
     * её закрывают показания и кнопки, чем свалить всю под ноги.
     *
     * Пальцем добавляется поблажка: у самых стен камера отпускает игрока
     * не сразу, и он держится к центру ближе, чем позволяет упор. Без неё
     * на телефоне персонаж уезжал в угол кадра, а смотреть приходилось в
     * противоположный.
     */
    const slack = view.centred ? 0.35 : 0;
    const follow = (cam, half, size) => {
      if (size <= half * 2) return size / 2;
      const give = half * slack;
      return Math.max(half - give, Math.min(size - half + give, cam));
    };
    camX = follow(camX, halfW, worldW);
    camY = follow(camY, halfH, worldH);

    /* Короткий наезд на попадании: кадр «клюёт» вперёд и возвращается. */
    /* Наезд на попадании и короткий вдох на долю музыки. */
    const punch = 1 + world.fx.punch * 0.035 + (world.fx.beat || 0) * 0.006;
    const shake = world.fx.shake;
    const shakeX = shake ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(zoom * punch, zoom * punch);
    ctx.translate(-camX + shakeX, -camY + shakeY);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baked, 0, 0);

    drawExit(ctx, world);
    drawDecals(ctx, world);
    drawCorpses(ctx, world);
    drawCasings(ctx, world);
    drawPickups(ctx, world);
    drawVision(ctx, world);
    drawNoises(ctx, world);
    drawEnemies(ctx, world);
    drawPlayer(ctx, world);
    drawExitArrow(ctx, world, { x: camX, y: camY });
    drawBullets(ctx, world);
    drawPops(ctx, world);
    drawParticles(ctx, world);
    ctx.drawImage(walls, 0, 0);

    ctx.restore();

    /* Вспышка на убийстве — короткая засветка вместо честного бликового прохода. */
    if (world.fx.flash > 0.01) {
      ctx.fillStyle = `rgba(255,45,149,${world.fx.flash * 0.28})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    beatGlow = world.fx.beat || 0;
    vignette(ctx, theme);

    return { zoom, camX, camY };
  }

  function drawExit(g, world) {
    for (let y = 0; y < world.h; y += 1) {
      for (let x = 0; x < world.w; x += 1) {
        if (world.tiles[y * world.w + x] !== TILE.EXIT) continue;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (!world.exitOpen) {
          g.fillStyle = 'rgba(120,110,140,.18)';
          g.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          continue;
        }

        const pulse = 0.45 + Math.sin(world.time * 7) * 0.25;
        g.fillStyle = `rgba(118,255,159,${pulse})`;
        g.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        g.strokeStyle = '#76ff9f';
        g.lineWidth = 2;
        g.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }

  function drawDecals(g, world) {
    g.fillStyle = '#b3062f';
    for (const decal of world.decals) {
      g.globalAlpha = decal.a;
      g.beginPath();
      g.ellipse(decal.x, decal.y, decal.r, decal.r * 0.82, 0, 0, 6.29);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawCorpses(g, world) {
    for (const corpse of world.corpses) {
      const jitter = corpse.twitch > 0 ? (Math.random() - 0.5) * corpse.twitch * 2 : 0;
      /* Полсекунды тело ещё дёргается и лежит сухим, дальше под ним
         растекается лужа: время на этаже видно по полу. */
      body(g, corpse.x + jitter, corpse.y, corpse.angle, PALETTE.dead,
        { lean: 3, art: corpse.twitch > 0 ? 'corpse' : 'corpse_pool' });
    }
  }

  function drawCasings(g, world) {
    g.fillStyle = '#ffd980';
    for (const casing of world.casings) {
      g.save();
      g.translate(casing.x, casing.y);
      g.rotate(casing.angle);
      g.globalAlpha = Math.min(1, casing.life * 2);
      g.fillRect(-2, -1, 4, 2);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawPickups(g, world) {
    for (const pickup of world.pickups) {
      g.save();
      g.translate(pickup.x, pickup.y);

      if (!pickup.flying) {
        const glow = 0.25 + Math.sin(world.time * 4 + pickup.x) * 0.12;
        g.fillStyle = `rgba(118,255,159,${glow})`;
        g.beginPath();
        g.ellipse(0, 0, 13, 13, 0, 0, 6.29);
        g.fill();
      }

      g.rotate(pickup.angle);
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(-9, -1, 22, 5);
      g.translate(-10, 0);
      drawWeapon(g, pickup.weapon, 0, 0);
      g.restore();
    }
  }

  /*
   * Конус зрения нарисован намеренно: на телефоне без него не прочитать,
   * кто куда смотрит, и стелс превращается в лотерею.
   */
  function drawVision(g, world) {
    for (const enemy of world.enemies) {
      if (!enemy.alive || enemy.downed > 0) continue;

      const colour = enemy.state === 'chase' ? '255,45,90'
        : enemy.state === 'alert' ? '255,224,107'
          : '122,217,255';

      const range = enemy.state === 'chase' ? 150 : 230;
      const steps = 12;
      const half = 0.95;

      g.beginPath();
      g.moveTo(enemy.x, enemy.y);
      for (let i = 0; i <= steps; i += 1) {
        const a = enemy.angle - half + (half * 2 * i) / steps;
        let hit = range;
        for (let d = 8; d < range; d += 10) {
          const px = enemy.x + Math.cos(a) * d;
          const py = enemy.y + Math.sin(a) * d;
          const tx = Math.floor(px / TILE_SIZE);
          const ty = Math.floor(py / TILE_SIZE);
          if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) { hit = d; break; }
          const tile = world.tiles[ty * world.w + tx];
          if (tile === TILE.WALL || tile === TILE.DOOR) { hit = d; break; }
        }
        g.lineTo(enemy.x + Math.cos(a) * hit, enemy.y + Math.sin(a) * hit);
      }
      g.closePath();
      g.fillStyle = `rgba(${colour},.13)`;
      g.fill();
      g.strokeStyle = `rgba(${colour},.3)`;
      g.lineWidth = 1;
      g.stroke();
    }
  }

  function drawNoises(g, world) {
    for (const noise of world.noises) {
      const t = 1 - noise.life / noise.max;
      g.strokeStyle = `rgba(255,224,107,${(1 - t) * 0.5})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(noise.x, noise.y, noise.radius * t * 0.9, 0, 6.29);
      g.stroke();
    }
  }

  /*
   * Лежащее тело.
   *
   * Раньше сбитый рисовался тем же кружком, только повёрнутым, и понять,
   * что человек без сознания, было нельзя — он выглядел как стоящий, но
   * почему-то боком. Теперь тело вытянуто вдоль удара, голова смещена к
   * одному концу, силуэт плоский и тусклый. Дуга под телом показывает,
   * сколько ему осталось лежать: добить или бежать дальше — решение
   * игрока, и у него должны быть данные.
   */
  function prone(g, enemy, palette) {
    const angle = enemy.prone === undefined ? enemy.angle : enemy.prone;

    g.save();
    g.translate(enemy.x, enemy.y);

    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath();
    g.ellipse(3, 4, BODY * 1.9, BODY * 0.8, angle, 0, 6.29);
    g.fill();

    g.rotate(angle);

    /* Туловище — вытянутая капсула по оси падения. */
    g.fillStyle = palette.shirt;
    g.beginPath();
    g.ellipse(0, 0, BODY * 1.85, BODY * 0.72, 0, 0, 6.29);
    g.fill();

    g.fillStyle = palette.body;
    g.beginPath();
    g.ellipse(-2, 0, BODY * 1.5, BODY * 0.55, 0, 0, 6.29);
    g.fill();

    /* Голова у дальнего конца, руки в стороны — поза читается сразу. */
    g.fillStyle = palette.head;
    g.beginPath();
    g.ellipse(BODY * 1.55, 0, 5, 4.4, 0, 0, 6.29);
    g.fill();

    g.strokeStyle = palette.shirt;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -2);
    g.lineTo(-6, -BODY);
    g.moveTo(0, 2);
    g.lineTo(-5, BODY);
    g.stroke();

    g.restore();

    /* Сколько осталось лежать. */
    const left = enemy.downedFor ? enemy.downed / enemy.downedFor : 0;
    if (left > 0) {
      g.strokeStyle = 'rgba(255,224,107,.75)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(enemy.x, enemy.y, BODY * 2.2, -Math.PI / 2, -Math.PI / 2 + left * 6.28);
      g.stroke();
    }
  }

  function drawEnemies(g, world) {
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;

      const palette = PALETTE[enemy.kind] || PALETTE.thug;

      if (enemy.downed > 0) {
        prone(g, enemy, palette);

        if (enemy.hitFlash > 0) {
          g.save();
          g.globalAlpha = Math.min(1, enemy.hitFlash * 6);
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.ellipse(enemy.x, enemy.y, BODY + 3, BODY + 2, 0, 0, 6.29);
          g.fill();
          g.restore();
        }
        continue;
      }

      body(g, enemy.x, enemy.y, enemy.angle, palette, {
        weapon: enemy.weapon,
        swing: enemy.swing || 0,
        windup: enemy.windup || 0,
        state: actorState(enemy),
        phase: actorPhase(enemy),
        time: world.time,
        art: enemy.weapon === 'bat' ? 'thug_bat'
          : enemy.weapon === 'pistol' ? 'shooter_pistol' : 'brawler',
      });
      limbs(g, enemy, palette);

      /* Достали — тело на пару кадров белеет целиком. */
      if (enemy.hitFlash > 0) {
        g.save();
        g.globalAlpha = Math.min(1, enemy.hitFlash * 6);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(enemy.x, enemy.y, BODY + 3, BODY + 2, 0, 0, 6.29);
        g.fill();
        g.restore();
      }

      /* Замах — единственное предупреждение, и оно должно быть заметным. */
      if (enemy.windup > 0.05) {
        g.strokeStyle = `rgba(255,45,90,${Math.min(0.9, enemy.windup * 2.4)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(enemy.x, enemy.y, BODY + 6, 0, 6.29);
        g.stroke();
      }

      /*
       * Метка «можно тихо». Без неё удар со спины остаётся тайным знанием
       * для того, кто читал код: игрок должен видеть момент, а не угадывать
       * его по углу поворота чужой головы.
       */
      if (backstabReady(world, enemy)) {
        const pulse = 0.55 + Math.sin(world.time * 12) * 0.35;
        g.strokeStyle = `rgba(255,255,255,${pulse})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(enemy.x, enemy.y, BODY + 5, 0, 6.29);
        g.stroke();

        g.beginPath();
        g.moveTo(enemy.x - 4, enemy.y - BODY - 10);
        g.lineTo(enemy.x + 4, enemy.y - BODY - 4);
        g.moveTo(enemy.x + 4, enemy.y - BODY - 10);
        g.lineTo(enemy.x - 4, enemy.y - BODY - 4);
        g.stroke();
      }

      /*
       * Телеграф приёма. Размен читается только если чужой выбор виден
       * раньше удара — иначе это лотерея, а не решение.
       */
      /* Стойка: тусклое кольцо в цвете прикрытия, без буквы и без дуги. */
      if (enemy.duel && !enemy.move && enemy.guard && MOVES[enemy.guard]) {
        g.save();
        g.strokeStyle = MOVES[enemy.guard].colour;
        g.globalAlpha = 0.5;
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.arc(enemy.x, enemy.y, BODY + 7, 0, 6.29);
        g.stroke();
        g.restore();
      }

      if (enemy.duel && enemy.move && MOVES[enemy.move]) {
        const move = MOVES[enemy.move];

        /* Кольцо в цвете приёма: букву читать не обязательно, цвет виден
           боковым зрением, а в бою только оно и работает. */
        g.save();
        g.strokeStyle = move.colour;
        g.lineWidth = 2.5;
        g.shadowColor = move.colour;
        g.shadowBlur = 9;
        g.beginPath();
        g.arc(enemy.x, enemy.y, BODY + 8, 0, 6.29);
        g.stroke();
        g.restore();

        g.fillStyle = 'rgba(0,0,0,.8)';
        g.fillRect(enemy.x - 10, enemy.y - BODY - 26, 20, 18);
        g.strokeStyle = move.colour;
        g.lineWidth = 2;
        g.strokeRect(enemy.x - 10, enemy.y - BODY - 26, 20, 18);
        g.fillStyle = move.colour;
        g.font = '900 14px ui-monospace, monospace';
        g.fillText(move.short, enemy.x - 4.5, enemy.y - BODY - 13);
      }

      /*
       * Сколько ударов держит безоружный. Деления были, но еле заметные —
       * серые полоски в три пикселя под телом; на вопрос «почему он не
       * умер» они не отвечали. Теперь потраченное горит розовым, как
       * кровь, а оставшееся — белым, и оба заметно крупнее.
       */
      if (!enemy.weapon && enemy.hp !== undefined && enemy.hp < BARE_HP) {
        for (let i = 0; i < BARE_HP; i += 1) {
          g.fillStyle = i < enemy.hp ? '#ffffff' : '#ff2d95';
          g.fillRect(enemy.x - 10 + i * 9, enemy.y + BODY + 5, 7, 4);
        }
      }

      if (enemy.flash > 0) {
        g.fillStyle = 'rgba(255,224,107,.9)';
        g.beginPath();
        g.arc(enemy.x + Math.cos(enemy.angle) * 18, enemy.y + Math.sin(enemy.angle) * 18, 5, 0, 6.29);
        g.fill();
      }
    }
  }

  /*
   * Стрелка к выходу.
   *
   * В первоисточнике после зачистки на краю кадра появляется «GO!» со
   * стрелкой, и внизу написано, куда идти. Без этого на большом этаже
   * последняя минута уходит на поиск двери — самое скучное, что может
   * случиться после хорошей драки.
   *
   * Стрелка живёт у края экрана в стороне выхода и гаснет, когда выход
   * сам попал в кадр: подсказка нужна ровно до тех пор, пока не видно
   * цели.
   */
  function drawExitArrow(g, world, view) {
    if (!world.exitOpen || !world.player.alive) return;

    let exit = null;
    for (let i = 0; i < world.tiles.length && !exit; i += 1) {
      if (world.tiles[i] !== TILE.EXIT) continue;
      exit = {
        x: ((i % world.w) + 0.5) * TILE_SIZE,
        y: (Math.floor(i / world.w) + 0.5) * TILE_SIZE,
      };
    }
    if (!exit) return;

    const zoom = zoomFor();
    const halfW = viewW / (2 * zoom);
    const halfH = viewH / (2 * zoom);
    const dx = exit.x - view.x;
    const dy = exit.y - view.y;
    if (Math.abs(dx) < halfW - 40 && Math.abs(dy) < halfH - 40) return;

    const angle = Math.atan2(dy, dx);
    const edge = Math.min(halfW, halfH) - 26;
    const px = view.x + Math.cos(angle) * edge;
    const py = view.y + Math.sin(angle) * edge;
    const pulse = 0.6 + Math.sin(world.time * 8) * 0.3;

    g.save();
    g.translate(px, py);
    g.rotate(angle);
    g.globalAlpha = pulse;
    g.fillStyle = '#76ff9f';
    g.shadowColor = '#76ff9f';
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(-6, -8);
    g.lineTo(-2, 0);
    g.lineTo(-6, 8);
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawPlayer(g, world) {
    const player = world.player;
    if (!player.alive) return;

    /*
     * Метроном вокруг игрока.
     *
     * Кольцо, расходившееся после доли, показывало прошлое: пока его
     * увидишь, бить уже поздно. Теперь оно сжимается — приходит из
     * темноты и садится на плечи ровно в долю. Бить надо, когда оно
     * коснулось: это читается без объяснений, как прицел в ритм-играх.
     *
     * В окне попадания кольцо загорается кислотным и толстеет, за окном
     * остаётся тусклой серой ниткой. Промахнуться мимо такта, глядя на
     * него, уже трудно.
     */
    const beat = beatAhead(world);
    const reach = BODY + 30;
    const near = BODY + 5;
    const radius = near + (beat.toNext / BEAT_PERIOD) * (reach - near);

    g.save();
    if (beat.inWindow) {
      g.strokeStyle = '#76ff9f';
      g.globalAlpha = 0.95;
      g.lineWidth = 3;
    } else {
      g.strokeStyle = '#9a8fb5';
      g.globalAlpha = 0.5;
      g.lineWidth = 1.5;
    }
    g.beginPath();
    g.arc(player.x, player.y, Math.min(reach, Math.max(near, radius)), 0, 6.29);
    g.stroke();
    g.restore();

    /* Вспышка в самый момент доли: короткая, чтобы её было видно краем глаза. */
    if (world.fx.beat > 0.55) {
      g.save();
      g.globalAlpha = (world.fx.beat - 0.55) * 1.6;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(player.x, player.y, near, 0, 6.29);
      g.stroke();
      g.restore();
    }

    body(g, player.x, player.y, player.angle, PALETTE.player, {
      weapon: player.weapon === 'fists' ? null : player.weapon,
      art: player.weapon === 'bat' ? 'player_bat'
        : player.weapon === 'pistol' ? 'player_pistol' : 'player',
      swing: player.swing,
      state: actorState(player),
      phase: actorPhase(player),
      time: world.time,
      mine: true,
      /* Замах отклоняет корпус назад: вес приёма видно по всему телу. */
      lean: player.moveStart > 0 ? -2 : 0,
    });
    limbs(g, player, PALETTE.player);

    /*
     * Дуга удара прочерчивается по ходу замаха, а не висит целиком: так
     * видно и что удар состоялся, и куда он пришёлся. Попадание заливает
     * сектор белым, промах остаётся тонкой линией.
     */
    if (player.swing > 0 && WEAPONS[player.weapon].kind === 'melee') {
      const weapon = WEAPONS[player.weapon];
      const done = Math.min(1, 1 - player.swing / 0.22);
      const from = player.angle - weapon.arc / 2;
      const to = from + weapon.arc * done;
      const hit = player.swingHit > 0;

      g.beginPath();
      g.moveTo(player.x, player.y);
      g.arc(player.x, player.y, weapon.reach, from, to);
      g.closePath();
      /*
       * Удар должно быть видно.
       *
       * Дуга была тонкой линией на четверть секунды, и на большом экране
       * её просто не замечали: «ударов не видно». Теперь у неё три
       * слоя — заливка сектора, толстая кромка и след из двух затухающих
       * дуг позади, — и живёт она чуть дольше самого удара.
       *
       * Цвет говорит отдельно: попадание в долю музыки светится
       * кислотным, обычное — белым.
       */
      const ink = player.beatHit > 0 ? '118,255,159' : '255,255,255';
      const force = hit ? Math.min(1, player.swingHit * 5) : Math.min(0.5, player.swing * 3);

      g.fillStyle = hit ? `rgba(${ink},${0.1 + player.swingHit * 1.6})` : `rgba(255,255,255,${0.05 + player.swing * 0.4})`;
      g.fill();

      /* След: две дуги позади основной, уже погасшие наполовину. */
      for (let ghost = 1; ghost <= 2; ghost += 1) {
        const back = to - weapon.arc * done * 0.22 * ghost;
        if (back <= from) break;
        g.strokeStyle = `rgba(${ink},${force * (0.28 / ghost)})`;
        g.lineWidth = 7 - ghost * 2;
        g.beginPath();
        g.arc(player.x, player.y, weapon.reach - ghost, from, back);
        g.stroke();
      }

      g.save();
      g.strokeStyle = `rgba(${ink},${Math.min(0.98, force + 0.25)})`;
      g.lineWidth = hit ? 5 : 3;
      g.shadowColor = hit ? `rgba(${ink},.9)` : 'rgba(255,255,255,.5)';
      g.shadowBlur = hit ? 12 : 6;
      g.beginPath();
      g.arc(player.x, player.y, weapon.reach, from, to);
      g.stroke();
      g.restore();
    }

    if (player.flash > 0) {
      g.fillStyle = 'rgba(255,240,180,.95)';
      g.beginPath();
      g.arc(player.x + Math.cos(player.angle) * 19, player.y + Math.sin(player.angle) * 19, 6, 0, 6.29);
      g.fill();
    }
  }

  function drawBullets(g, world) {
    for (const bullet of world.bullets) {
      const angle = Math.atan2(bullet.vy, bullet.vx);
      g.save();
      g.translate(bullet.x, bullet.y);
      g.rotate(angle);
      g.fillStyle = bullet.from === 'player' ? '#fff6c9' : '#ff8f6b';
      g.fillRect(-9, -1, 12, 2);
      g.globalAlpha = 0.35;
      g.fillRect(-22, -0.5, 16, 1);
      g.restore();
      g.globalAlpha = 1;
    }
  }

  function hexToRgba(hex, alpha) {
    const value = parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function drawPops(g, world) {
    /*
     * Числа над телами. Всплывают и гаснут: за секунду видно, что этот
     * удар стоил дороже прошлого, и цепочку начинают беречь.
     */
    for (const label of world.numbers) {
      const done = 1 - label.life / label.span;
      g.save();
      g.globalAlpha = Math.min(1, label.life * 3);
      g.fillStyle = label.colour;
      g.font = '900 11px ui-monospace, SFMono-Regular, monospace';
      g.textAlign = 'center';
      g.shadowColor = 'rgba(0,0,0,.9)';
      g.shadowBlur = 4;
      g.fillText(label.text, label.x, label.y - 12 - done * 16);
      g.restore();
    }

    for (const ring of world.pops) {
      const t = 1 - ring.life / ring.span;
      g.strokeStyle = `rgba(${ring.colour},${(1 - t) * 0.9})`;
      g.lineWidth = 3 * (1 - t) + 1;
      g.beginPath();
      g.arc(ring.x, ring.y, ring.r + (ring.max - ring.r) * t, 0, 6.29);
      g.stroke();
    }
  }

  function drawParticles(g, world) {
    for (const particle of world.particles) {
      g.globalAlpha = Math.max(0, particle.life / particle.max);
      g.fillStyle = particle.color;
      g.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    g.globalAlpha = 1;
  }

  let beatGlow = 0;

  function vignette(g, theme) {
    const grad = g.createRadialGradient(
      viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.32,
      viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.78,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${0.72 - (beatGlow || 0) * 0.06})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, viewW, viewH);
  }

  return { resize, draw, invalidate, zoomFor };
}
