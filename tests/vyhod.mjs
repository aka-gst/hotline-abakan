/*
 * Выход на сайт: три исхода, а не два.
 *
 * Проверка, знающая только «ушли», зеленеет на сломанном. Ломается тут
 * порядок: если переход отменяют ПОСЛЕ вопроса, браузер успевает уйти,
 * пока человек читает, — и «отмена» отменяет случившееся. Поэтому
 * средняя строка («отменил — остался») здесь главная.
 *
 * Обработчик живёт в main.js, который трогает документ и в узел не
 * импортируется. Значит проверять его можно только одним способом:
 * поднять кусок разметки и кода на поддельном документе. Правило
 * решения вынесено в src/exit.js и проверяется прямо.
 */
import { EXIT_URL, EXIT_QUESTION, needsConfirm } from '../src/exit.js';

let failed = 0;
const report = [];
function check(name, ok, note = '') {
  if (!ok) failed += 1;
  report.push(` ${ok ? ' ok ' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
}

/* --- где спрашиваем ---------------------------------------------------- */

check('в бою спрашиваем', needsConfirm('play') === true);
check('в паузе спрашиваем', needsConfirm('pause') === true);
check('на заставке не спрашиваем', needsConfirm('call') === false, 'терять нечего');
check('после гибели не спрашиваем', needsConfirm('dead') === false,
  'попытка кончилась, лишний вопрос приучает жать «да» не глядя');

/* --- цена названа словами ---------------------------------------------- */

check('вопрос называет цену, а не только спрашивает', /прогресс|сохран/i.test(EXIT_QUESTION),
  `«${EXIT_QUESTION}»`);
check('адрес выхода ведёт на сайт', /^https:\/\/aka-gst\.ru\//.test(EXIT_URL), EXIT_URL);

/* --- три исхода на поддельном щелчке ------------------------------------ */

/*
 * Повторяем ровно тот порядок, что в main.js, и смотрим, где окажется
 * адрес. Ответ «нет» обязан удержать страницу — это и есть та строка,
 * ради которой проверка написана.
 */
function shchelchok({ scene, otvet }) {
  const state = { ushli: null, otmenen: false, sprosili: false };
  const event = { preventDefault() { state.otmenen = true; } };
  const okno = {
    confirm(text) { state.sprosili = true; state.vopros = text; return otvet; },
    location: { set href(value) { state.ushli = value; } },
  };
  /* — тот же порядок, что в игре — */
  event.preventDefault();
  if (!(needsConfirm(scene) && !okno.confirm(EXIT_QUESTION))) okno.location.href = EXIT_URL;
  return state;
}

{
  const bezPartii = shchelchok({ scene: 'call', otvet: false });
  check('без партии вопроса нет и уходим сразу',
    bezPartii.sprosili === false && bezPartii.ushli === EXIT_URL);

  const otmena = shchelchok({ scene: 'play', otvet: false });
  check('отменил — остались на месте',
    otmena.sprosili === true && otmena.ushli === null && otmena.otmenen === true,
    'переход отменён до вопроса, а не после');

  const soglasie = shchelchok({ scene: 'play', otvet: true });
  check('согласился — ушли', soglasie.sprosili === true && soglasie.ushli === EXIT_URL);
}

/* --- поломкой ----------------------------------------------------------- */

/*
 * Отрицательный контроль: перевираем порядок так, как это пишется чаще
 * всего — сначала спросить, потом отменять, — и убеждаемся, что средняя
 * строка краснеет. Без этого куска проверка не доказывает ничего.
 */
{
  const state = { ushli: null };
  const okno = { confirm: () => false, location: { set href(v) { state.ushli = v; } } };
  /* Сломанный порядок: переход уже случился к моменту ответа. */
  okno.location.href = EXIT_URL;
  const otvet = okno.confirm(EXIT_QUESTION);
  if (!otvet) { /* отменять уже нечего */ }
  check('сломанный порядок ловится', state.ushli === EXIT_URL,
    'при «спросить, потом отменить» страница уходит до ответа');
}

console.log(report.join('\n'));
console.log(failed ? `\nПРОВАЛЕНО ПРОВЕРОК: ${failed}` : '\nвыход на сайт работает');
process.exit(failed ? 1 : 0);
