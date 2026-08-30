# ОДИН УДАР — задание на звук

Задание самодостаточное. Промты по-английски — так генераторы точнее понимают
жанровые термины; пояснения и правила по-русски. У музыки два вида промта:
**строка стиля** для Suno и **развёрнутое описание** для ElevenLabs Music или
Stable Audio. Брать один из двух.

## Что за игра

Быстрый экшен сверху вниз. **С одного удара умирают все, включая игрока**;
проигрыш стоит полсекунды и начинается заново. Оружие не выдают — его
подбирают с пола, бросают в лицо и меняют на то, что осталось от предыдущего
гостя. Кровь остаётся на полу до конца попытки.

Отсылка к жанру — в темпе, палитре и крови. Игрок умирает по двадцать раз за
минуту, и **музыка не должна прерываться на смерть**: она сшивает эти двадцать
попыток в один заход, иначе игра ощущается двадцатью поражениями подряд.

## Главное: место под музыку уже готово

Это редкий случай — здесь **не нужно писать ни строчки кода**. `src/audio.js`
при старте сам запрашивает `music/manifest.json`, и если файл есть, играет
треки вместо синтеза. Разложить готовые файлы — вся работа.

Из этого следует несколько жёстких требований к трекам, потому что синтез,
который они заменяют, уже отлажен под игру:

- **Темп 108 ударов в минуту.** Движок считает шаг как `60 / 108 / 4` и умеет
  дёргать игру по доле (`onBeat`). Другой темп рассинхронит вспышки с музыкой.
- **Структура на 32 такта.** Столько живёт круг во встроенном секвенсоре.
- **Ровная громкость по всей длине.** Движок сам поднимает напряжение через
  `setIntensity` (0 — тишина коридора, 1 — погоня) и приглушает музыку в меню.
  Трек с собственным нарастанием будет драться с этой системой.
- **Никаких пауз в начале и конце файла.** Петля идёт встык.

Формат манифеста:

```json
{
  "tracks": [
    { "id": 0, "title": "Ледяной", "file": "floor-1.mp3" },
    { "id": 1, "title": "Второй этаж", "file": "floor-2.mp3" }
  ]
}
```

`id` — тот же номер, что стоит у этажа в `src/levels.js`.

## Правила выдачи

- **Музыка:** MP3, 128–160 kbps, 60–120 секунд, бесшовная петля по такту,
  108 BPM, без вокала.
- **Звуки:** WAV 44.1 кГц, короткие, без хвоста тишины, пик −3 дБ.
- **Удар — это первые 30 миллисекунд.** Всё, что начинается с нарастания,
  в игре про мгновенную смерть читается как лаг. В промтах это требование
  повторено, не убирать его.
- **Вес:** каталог `music/` выкладывается вместе с игрой (`deploy.sh`, список
  `PAYLOAD`). Три минуты в 128 kbps — около 3 МБ.
- **Права:** файлы уезжают на публичный сайт.

---

# Музыка

## 1. `music/floor-1.mp3` — первый этаж

```
dark acid techno, 108 BPM, A minor, driving 303 bassline, dry drum machine,
no vocals, loopable, relentless, no build-up
```

Развёрнутое описание:

```
A relentless dark acid techno loop for a fast top-down action game. Exactly
108 BPM, A minor. A driving resonant 303-style bassline, dry drum machine kit
with a hard kick, and a thin metallic hat pattern. No melody that resolves,
no vocals, and — this matters — no build-up, no breakdown and no drop: the
track holds one constant intensity from first bar to last, because the game
raises and lowers tension itself. 32 bars. Seamless loop with no silence at
either end.
```

## 2. `music/floor-2.mp3` — второй этаж

Тот же мир, темнее и жирнее. Задача — чтобы игрок услышал смену этажа, не
глядя на экран.

```
industrial techno, 108 BPM, A minor, distorted kick, metallic percussion,
low drone, no vocals, loopable, oppressive, no build-up
```

Развёрнутое описание:

```
An oppressive industrial techno loop for the second floor of a fast top-down
action game. Exactly 108 BPM, A minor, same key as the first floor so the two
can follow each other. A heavily distorted kick, clanking metallic percussion
and a low drone underneath, with the bassline pushed back. Darker and heavier
than the first floor while staying at one constant intensity — no build-up,
no drop. No vocals. 32 bars. Seamless loop, no silence at the ends.
```

## 3. `music/floor-3.mp3` — верхний этаж

```
hypnotic minimal techno, 108 BPM, A minor, sparse percussion, cold sub bass,
long empty bars, no vocals, loopable, tense
```

Развёрнутое описание:

