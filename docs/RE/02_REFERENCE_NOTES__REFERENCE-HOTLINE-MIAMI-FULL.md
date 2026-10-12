# Hotline Miami — full static reference map for HOTLINE ABAKAN

Цель этого документа — не перенос исходников или ассетов Hotline Miami. Предоставленная пользователем полная сборка использовалась как **статический behavioural / architectural reference**. В HOTLINE ABAKAN переносим только независимо реализованные правила, состояния, относительные тайминги и level-design принципы.

## 1. Что было исследовано

Архив `hotline_miami.rar` распакован как контейнер без запуска игровых `.exe`/`.dll`.

Windows-сборка содержит две ветки одной игры:

- `HotlineMiami_Original.exe` — старая GameMaker-ветка (~20 MB);
- `HotlineGL.exe` + `HotlineMiami_GL.wad` — GL/Studio-ветка;
- отдельный launcher и библиотеки;
- оригинальные музыкальные `.ogg`.

Для сопоставления также использована ранее извлечённая Linux GOG-версия той же GL-ветки. Её native ELF не stripped, поэтому в symbol table сохранились имена GameMaker objects, rooms, events и scripts. Это позволило восстановить **структуру систем**, не декомпилируя GML в исходный код.

Ни один оригинальный executable, WAD, soundtrack, sprite, texture или SFX не включается в сборку HOTLINE ABAKAN.

## 2. Карта GL WAD

Индекс `HotlineMiami_GL.wad` читается как таблица `name / size / relative offset`, после которой лежит payload.

Статическая инвентаризация Windows WAD:

- всего записей: **634**;
- `GL/AssetScripts`: **411**;
- `.phyre`: **491**;
- `.wav`: **74**;
- `.fnt`: **55**;
- metadata `.bin`: **12**.

Среди metadata присутствуют отдельные таблицы для rooms, objects, sprites, sounds, collision masks/events, atlases, fonts и localization. Это подтверждает, что уровень/коллизия/объекты существуют как раздельные слои данных, а не как один монолитный scene dump.

## 3. Gameplay map из Linux symbol table

Из symbol table получены:

- **375** именованных `scr...` gameplay scripts;
- **804** object-event groups;
- **122** именованных rooms.

Это не означает 375 уникальных механик. Важнее архитектурный вывод: экранно простая игра разбита на большое количество маленьких специализированных контроллеров.

## 4. Player / combat pipeline

Найдены отдельные paths для:

- attack control: `scrCtrlAttack`, `scrGetAttack`;
- animation completion: `scrPlayerAnimationEnd`;
- pickup/throw: player pickup/throw control + отдельный world thrown-weapon object;
- lock-on / nearest-lockable;
- downed-enemy execution: `scrCtrlBashDownedEnemy*`;
- line/collision helpers.

### Вывод для нас

Игрок не должен иметь один огромный `update()` со всеми исключениями. Input, attack state, world weapon, execution и presentation должны оставаться раздельными маленькими системами.

## 5. Enemy architecture

В оригинале есть отдельные контроллеры / scripts для:

- stationary;
- mobile;
- patrol;
- random;
- melee;
- police variants;
- dog variants;
- boss/SWAT-special cases.

И отдельно:

- `SeePlayer` / stationary sight;
- `HearPlayer`;
- `ChasePlayer`;
- `ChaseSearch`;
- `Search` / `MeleeSearch`;
- `FindWeapon`;
- `GoGetWeapon` / `GetWeapon`.

### Вывод для нас

Различие врагов должно идти прежде всего из **поведенческого state machine**, а не из HP/color. Slice 06 вводит `sentry`, `patrol`, `brute`, `opportunist` как минимальную независимую реализацию этого принципа.

## 6. Perception

Структура scripts подтверждает отдельные sight/hearing/search paths. Это создаёт цепочку:

`не знает → услышал → идёт к источнику → ищет → увидел → преследует → потерял → проверяет последнюю точку`.

### Что уже у нас

Slice 05+ использует ограниченный FOV, LOS через solid geometry, hearing radius, last-known position, investigate/search/chase и потерю контакта.

## 7. Двери

`objDoorH` / `objDoorV` имеют отдельные collision events для player, обычных врагов и специальных типов. Это подтверждает: дверь — **combat object**, а не decoration.

### Что берём

- закрытая дверь блокирует движение и sight;
- открытие создаёт шум;
- створка может сбить врага;
- дверь работает теми же правилами пространства для игрока и AI.

