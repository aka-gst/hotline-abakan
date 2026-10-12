# HOTLINE ABAKAN — HOTLINE FLOW PASS

Основа: v78 + FAST SIFU traversal baseline. Новый номер версии не создавался.

## Что изменено

- Исправлен системный input bug: раньше `updatePlayer()` возвращался из `attack / guard / dodge` до чтения `J / K / L / Shift`, поэтому одноразовые нажатия внутри действия терялись.
- Добавлен `Game/src/combat-input.js`: он один раз потребляет press-intent на 120 Hz fixed-step и сохраняет контекст `air-J` / `W+K lunge`.
- Existing hit-confirm / whiff buffer теперь реально достижим во время атак: ранний `J`, `K` или `Shift` либо отменяет действие в разрешённое окно, либо ждёт в single-action buffer.
- Full page restart (`location.reload()`) удалён из обычного death/reset path.
- `R`, а после смерти также `J / K / Space / Shift`, делают soft restart: HP, позиции, оружие, encounter activation, director, objective, camera и Rapier player body восстанавливаются в уже загруженной сцене.
- Player снова получает стартовую трубу; enemy weapons и исходный plank pickup восстанавливаются после рестарта.
- Death overlay появляется примерно через 180 ms вместо 700 ms.

## Что проверить первым

1. Нажимать следующий `J` ещё до окончания текущего удара — серия не должна требовать паузы.
2. После подтверждённого `J` заранее нажать `K` — heavy branch должен выйти без ощущения потерянного ввода.
3. После hit-confirm заранее нажать `Shift` — dodge должен начаться в cancel window.
4. Умереть и сразу нажать `J`/`Shift` — уровень должен вернуться без перезагрузки страницы/моделей.
5. После рестарта труба игрока и оружие врагов должны быть на месте.

Build: `HOTLINE_ABAKAN_HOTLINE_FLOW_PASS_2026-10-10`
