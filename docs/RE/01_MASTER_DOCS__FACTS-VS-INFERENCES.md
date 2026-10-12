# Facts vs inferences — Hotline Miami reverse engineering

Цель файла — не дать следующему чату превратить наши выводы в «доказанные факты».

## Подтверждено статически напрямую

### Source/container level
- Пользователь предоставил две разные сборки: Windows archive `hotline_miami.rar` и GOG Linux archive `Hotline Miami [GOG] [Linux].rar`.
- Windows archive содержит `HotlineMiami_Original.exe` (~20.7 MB), `HotlineGL.exe` (~8.1 MB), `HotlineMiami_GL.wad` (~359 MB), DLL и soundtrack `.ogg`.
- GOG Linux payload содержит ELF `Hotline`, `HotlineMiami_GL.wad` и soundtrack.
- Linux `Hotline` — **ELF 32-bit x86, dynamically linked, not stripped**.
- Linux ELF BuildID: `2ca59bc303cc6e3ac271d9e14befe106742ca49f`.
- Деманглированный symbol table даёт **375 уникальных `gml::scr*` function names** нашим текущим extractor'ом.
- Raw symbol parsing даёт **803 уникальных `obj*` names** и **2131 уникальную object-event function**. Это более точные raw-цифры текущего extractor'а; ранняя заметка «804 object-event groups» была грубым/другим способом группировки.
- Явных room create symbols вида `Rooms_*_rm*__Create` текущий extractor находит **80**. Ранний full-reference документ указывает **122 named rooms** по более широкому room metadata/symbol inventory. Эти две цифры измеряют разные вещи и не должны подменять друг друга.

### Exact Linux WAD format
Linux GOG `HotlineMiami_GL.wad` разобран точно по индексу:

```
uint32 index_size
uint32 entry_count
repeat entry_count:
    uint32 name_length
    byte[name_length] name
    uint32 resource_size
    uint32 payload_relative_offset
payload starts at byte index_size
```

Для исследованной Linux версии:
- `index_size = 31180`;
- `entry_count = 633`;
- parsed index ends exactly at byte `31180`;
- `GL/AssetScripts/` entries: **410**;
- extensions: `.phyre` 490, `.wav` 74, `.fnt` 55, `.bin` 12, `.ini` 1, `.png` 1.

Ранний reference для Windows WAD фиксировал 634 / 411 / 491 соответственно. Это похоже на **version/build difference**, а не ошибку формата. Не смешивать Windows и Linux counts без подписи версии.

### Named gameplay systems found in symbols
Прямо присутствуют function names, среди прочего:
- `scrCtrlAttack`, `scrGetAttack`, `scrPlayerAnimationEnd`;
- `scrCtrlPickUpThrow`, `scrGetWeapon`, `scrFindWeapon`;
- `scrCtrlBashDownedEnemy`, `scrCtrlBashDownedEnemyInit`;
- `scrSeePlayer`, `scrHearPlayer`, `scrChasePlayer`, `scrChaseSearch`, `scrStopSearch`;
- `scrEMeleeInit`, `scrEMeleeStep`, `scrEPatrolInit`, `scrEPatrolStep`, `scrESwatInit`, `scrESwatStep`, dog/fat/random/mobile variants;
- `scrCheckpoint`, `scrCheckMissionComplete`;
- `scrCountFlexibilityScore`, `scrCountMobilityScore`, `scrCheckUsedGuns`, `scrCheckUsedMelee`, `scrCheckUsedThrows`, `scrCheckUsedKills`, `scrCheckGrades`;
- collision/line helpers and room export/load paths.

Полный список лежит в `03_SOURCE_MANIFESTS/linux_gameplay_script_names.txt`.

### Doors / room objects
Symbol table содержит object-event functions для дверей и множества player/enemy/special object collision/event paths. Room create symbols явно создают authored objects, включая doors/furniture/enemies/props.

## Сильный вывод, но не «прочитанный исходник»

Следующие утверждения — инженерные выводы из имён функций, object events и room composition. Они хорошо поддержаны структурой, но мы **не декомпилировали оригинальный GML source**:

- AI построен как набор небольших специализированных states/controllers, а не один универсальный behavior tree.
- Sight, hearing, chase и search — отдельные control paths.
- Door objects участвуют в combat/collision graph, а не являются только визуальным декором.
- World weapon lifecycle отделён от player state: pickup/throw/find/get weapon paths существуют отдельно.
- Downed/execution — отдельное состояние gameplay, а не только «HP > 0 / dead».
- Score оценивает несколько категорий поведения, а не только kills.
- Tutorial/rooms обучают через authored arrangement объектов.

## Наши собственные design decisions, НЕ факты оригинала

Это уже HOTLINE ABAKAN и не должно приписываться Hotline Miami:
- `L hold = block`, late `L = parry`;
- `SPACE = dodge`, `SHIFT = quiet walk`;
- одна shared pipe как основной world weapon;
- `E = throw pipe`;
- cassette objective;
- sentry/patrol/brute/opportunist/flanker именно с нашими параметрами;
- attack-token для читаемого 2×1;
- наши score values/multiplier/grade S–D;
- наша 3D apartment geometry, scale bible, cutaway walls, camera FOV;
- наши timings, damage, hitstop, movement speed;
- наша narrative framing «Абакан / Жукова 3».

## Что НЕ исследовано достаточно глубоко

- точные оригинальные frame timings каждого оружия;
- точная damage/HP formula;
- точная score formula и grade thresholds;
- точные hearing/FOV distances;
- полный алгоритм pathfinding;
- полный payload semantics каждого `.phyre`;
- оригинальный source-level implementation GameMaker scripts;
- все 122 rooms покомнатно как design analysis;
- различия Original vs GL на уровне каждого gameplay rule.

Если следующий чат хочет утверждать что-то из этого точно — нужно заново проверить исходный материал, а не достраивать из памяти.
