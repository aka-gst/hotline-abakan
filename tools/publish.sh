#!/usr/bin/env sh
# Выкладка «Одного удара»: в зеркало сайта и на сервер.
#
#   sh tools/publish.sh            только зеркало
#   sh tools/publish.sh --go       зеркало и сервер
#
# Список выкладываемого — БЕЛЫЙ. Причина ровно та же, по которой он белый в
# deploy.sh сайта: чёрный список защищает только от того, что в него успели
# вписать, и однажды уже пропустил в веб-корень служебные файлы. Здесь в
# корень игры уехали README, все заказы на графику, промты для Кодекса,
# восемь прогонов и утилита для вырезания фона — семнадцать файлов, которые
# отдавались наружу кодом 200.
#
# Второе, о чём легко забыть: выкладка на сервер идёт без --delete, чтобы не
# сносить чужие игры из соседних репозиториев. Значит, убрать файл из списка
# мало — он останется на сервере навсегда. Удалять оттуда приходится руками.

set -eu

HERE="$(cd "$(dirname "$0")/.." && pwd)"
MIRROR="${UDAR_MIRROR:-$HOME/dev/aka-gst.ru/.claude/worktrees/hotline-miami-game-87360a/udar}"
HOST="${DEPLOY_HOST:-bonita}"
ROOT="${DEPLOY_ROOT:-/opt/zakriva/caddy/site}"
SSHOPTS="-o ConnectTimeout=30 -o BatchMode=yes -o ServerAliveInterval=10"

cd "$HERE"

# Всё, без чего игра не откроется, и ничего сверх того.
PAYLOAD="
index.html
style.css
favicon.svg
app.webmanifest
icon.png
icon-192.png
src
assets
"

missing=""
for item in $PAYLOAD; do
  [ -e "$item" ] || missing="$missing $item"
done
if [ -n "$missing" ]; then
  echo "нет в дереве:$missing" >&2
  exit 1
fi

echo "== зеркало =="
mkdir -p "$MIRROR"
# shellcheck disable=SC2086
rsync -a --delete $PAYLOAD "$MIRROR/"

# rsync с --delete чистит только внутри перенесённых каталогов: лишнее,
# лежащее рядом в корне, он не трогает. Поэтому корень зеркала подметаем
# отдельно — всё, чего нет в белом списке, отсюда уходит.
( cd "$MIRROR" && for entry in * .[!.]*; do
    [ -e "$entry" ] || continue
    keep=""
    for item in $PAYLOAD; do [ "$entry" = "$item" ] && keep=1; done
    [ -n "$keep" ] || { echo "  убираю лишнее: $entry"; rm -rf -- "$entry"; }
  done )

if [ "${1:-}" != "--go" ]; then
  echo "  (зеркало обновлено; на сервер — с --go)"
  exit 0
fi

echo "== сервер =="
# shellcheck disable=SC2086
rsync -az --partial --timeout=120 -e "ssh $SSHOPTS" $PAYLOAD "$HOST:$ROOT/udar/"

echo "== проверка =="
for path in "" "src/main.js" "assets/manifest.json"; do
  code=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "https://aka-gst.ru/udar/$path")
  echo "  /udar/$path → $code"
done
for path in "README.md" "tests/sim.mjs" "ART-ORDER.md" "serve.py"; do
  code=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "https://aka-gst.ru/udar/$path")
  echo "  /udar/$path → $code (ожидается 404)"
done
