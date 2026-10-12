# HOTLINE ABAKAN — полный reverse-engineering handoff

Дата handoff: **2026-10-12**  
Текущий игровой baseline: **HOTLINE ABAKAN Vertical Slice 12**  
Git: `aka-gst/hotline-abakan`, известный текущий HEAD на момент handoff — `1080aa6544fa2e725a451f3368879238caf4c77f`.

---

## 1. Зачем существует этот пакет

За много итераций HOTLINE ABAKAN прошёл путь от перегруженной v43–v78 ветки к отдельному маленькому runtime, который строится как **3D Hotline Miami × Sifu**: authored rooms, быстрый бой, общие физические правила предметов, AI perception, двери, knockdown/execution, shared weapon, objective, style score и extraction.

Ключевой перелом произошёл, когда вместо дальнейшего ремонта старого `app.js` был сделан RESET / Vertical Slice: новая сцена, новый combat core, одна квартира и последовательные боевые задачи. После этого пользователь предоставил полные сборки оригинального Hotline Miami, и мы провели **статический reverse engineering как behavioural / architectural reference**.

Цель reverse engineering была не «скопировать игру», а понять:
- почему простые комнаты дают много решений;
- как разложены AI states;
- как двери/оружие/лежачие враги связаны в один graph;
- как миссия и score заставляют импровизировать;
- какие systems нужно реализовать независимо в 3D.

---

## 2. Исходные материалы, которые исследовались

### 2.1 Windows full game archive
Пользовательский файл: `hotline_miami.rar`  
SHA-256:
`f41ff89c01bc920c35a3111a9ff07b4b7e65ba421643551701d377c291a8fcc9`

В архиве 47 entries. Ключевые:
- `HotlineMiami_Original.exe` — 20,668,187 bytes;
- `HotlineGL.exe` — 8,059,392 bytes;
- `HotlineMiami.exe` launcher — 544,256 bytes;
- `HotlineMiami_GL.wad` — 359,231,291 bytes;
- DLL/Steam runtime;
- soundtrack `.ogg`.

Полный listing: `03_SOURCE_MANIFESTS/hotline_miami_archive_listing.*`.

### 2.2 GOG Linux archive
Пользовательский файл: `Hotline Miami [GOG] [Linux].rar`  
SHA-256:
`18c4bb69b27f4a6c041f0a3f33acfa80541ea9191689b09d0a701302ee1e0da2`

Внутри основной GOG installer + goodies. Installer был разобран как контейнер, **не запускался**. Из payload получены metadata о:
- Linux game ELF `Hotline`;
- Linux `HotlineMiami_GL.wad`;
- launcher/support files;
- soundtrack.

Промежуточный payload ZIP SHA-256:
`b557f70825f6cf50e85748f0de83128e086f3f646fa247e73f1660967c6dd1c6`.

Полный listing: `03_SOURCE_MANIFESTS/gog_linux_archive_listing.*` и `hm_payload_zip_listing.*`.

### 2.3 Что НЕ включено в этот handoff

Оригинальные `.exe`, ELF, `.wad`, `.ogg`, sprites, textures, fonts, SFX и другие коммерческие файлы Hotline Miami не дублируются. Для воспроизводимости оставлены hashes, listings и производные текстовые metadata.

---

## 3. Методика reverse engineering

Работа была статической:

1. Листинг RAR/installer container без запуска игры.
2. Извлечение GOG payload как архива, не запуск installer/game binary.
3. `file`/ELF header inspection.
4. `nm -C` / symbol-table analysis Linux executable.
5. Извлечение уникальных GameMaker-style `scr*`, object-event и room-create names.
6. Анализ начала WAD и восстановление точной index structure.
7. Парсинг WAD index без извлечения payload assets.
8. Сопоставление system names с нашими gameplay problems.
9. Независимая реализация идей в HOTLINE ABAKAN.