## 8. World weapon lifecycle

Отдельные сущности/события существуют для weapon pickup и weapon throw. Thrown weapon сталкивается с solid geometry, doors и другими типами преград.

Sprite metadata также показывает отдельные walk/sneak/attack наборы под разные виды оружия. Следовательно оружие меняет **полный action profile**, а не только урон.

### Минимальный вариант HOTLINE ABAKAN

Пока оставляем одно world-weapon — трубу:

`на полу → подобрал игрок/враг → новый moveset → выбил/положил/метнул → снова world object`.

Slice 06 добавляет `E`-throw с физическим полётом по 2D collision graph и knockdown при попадании.

## 9. Downed / execution

Наличие отдельного `BashDownedEnemy` path и execution/death presentation подтверждает разделение состояний:

`жив → оглушён/лежит → добит`, а не просто HP > 0 / HP <= 0.

### Что берём

В нашей реализации heavy/door/throw могут уложить. Лежащий враг имеет окно подъёма. `F` рядом — отдельное contextual execution.

## 10. Level density / tutorial composition

По room-object table tutorial-room содержит как минимум:

- `objEnemy`: **3**;
- `objLight`: **3**;
- heavy wall objects: **3**;
- vertical doors: **2**;
- horizontal door: **1**;
- specific weapon objects: **2**.

То есть обучение построено **расстановкой игровых объектов**. Комната объясняет правило через стену/дверь/врага/оружие, а не только через UI.

122 rooms также показывают большое количество вручную собранных layouts: дома, квартиры, бары, отель, полицейские этажи, train station и т.д. В room-object maps регулярно встречается высокая плотность дверей, мебели, окон, стен, света и специальных объектов.

По 121 room с восстановимой object-table медиана — **14 размещённых gameplay/decor objects**, среднее — **18.9**, а самые плотные rooms доходят до **78** размещений. Эти числа нельзя буквально переносить в нашу 3D-камеру, но они подтверждают принцип: уровень редко состоит из «голой комнаты + одного врага».

### Вывод для нас

Каждая комната должна отвечать на вопрос: **какое решение она предлагает?**

Не `ещё один враг`, а, например:

- патруль за дверью;
- line-of-sight вокруг стола;
- возможность сбить дверью;
- objective, который надо забрать;
- одно оружие, к которому могут побежать оба;
- маршрут ухода после цели.

## 11. Score / style

В symbols есть отдельные подсистемы:

- mobility score;
- flexibility score;
- used guns;
- used melee;
- used throws;
- used kills;
- grades.

Это важный дизайн-сигнал: результат оценивает не только число убитых, но **манеру прохождения**.

### Наша независимая версия в Slice 06

Style chain награждает:

- разные типы ударов;
- успешный dodge;
- block/parry;
- door bash;
- finisher;
- pickup/throw;
- выполнение objective.

Повтор одного действия почти не растит multiplier. Разные решения внутри короткого окна поднимают style multiplier. В конце считается собственный grade S–D.

Числа и формула наши; оригинальная формула не копировалась.

## 12. Mission structure

В оригинале присутствуют `Checkpoint`, `CheckMissionComplete`, chapter/restart и score-story paths. Для нас главный вывод: **убийство всех не обязано быть единственной целью уровня**.

Slice 06 меняет «Жукова 3»:

- задача: забрать кассету;
- пятая дверь после кладовки не открывается только от убийства;
- нужно физически подобрать objective через `F`;
- затем финальная комната и выход.

Это даёт нарративную причинность: мы пришли не «потому что уровень существует», а за конкретной вещью.

## 13. Что намеренно НЕ копируется

Не переносим:

- исходный/машинный код Hotline Miami;
- WAD / Phyre resources;
- sprites / textures / fonts;
- оригинальные rooms как координаты 1:1;
- dialogue/text;
- музыку и звуки;
- точную score formula;
- названия/визуальный дизайн персонажей;
- коммерческие assets.

Переносим только общие функциональные идеи и independently authored implementation.

## 14. Новый baseline после исследования

Приоритет систем на следующие iterations:

1. authored room problem;
2. readable perception + enemy archetype;
3. world objects with shared rules;
4. mission goal beyond kill-all;
5. weapon lifecycle including throw;
6. style/grade for improvisation;
7. fast checkpoint restart;
8. impact/presentation;
9. только потом новые виды оружия/врагов.

Это становится основной design map для HOTLINE ABAKAN после Slice 06.
