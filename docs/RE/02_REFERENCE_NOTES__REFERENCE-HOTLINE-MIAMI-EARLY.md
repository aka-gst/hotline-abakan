# Hotline Miami — static reference notes

Это не декомпиляция для копирования исходников. Это список наблюдаемых архитектурных принципов, которые можно независимо реализовать в HOTLINE ABAKAN.

## Что было изучено

Предоставленный GOG Linux installer был распакован **как контейнер**, без запуска чужого установщика или игрового бинарника. Внутри обнаружены native ELF-бинарник и отдельный большой game-data WAD. Бинарник не stripped, поэтому в нём сохранились имена GML-функций/объектов.

## Полезные наблюдения

### 1. Игрок разделён на узкие подсистемы

В символах есть отдельные player controller / mouse controller и специализированные scripts для attack, lock-on, animation end и взаимодействий. Вывод для нашей игры: не возвращаться к монолитному `app.js`; держать ввод, combat state и presentation раздельно.

### 2. AI — набор узких состояний

Обнаружены отдельные scripts/объекты для:

- See Player
- Hear Player
- Chase Player
- Search / Melee Search
- Find Weapon
- Go Get Weapon
- stationary / mobile / patrol / melee variants

Вывод: читаемый AI получается из маленьких предсказуемых состояний, а не из одного «умного» универсального поведения.

### 3. Коллизия простая и дискретная

В player movement видны повторяющиеся проверки `place_meeting(...)` по геометрии. Для быстрого top-down combat это полезнее тяжёлой физики: движение должно останавливаться предсказуемо и мгновенно.

### 4. Двери — игровые объекты

У горизонтальных/вертикальных дверей есть отдельные collision events для player и enemy. Вывод: дверь должна менять бой, а не только оформлять комнату.

### 5. Downed enemy — отдельное состояние взаимодействия

Есть отдельный `BashDownedEnemy` control path и связанные enemy execution/head-kick объекты. Вывод: «уронить» и «убить» — разные состояния, создающие короткое тактическое решение.

### 6. Оружие живёт в мире

Есть отдельные world weapon / weapon throw / specific weapon сущности и AI scripts поиска/подбора оружия. Вывод: труба не должна быть «режимом игрока» — она принадлежит комнате и может переходить между участниками.

### 7. Tutorial собран пространством

В tutorial-room по таблице символов размещены несколько врагов, тяжёлых стен, источников света, дверей и конкретных weapon objects. Механика обучается arrangement'ом комнаты, а не одной подсказкой поверх HUD.

### 8. Комнаты плотные и ручные

В выборке обычных rooms десятки явно размещённых объектов: стены/окна, мебель, двери, враги, оружие. Вывод: пустой прямоугольник с одним NPC — не Hotline-плотность. Однако плотность должна проходить навигационный тест и оставлять читаемые линии движения.

## Что уже перенесено независимо в Slice 05

- ограниченное зрение + FOV;
- LOS через solid geometry;
- hearing events;
- investigate / search / chase;
- боевые двери;
- knockdown → contextual finisher;
- одна shared pipe;
- плотнее authored layout;
- простой deterministic collision подход;
- автоматический critical-route test.

## Что логично исследовать дальше

- weapon throw и ricochet/impact semantics;
- door hit direction / knockback;
- enemy alert propagation между комнатами;
- scoring/combo incentives;
- быстрый restart cadence;
- room readability: camera framing, light cones, color hierarchy;
- enemy archetypes как разные узкие state machines, а не просто разные HP.

Никакие оригинальные Hotline Miami `.wad`, executable, sprites, tracks или SFX в HOTLINE ABAKAN не включены.