```
A hypnotic minimal techno loop for the final floor of a fast action game.
Exactly 108 BPM, A minor. Very sparse: a cold sub bass, a dry rimshot pattern,
and several bars with almost nothing in them at all. The empty bars matter
more than the full ones — a busy loop becomes unbearable after a minute. One
constant intensity, no build-up. No vocals. 32 bars. Seamless loop.
```

## 4. `music/menu.mp3`

```
dark ambient techno intro, 108 BPM, A minor, filtered pad, distant kick,
no vocals, loopable, waiting
```

---

# Звуки

Сейчас синтезируются в `src/audio.js` (480 строк) через `sfx()`. Готовых имён
там немного — `backstab`, `ui`, — остальное ниже задаёт словарь целиком.

## Оружие в руках

`sfx/melee-swing.wav`

```
Blunt weapon swing through air, 0.1 seconds. A short tight whoosh with no
tail. Quiet — it only tells the player the swing happened. Mono.
```

`sfx/melee-hit.wav` — попадание, и одновременно смерть: тут все умирают с
одного удара.

```
Blunt weapon striking a human head, 0.25 seconds. A hard wet crack with a
deep low thud underneath and a brief bone crunch. Brutal, close-miked, dry,
no reverb. The impact must be at the very first millisecond of the file, no
fade-in. Mono.
```

`sfx/blade-hit.wav`

```
Blade cutting into a body, 0.22 seconds. A wet slice with a short low thud
underneath. Close, dry, no reverb. Impact at the first millisecond. Mono.
```

`sfx/gunshot.wav`

```
Single pistol shot in a concrete room, 0.4 seconds. A hard dry crack with a
short slap-back and a brief shell tinkle after it. Loud and flat, no
Hollywood boom. Impact at the first millisecond. Mono.
```

`sfx/dry-click.wav` — патроны кончились. В игре, где оружие подбирают с пола,
этот звук — команда «беги искать новое».

```
Empty gun dry-fire click, 0.08 seconds. A single hard mechanical click, no
tail. Unmistakable and slightly alarming. Mono.
```

## Оружие на полу

`sfx/pickup.wav`

```
Picking up a weapon from the floor, 0.2 seconds. A short metallic scrape and
grip. Dry, close. Mono.
```

`sfx/throw.wav`

```
Weapon thrown through air, 0.3 seconds. A tumbling whoosh with a faint
metallic wobble. Dry, close. Mono.
```

`sfx/weapon-drop.wav`

```
Metal weapon hitting a concrete floor, 0.5 seconds. A hard clatter with two
or three bounces and a short ring. Dry, close, minimal reverb. Mono.
```

## Тела

`sfx/body-fall.wav`

```
Human body collapsing onto concrete, 0.5 seconds. A heavy dull thud with
cloth and a faint wet component. Dry, close, no reverb. Mono.
```

`sfx/death-player.wav` — смерть игрока. Звучит двадцать раз в минуту, поэтому
не должен быть драматичным: он часть темпа, а не событие.

```
Player death cue in a fast arcade game, 0.3 seconds. A short low impact with
a brief downward pitch collapse. Blunt and unceremonious — it will play dozens
of times per minute and must never feel like a punishment. Mono.
```

`sfx/backstab.wav` — удар в спину, единственный приятный звук в игре.

```
Silent takedown from behind, 0.35 seconds. A wet blade entry with a choked
exhale and a soft body settle. Quiet, close, dry — satisfying rather than
loud. Mono.
```

## Мир и интерфейс

`sfx/door-kick.wav`

```
Door kicked open violently, 0.4 seconds. A hard wooden crack with a metal
latch snap and a swing-through. Dry, close. Mono.
```

`sfx/step.wav` — 3–4 варианта.

```
Single fast footstep on concrete, 0.09 seconds. Dry, flat, quiet. Mono.
```

`sfx/restart.wav` — рестарт за полсекунды, звук должен быть короче него.

```
Instant restart cue, 0.15 seconds. A short rising electronic blip, clean and
mechanical. Must feel like a reset, not a fanfare. Mono.
```

`sfx/ui.wav`

```
UI tick, 0.05 seconds. A single dry electronic click. Very quiet. Mono.
```

---

# Что делать с готовыми файлами

1. Положить треки в `music/`, скопировать манифест и вписать их:

   ```sh
   cp music/manifest.example.json music/manifest.json
   ```

2. Проверить, что `track` у этажа в `src/levels.js` указывает на нужный `id`.
   У встроенного этажа он `0`.
3. Больше ничего не трогать: `src/audio.js` подхватит манифест сам и
   переключится с синтеза на файлы.
4. Звуки положить в `assets/sfx/` — им приёмник ещё нужно дописать, в отличие
   от музыки.
5. Нормализовать треки между собой: игра их не выравнивает.