Инструменты для повторения metadata analysis лежат в `06_TESTS_AND_SCRIPTS/`:
- `parse_wad_index.py`;
- `extract_gml_symbol_names.py`;
- `hash_sources.sh`.

---

## 4. Linux executable: что подтверждено

`Hotline` из GOG payload:
- ELF 32-bit LSB;
- Intel i386;
- dynamically linked;
- **not stripped**;
- BuildID `2ca59bc303cc6e3ac271d9e14befe106742ca49f`.

Это было самым полезным источником архитектурных имён.

### 4.1 Scripts
Текущий extractor даёт **375 уникальных `gml::scr*` names**.

Полный список:
`03_SOURCE_MANIFESTS/linux_gameplay_script_names.txt`.

Особенно важные группы:

#### Player/combat
- `scrCtrlAttack`
- `scrGetAttack`
- `scrPlayerAnimationEnd`
- `scrCtrlAimFar`
- `scrCtrlLockOn`
- `scrCtrlPickUpThrow`
- `scrCurrentWeapon`
- `scrCurrentWeaponExt`
- `scrGetWeapon`

#### Downed / execution
- `scrCtrlBashDownedEnemy`
- `scrCtrlBashDownedEnemyInit`
- gore/bash/shot presentation paths

#### Perception / pursuit
- `scrSeePlayer`
- `scrHearPlayer`
- `scrChasePlayer`
- `scrChaseSearch`
- `scrChaseWall`
- `scrStopSearch`
- `scrCheckBack`

#### Enemy variants
- `scrEMeleeInit`, `scrEMeleeStep`
- `scrEPatrolInit`, `scrEPatrolStep`
- `scrESwatInit`, `scrESwatStep`
- `scrEFatInit`, `scrEFatStep`
- dog/random/mobile/stationary variants

#### Weapon acquisition
- `scrFindWeapon`
- `scrGetWeapon`
- pickup/throw controller paths

#### Mission/restart
- `scrCheckpoint`
- `scrCheckMissionComplete`
- room/restart related systems

#### Score/style
- `scrCountMobilityScore`
- `scrCountFlexibilityScore`
- `scrCheckUsedGuns`
- `scrCheckUsedMelee`
- `scrCheckUsedThrows`
- `scrCheckUsedKills`
- `scrCheckGrades`
- score init/reset/draw paths

### 4.2 Objects/events
Raw parser на demangled symbol table сейчас фиксирует:
- **803 уникальных `obj*` object names**;
- **2,131 unique object-event functions**.

Это полезнее старой неточной фразы «804 object-event groups». Полные raw lists:
- `linux_object_names.txt`
- `linux_object_event_functions.txt`

Среди них присутствуют doors, furniture, enemies, bosses, world props, interface/story objects и collision/create/step/draw/alarm/mouse/key events.

### 4.3 Rooms
Явных compiled room-create functions текущий regex находит **80** (`Rooms_*_rm*__Create`). Полный список — `linux_room_names.txt` / `linux_room_create_symbols.txt`.

Ранее более широкий metadata inventory давал **122 named rooms**. Эти counts относятся к разным слоям: не каждая room обязана иметь отдельную explicit create function в том же виде. В дальнейшем не использовать 80 и 122 как взаимозаменяемые цифры.

---

## 5. GL WAD: точный индекс и ресурсы

### 5.1 Формат Linux WAD
Точное начало исследованного Linux WAD:

```text
uint32 index_size
uint32 entry_count
repeat entry_count:
    uint32 name_length
    byte[name_length] resource_name
    uint32 resource_size
    uint32 payload_relative_offset
payload begins at index_size
```

Проверено парсером: parsed end совпадает с header `index_size`.

Linux GOG build:
- index size: **31,180 bytes**;
- entries: **633**;
- `GL/AssetScripts/`: **410**;
- `.phyre`: **490**;
- `.wav`: **74**;
- `.fnt`: **55**;
- `.bin`: **12**;
- `.ini`: **1**;
- `.png`: **1**.

