# HOTLINE ABAKAN — Reverse Engineering Handoff Pack

Это пакет для переноса проекта и результатов статического reverse engineering в другой чат без потери контекста.

## С чего начать

1. Прочитать `01_MASTER_DOCS/MASTER-REVERSE-ENGINEERING-HANDOFF.md`.
2. Затем `01_MASTER_DOCS/FACTS-VS-INFERENCES.md` — там отделены подтверждённые факты от наших выводов.
3. Открыть `04_PROJECT_LATEST/HOTLINE_ABAKAN_VERTICAL_SLICE_12_MAC/` — это полный последний исходный проект Slice 12 с ассетами, launcher и тестами.
4. Для продолжения разработки использовать `00_START_HERE/NEXT_CHAT_PROMPT.md` как стартовый prompt.
5. Если нужно повторить анализ оригинала: `03_SOURCE_MANIFESTS/` + инструменты в `06_TESTS_AND_SCRIPTS/`.

## Что внутри

- `00_START_HERE/` — инструкция и готовый prompt для следующего чата.
- `01_MASTER_DOCS/` — полный сводный документ, факты/гипотезы, Git baseline, границы материалов.
- `02_REFERENCE_NOTES/` — оригинальные наши reference-доки, написанные по ходу исследования.
- `03_SOURCE_MANIFESTS/` — SHA-256, архивные листинги, ELF/WAD metadata, 375 script names, object/room symbol lists.
- `04_PROJECT_LATEST/` — полный HOTLINE ABAKAN Vertical Slice 12.
- `05_PREVIEWS/` — наши screenshots / validation renders.
- `06_TESTS_AND_SCRIPTS/` — актуальные тесты проекта + инструменты для повторного статического анализа.
- `07_HISTORY_NOTES/` — хронология ключевых проходов разработки.

## Чего здесь НЕТ

Здесь намеренно **нет оригинальных файлов Hotline Miami**: `.exe`, `.wad`, `.ogg`, sprites/textures/SFX и т.д. Исходные архивы были предоставлены пользователем и анализировались локально, но в handoff не дублируются. Вместо них есть SHA-256, полные списки содержимого и производные метаданные/имена систем.

Если следующему чату понадобится заново исследовать бинарники/ресурсы, пользователь должен отдельно прикрепить свои исходные архивы. Хэши для проверки версии лежат в `03_SOURCE_MANIFESTS/SOURCE_ARCHIVE_SHA256.txt`.
