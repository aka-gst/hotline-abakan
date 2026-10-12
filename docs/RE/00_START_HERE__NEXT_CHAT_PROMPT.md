# Prompt для следующего чата

Продолжай разработку HOTLINE ABAKAN как 3D Hotline-Miami × Sifu vertical slice.

Сначала прочитай весь handoff-пакет, особенно:
- `01_MASTER_DOCS/MASTER-REVERSE-ENGINEERING-HANDOFF.md`
- `01_MASTER_DOCS/FACTS-VS-INFERENCES.md`
- `04_PROJECT_LATEST/HOTLINE_ABAKAN_VERTICAL_SLICE_12_MAC/SLICE-12-NOTES.md`
- `04_PROJECT_LATEST/HOTLINE_ABAKAN_VERTICAL_SLICE_12_MAC/REFERENCE-HOTLINE-MIAMI-FULL.md`

Текущая кодовая база — **Slice 12** в `04_PROJECT_LATEST/HOTLINE_ABAKAN_VERTICAL_SLICE_12_MAC/`. Не возвращайся к старому v43–v78 runtime и не восстанавливай монолитный app.js. Сохраняй отдельный clean runtime `Game/src/core.js + Game/src/game.js`.

Reverse engineering Hotline Miami использовать только как behavioural / architectural reference: переносить принципы, state machines, relative timings, room composition и системные взаимодействия своей реализацией. Не переносить оригинальный код, WAD payload, sprites, музыку, звуки или готовые room coordinates 1:1.

Главные уже подтверждённые принципы оригинала:
- много маленьких специализированных controllers/scripts вместо одного универсального AI;
- отдельные sight/hearing/search/chase paths;
- двери — combat objects;
- оружие — world object с pickup/throw lifecycle;
- downed и execution — отдельные состояния;
- scoring оценивает стиль/разнообразие;
- tutorial/room обучает расстановкой объектов;
- mission objective не обязан быть kill-all.

Текущие механики HOTLINE ABAKAN уже реализуют:
- FOV/LOS/hearing/investigate/search/chase;
- sentry/patrol/brute/opportunist/flanker;
- combat doors, quiet door, door bash;
- block/parry/dodge/quiet walk;
- knockdown/finisher/stealth takedown;
- shared pipe world lifecycle + E throw;
- cassette objective + extraction return;
- style score/grade;
- solid props, cutaway walls, checkpoints, soft restart;
- authored apartment layout, normalized scale/material pipeline.

Следующий приоритет: **качество 3D gameplay, комнат и боя**, а не количество фич. Проверяй реальный runtime на Mac/браузере, не выдавай debug maps или offscreen validation renders за gameplay screenshots. Перед отдачей каждой сборки прогоняй актуальные tests и route/art sanity gates.