Полный индекс в TXT/CSV/JSON:
- `linux_wad_index.txt`
- `linux_wad_index.csv`
- `linux_wad_index.json`
- `linux_wad_index_summary.md`

В раннем анализе Windows WAD была зафиксирована близкая, но отличающаяся инвентаризация: **634 entries / 411 AssetScripts / 491 .phyre**. Вероятнее всего это version difference между Windows и GOG Linux GL data. Не смешивать counts без подписи build.

### 5.2 Архитектурный вывод из WAD
Ресурсы организованы отдельными категориями AssetScripts/rooms/objects/sprites/sounds/fonts/metadata, что поддерживает наблюдение: gameplay level состоит из множества маленьких authored systems/data records, а не одного монолитного scene blob.

---

## 6. Главные design/system выводы из оригинала

Ниже — не исходный GML code, а вывод из symbol/object/room structure.

### 6.1 Маленькие специализированные controllers
Самый важный вывод: экранно простая игра опирается на большое количество узких scripts/controllers. Не нужен «супер-AI». Нужны читаемые состояния с чёткими переходами.

Для HOTLINE ABAKAN это означает: не возвращаться к старому giant `app.js`; отдельно держать input, combat state, perception, weapon lifecycle, execution и presentation.

### 6.2 Perception — не GPS
Наличие отдельных `SeePlayer`, `HearPlayer`, `ChasePlayer`, `ChaseSearch`, `StopSearch` paths подтверждает полезную модель:

`не знает → услышал → проверяет → увидел → преследует → потерял → ищет → успокоился`.

Это создаёт микро-нарратив комнаты без сложного story scripting.

### 6.3 Enemy archetype = behavior
Stationary/mobile/patrol/melee/SWAT/dog/etc. разделены. Поэтому разница противников должна идти из поведения и состояния, а не только из HP и цвета.

### 6.4 Doors = combat objects
Door object events/collisions являются полноценной частью object graph. Для нашей игры дверь должна:
- блокировать движение;
- блокировать sight;
- издавать noise;
- иметь controlled open и aggressive bash;
- взаимодействовать с enemy state и world weapon.

### 6.5 Weapon = world lifecycle
Pickup/throw/find/get weapon paths отделены. Практический вывод:

`weapon on floor → somebody picks it → moveset changes → dropped/thrown/disarmed → world object again`.

Оружие не должно быть просто флагом `player.hasPipe=true`.

### 6.6 Downed != dead
Отдельный `BashDownedEnemy` path показывает полезное промежуточное состояние: враг может лежать, но ещё не быть устранён. Это создаёт выбор «добить / переключиться / использовать окружение».

### 6.7 Score rewards way of play
Mobility/flexibility/used-guns/melee/throws/kills/grades — явный сигнал, что игра оценивает не только kill count, но и **манеру прохождения**.

### 6.8 Room teaches by layout
Tutorial и другие authored rooms состоят из enemies/doors/walls/light/weapons/furniture. Механика объясняется размещением объектов, а не только текстом HUD.

### 6.9 Mission != kill-all
Checkpoint/mission-complete/story/score paths означают, что room clear и mission objective могут быть разными сущностями.

---

## 7. Что из этого уже независимо реализовано в HOTLINE ABAKAN

### Slice 05 — systemic room
- FOV + line of sight;
- hearing/noise;
- investigate/search/chase/last-known position;
- combat doors;
- heavy knockdown;
- contextual finisher;
- shared pipe;
- authored solid props + route test.

### Slice 06 — objective / throw / style
- physical cassette objective;
- progression gate зависит от objective;
- `E` weapon throw;
- pipe states `world/held/thrown`;
- thrown pipe collision + knockdown;
- sentry/patrol/brute/opportunist archetypes;
- style score + variety + grade.

