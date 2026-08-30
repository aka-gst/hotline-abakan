/*
 * Обезличенный счётчик.
 *
 * Тот же Umami, что стоит на главной сайта и на остальных играх: без кук,
 * без профилей, без идентификаторов человека. Отправляется только то, по
 * чему видно, где игра теряет людей: дошли ли до боя, на каком этаже
 * умирают, доходят ли до конца и с каким рангом.
 *
 * Сюда не попадает ничего про человека: ни ника из вызова, ни кода
 * уровня, ни зерна — по коду уровня можно узнать, кто кому что переслал.
 * Только номер этажа, его тема и числа забега.
 *
 * Счётчик не должен ломать игру: если его заблокировали расширением или
 * он не загрузился, все вызовы молча ничего не делают.
 */

function send(event, data) {
  try {
    if (typeof window.umami?.track === 'function') window.umami.track(event, data);
  } catch (error) { /* счётчик не должен ломать игру */ }
}

export const pulse = {
  /* Заход на этаж: точка, от которой считается всё остальное. */
  floorStarted(level, index, attempt) {
    send('floor-start', {
      floor: index + 1,
      theme: level.theme || 0,
      made: Boolean(level.seed) ? 'random' : 'campaign',
      attempt,
    });
  },

  /* Поражение с числами: видно, на каком этаже и как быстро умирают. */
  died(level, index, world, attempt) {
    send('floor-died', {
      floor: index + 1,
      theme: level.theme || 0,
      killed: world.kills,
      total: world.total,
      seconds: Math.round(world.time),
      attempt,
    });
  },

  /* Победа с рангом и временем — единственное, что говорит, играют ли
     всерьёз или закрывают на первой минуте. */
  cleared(level, index, world, result, attempt) {
    send('floor-clear', {
      floor: index + 1,
      theme: level.theme || 0,
      rank: result.rank,
      score: result.total,
      seconds: Math.round(world.time),
      attempt,
    });
  },

  /* Ключевые экраны: карточка звонка и итоги — те места, откуда уходят. */
  screen(name) {
    send('screen', { name });
  },
};
