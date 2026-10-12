# HOTLINE ABAKAN — development timeline relevant to the handoff

Это не полный changelog всех 70+ старых итераций. Здесь только поворотные точки, которые объясняют текущую архитектуру.

## Legacy recovery before reset

### Recovery pass
Были найдены три фундаментальные ошибки старой ветки:
- один `gltf.scene` переиспользовался несколькими NPC, поэтому mesh переезжал к последнему parent, а AI первого врага оставался невидимо активным;
- декоративная лестница имела collider шире критического прохода;
- оружие/hand anchor имели неправильную ориентацию.

### FAST SIFU / FLOW
Попытка убрать «желе» показала ещё один архитектурный дефект: input во время attack state обрабатывался после раннего return, поэтому `J/K/Shift` терялись. Input buffer/cancel pipeline был исправлен, `location.reload()` на смерти заменён soft restart. Но стало ясно, что полировка legacy runtime слишком дорогая.

## RESET: clean vertical slice

### Slice 01
Новый маленький runtime без старого `app.js`, Rapier/Yuka/EasyStar/campaign/quest baggage. Одна арена, 3 врага, кулаки/pipe, dodge/parry, soft restart.

### Slice 02
Первый authored tutorial-floor: начало с кулаков, последовательные 1×1, shared pipe как отдельный world object, Space dodge.

### Slice 03
Появились briefing/establishing shot/safe zone, замедленная anticipation без замедления contact, 4 staged rooms, checkpoints, городской внешний фон.

### Slice 04
Настоящие colliders стен/мебели/дверей, camera cutaway. `L hold=block`, late L=parry. Dodge стал коротким физическим уходом. Уровень расширен до 6 encounters.

### Slice 05 — reverse-engineering principles enter runtime
Sight/hearing/search, combat doors, knockdown→finisher, shared pipe, authored dense layout, critical-route test.

### Slice 06
Cassette mission objective, `E` pipe throw, sentry/patrol/brute/opportunist, style/grade.

### Slice 07
Readable 2×1 finale, flanker + attack token, local alerts, directional door bash, pipe→door interaction, return-to-extraction ending.

### Slice 08
Footstep noise, Shift quiet walk, quiet F-door vs loud bash, stealth takedown, awareness indicators, attack lane.

### Slice 09
Body pose recoil, breakable environment, lights can be destroyed, persistent debris/aftermath.

### Slice 10
Large asset/room pass: full prop pool restored, distinct kitchen/bedroom/storage/living room, enemy spawn clearance testing.

### Slice 11
Scale bible, humanized character sizes, Idle pose before first frame, windup attack animation, MTL palette, art sanity.

### Slice 12 — current baseline
Visual cohesion: microtextures, MTL specular/roughness treatment, architectural trim, ceiling lights, room identity, closer camera. Combat/system rules intentionally kept stable while picture is improved.