### Slice 07 — systems interact
- final readable 2×1;
- opportunist + flanker;
- single attack-token coordination;
- local alert propagation;
- directional door bash;
- thrown pipe can open door and create noise;
- extraction requires physical return through level;
- aftermath persists;
- final checkpoint resets pair as one encounter.

### Slice 08 — stealth/readability
- footsteps produce noise;
- `SHIFT` quiet walk;
- `F` quiet door vs movement door-bash;
- rear contextual stealth takedown;
- awareness indicators;
- attack lane telegraph;
- softened dodge;
- stronger room visual differentiation.

### Slice 09 — body impact/environment consequences
- directional body/head/torso recoil;
- stronger heavy/pipe pose reaction;
- breakable bottles/frames/floor lamps;
- broken lamp switches off local light;
- debris persists until reset;
- destruction contributes to style.

### Slice 10 — rooms / asset pool
- returned full project prop/urban pool;
- kitchen/bedroom/storage/living room authored as distinct scenes;
- real OBJ/GLTF props;
- solid setpieces participate in LOS;
- enemy spawn clearance test.

### Slice 11 — scale / pose / material pipeline
- character human scale ~1.79–1.88 m;
- consistent prop scale catalogue;
- `Idle_Neutral` evaluated before first rendered gameplay frame;
- real attack animations begin during windup;
- removed primitive archetype overlays;
- MTL material palette preserved;
- art-sanity test catches props through walls.

### Slice 12 — visual cohesion
- procedural micro-textures on broad surfaces;
- MTL `Kd/Ks/Ns` informs material response;
- door frames / skirting / ceiling fixtures;
- kitchen backsplash, bedroom headboard, living-room TV wall;
- contact shadows;
- closer/lower camera;
- keeps previous combat/system baseline intact.

---

## 8. Current Slice 12 gameplay contract

### Controls
- `WASD` — movement;
- `J` — quick attack;
- `K` — heavy / knockdown-capable attack;
- hold `L` — block;
- late `L` before impact — parry;
- `SPACE` — short dodge;
- `SHIFT` — quiet walk;
- `F` — context: quiet door / finisher / stealth takedown / cassette / pick/drop pipe;
- `E` — throw pipe;
- `R` — restart current scene/checkpoint.

### Mission loop
`briefing → safe entry → staged rooms → perception/door/block/parry lessons → cassette objective → final pair + shared pipe → return through aftermath → extraction → grade`.

### Current code architecture
Latest project is fully bundled under `04_PROJECT_LATEST/HOTLINE_ABAKAN_VERTICAL_SLICE_12_MAC/`.

Important files:
- `Game/src/core.js` — deterministic/shared combat helpers/state logic;
- `Game/src/game.js` — 3D scene, authored layout, runtime AI/presentation;
- `Game/index.html`, `style.css`, `serve.py`, build-id;
- `tests/slice-core-12.cjs`;
- `tests/slice-contract-12.cjs`;
- `tests/route-check-12.py`;
- `tests/art-sanity-12.py`.

The current runtime contains explicit systems/functions for:
- solid colliders + LOS blockers;
- room lighting/cutaway walls;
- prop scale specs + MTL palette loading;
- breakables;
- pipe world mesh/state;
- combat doors;
- player state/attacks/dodge/block/parry;
- enemy attack token + archetype update;
- noise/perception;
- gates/objective/extraction;
- soft checkpoint restart;
- style score + final grade.

---

## 9. Major mistakes already learned — do not repeat

### 9.1 Do not patch giant legacy runtime forever
v43–v78 accumulated compatibility and tests that sometimes protected bad behavior. The RESET into a clean vertical slice was necessary.

### 9.2 Test behavior, not historical strings
Several old regression tests literally required version labels/old timings/old objects. New tests must gate playability/system properties.

### 9.3 Never reuse one GLTF scene root for multiple actors
Three.js Object3D has one parent. Reusing one `gltf.scene` caused visual enemy meshes to migrate between actors while AI remained active. Every actor needs an independent skeleton-safe scene instance.

