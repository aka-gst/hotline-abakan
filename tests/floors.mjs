/*
 * Список своих этажей.
 *
 * Проверяется без браузера: модулю подсовывается поддельное хранилище.
 * Смысла в этом больше, чем кажется, — список переживает перезагрузку, и
 * ошибка в нём стирает то единственное, что игрок в игре накопил.
 */
const box = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
  },
};

const { readFloors, saveFloor, forgetFloor, markResult, sameFloor } = await import('../src/floors.js');

let failed = 0;
const check = (name, ok, note = '') => {
  if (!ok) failed += 1;
  console.log(` ${ok ? ' ok ' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

check('пустой список читается', readFloors().length === 0);

saveFloor({ seed: 42, title: 'БАР · ЭТАЖ 42', score: 100, rank: 'C', time: 30 });
check('этаж сохраняется', readFloors().length === 1);

saveFloor({ seed: 42, title: 'БАР · ЭТАЖ 42', score: 500, rank: 'B', time: 20 });
check('тот же этаж не заводится дважды', readFloors().length === 1);

saveFloor({ code: 'ABC', title: 'ЧУЖОЙ' });
check('нарисованный этаж хранится кодом', readFloors().length === 2);

markResult({ seed: 42 }, 900, 'A', 15);
check('лучший результат записывается', readFloors().find((f) => f.seed === 42).score === 900);

markResult({ seed: 42 }, 100, 'D', 60);
check('худший результат не затирает лучший',
  readFloors().find((f) => f.seed === 42).score === 900);

forgetFloor({ seed: 42 });
check('этаж забывается', readFloors().length === 1 && readFloors()[0].code === 'ABC');

for (let i = 0; i < 20; i += 1) saveFloor({ seed: 1000 + i, title: `ЭТАЖ ${i}` });
check('список не растёт бесконечно', readFloors().length === 12, `${readFloors().length}`);
check('свежий этаж наверху', readFloors()[0].seed === 1019);

check('этажи различаются по зерну и коду',
  sameFloor({ seed: 5 }, { seed: 5 }) && !sameFloor({ seed: 5 }, { seed: 6 })
  && sameFloor({ code: 'X' }, { code: 'X' }) && !sameFloor({ code: 'X' }, { code: 'Y' }));

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nсписок этажей работает');
process.exit(failed ? 1 : 0);
