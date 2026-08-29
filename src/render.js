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
import { TILE_SIZE, BODY, WEAPONS, MOVES, BARE_HP, backstabReady } from './world.js';

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
   * Масштаб от короткой стороны экрана. По ней же считается, как далеко
   * игрок видит, — а от этого зависит, с какого расстояния стрелкам
   * разрешено открывать огонь. Иначе на телефоне убивают из-за края кадра.
   */
  function zoomFor() {
    const short = Math.min(viewW, viewH);
    return Math.max(1.05, Math.min(2, short / 520));
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

      sprite(g, art, x, y, angle, 32);

      if (opts.weapon && opts.weapon !== 'fists') {
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

    g.save();
    g.translate(x, y);

    /* Жёсткая тень со смещением — весь объём этой игры держится на ней. */
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath();
    g.ellipse(3, 4, BODY + 2, BODY + 1, 0, 0, 6.29);
    g.fill();

    g.rotate(angle);

    if (opts.weapon) drawWeapon(g, opts.weapon, opts.swing || 0, opts.windup || 0);

    /* Тёмная масса тела: неон должен гореть, а не тонуть в заливке. */
    g.fillStyle = palette.body;
    g.beginPath();
    g.ellipse(lean, 0, BODY + 1, BODY, 0, 0, 6.29);
    g.fill();

    /* Кромка. Свечение включается только у неё — иначе кадр плывёт. */
    g.save();
    g.strokeStyle = palette.neon;
    g.lineWidth = 2;
    g.shadowColor = palette.neon;
    g.shadowBlur = 10;
    g.beginPath();
    g.ellipse(lean, 0, BODY + 1, BODY, 0, 0, 6.29);
    g.stroke();
    g.restore();

    /* Плечи: по ним читается направление даже на мелком экране. */
    g.fillStyle = palette.neon;
    g.globalAlpha = 0.5;
    g.fillRect(-2, -BODY + 2, 5, BODY * 2 - 4);
    g.globalAlpha = 1;

    /* Визор — единственная по-настоящему яркая деталь. */
    g.fillStyle = palette.visor;
    g.beginPath();
    g.ellipse(4.5, 0, 3, 5, 0, 0, 6.29);
    g.fill();

    g.save();
    g.shadowColor = palette.visor;
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    g.fillRect(6, -3.5, 1.6, 7);
    g.restore();

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
  function limbs(g, ent, palette) {
    const id = ent.move;
    if (!id || !MOVES[id]) return;

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
  const PALETTE = {
    player: { body: '#14231a', neon: '#76ff9f', visor: '#ffe06b' },
    brawler: { body: '#0e2230', neon: '#2ce8ff', visor: '#9bf6ff' },
    thug: { body: '#2a0a1b', neon: '#ff1f8f', visor: '#ffd0e8' },
    shooter: { body: '#2a1408', neon: '#ff9b2d', visor: '#ffe0b3' },
    dead: { body: '#1a1420', neon: '#4a3d55', visor: '#6d5c76' },
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
    camX = worldW <= halfW * 2 ? worldW / 2 : Math.max(halfW, Math.min(worldW - halfW, camX));
    camY = worldH <= halfH * 2 ? worldH / 2 : Math.max(halfH, Math.min(worldH - halfH, camY));

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
      body(g, corpse.x + jitter, corpse.y, corpse.angle, PALETTE.dead, { lean: 3, art: 'corpse' });
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

      /* Стойкость безоружного: три деления, по одному за попадание. */
      if (!enemy.weapon && enemy.hp !== undefined && enemy.hp < BARE_HP) {
        for (let i = 0; i < BARE_HP; i += 1) {
          g.fillStyle = i < enemy.hp ? '#ffffff' : 'rgba(255,255,255,.18)';
          g.fillRect(enemy.x - 9 + i * 7, enemy.y + BODY + 4, 5, 3);
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

  function drawPlayer(g, world) {
    const player = world.player;
    if (!player.alive) return;

    body(g, player.x, player.y, player.angle, PALETTE.player, {
      weapon: player.weapon === 'fists' ? null : player.weapon,
      art: player.weapon === 'bat' ? 'player_bat'
        : player.weapon === 'pistol' ? 'player_pistol' : 'player',
      swing: player.swing,
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
      const done = Math.min(1, 1 - player.swing / 0.16);
      const from = player.angle - weapon.arc / 2;
      const to = from + weapon.arc * done;
      const hit = player.swingHit > 0;

      g.beginPath();
      g.moveTo(player.x, player.y);
      g.arc(player.x, player.y, weapon.reach, from, to);
      g.closePath();
      g.fillStyle = hit ? `rgba(255,255,255,${player.swingHit * 1.6})` : 'rgba(255,255,255,.07)';
      g.fill();

      g.strokeStyle = hit
        ? `rgba(255,255,255,${Math.min(0.95, player.swingHit * 5)})`
        : `rgba(255,255,255,${player.swing * 3})`;
      g.lineWidth = hit ? 4 : 2;
      g.beginPath();
      g.arc(player.x, player.y, weapon.reach, from, to);
      g.stroke();
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