### 9.4 Visual props must match collision truth
If furniture looks solid, player must not ghost through it. Conversely, visual-only clutter should not create hidden blockers.

### 9.5 Route tests need player radius
A level can look open but be physically blocked after radius expansion. Always test start→objective→final→return.

### 9.6 Spawn-clearance must use real prop footprints
Old spawns ended inside stove/sofa when visual scale changed. Every enemy spawn must be checked against current authored colliders.

### 9.7 Do not show debug maps as gameplay screenshots
Previous handoff mistake: top-down debug/validation maps were shown as if they represented final 3D quality. Only label real runtime screenshots as gameplay. Offscreen renders must be explicitly called validation renders.

### 9.8 Scale must be catalogued once
Same asset cannot be 1.1 m in one room and 1.45 m in another. Slice 11 introduced a scale bible for characters/doors/fridge/chairs/sofa/table etc.

### 9.9 CDN dependency remains technical debt
Slice 12 still references Three.js/loaders via jsDelivr. Project gameplay/assets are local, but build is not fully offline. The Git history includes an older offline-build effort; next chat should consider resolving this cleanly.

---

## 10. Known current weaknesses / next priorities

User feedback by Slice 12 remained mainly visual/feel oriented, not «add more buttons»:

1. 3D rooms still need stronger art direction and professional composition.
2. Props need continued consistent scale/material treatment.
3. Real runtime gameplay screenshots/capture should become part of iteration, not debug approximations.
4. Character animation blending/contact still needs polish so humans never look mannequin-like.
5. Impact should be evaluated in motion: anticipation/contact/recovery/body reaction/camera/sound as one package.
6. Room density should create **choices**, not just clutter.
7. More enemy/weapon content only after current rooms and fist combat feel strong.
8. Offline/local Three.js vendor should be fixed.
9. Git `main` should stay the source of truth instead of parallel archive branches.

Recommended next sequence:

**A. Runtime capture pipeline → B. room art pass → C. fist combat animation/contact pass → D. door/AI encounter polish → E. pipe moveset polish → F. one additional authored mission only after first level feels finished.**

---

## 11. Research facts vs our implementation

Read `FACTS-VS-INFERENCES.md` before citing reverse-engineering claims.

Short rule:
- symbol/WAD names/counts = source-derived facts;
- «this design works because…» = our inference;
- exact HOTLINE ABAKAN controls/timings = our own design;
- do not attribute our parry/dodge/pipe numbers to original Hotline Miami.

---

## 12. Files in this handoff

### `02_REFERENCE_NOTES/`
- early Hotline static reference;
- full static reference map.

### `03_SOURCE_MANIFESTS/`
- source archive SHA-256;
- RAR/ZIP listings;
- ELF header/type;
- 375 script names;
- 803 object names / 2131 raw object-event functions;
- room-create symbols/names;
- exact 633-entry Linux WAD index and stats;
- conservative WAD path-string inventory (secondary, noisy; exact index is authoritative).

### `04_PROJECT_LATEST/`
Full Slice 12 project including our 3D assets, code, launcher, licenses, tests and previews.

### `06_TESTS_AND_SCRIPTS/`
Current tests plus metadata-analysis utilities.

### `07_HISTORY_NOTES/`
Chronology of the reset/slice development path.

---

## 13. Final operating principle for the next chat

The project does **not** need to become «Hotline Miami copied into 3D». The useful thing we learned from reverse engineering is that apparent simplicity comes from **many small predictable rules that compose**.

For HOTLINE ABAKAN, every new feature should answer at least one of these:
- does it create a new room decision?
- does it improve readability/impact?
- does it interact with existing world rules?
- does it make retry/learning faster?
- does it give the player a reason to improvise?

If not, it is probably lower priority than polishing the existing fist/door/AI/room loop.
