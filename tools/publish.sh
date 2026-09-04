#!/usr/bin/env sh
# Выкладка «Одного удара» на сервер.
#
#   sh tools/publish.sh            показать план
#   sh tools/publish.sh --go       выложить и проверить
#
# Выкладка идёт прямо отсюда. Зеркала в репозитории сайта больше нет: оно
# было второй копией игры, которую приходилось держать в согласии с этой,
# и однажды кто-нибудь поправил бы одну из двух. В выкладке сайта udar не
# значится — игра живёт своим репозиторием, как и остальные игры соседей.
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

if [ "${1:-}" != "--go" ]; then
  echo "план: на сервер уедет$(printf ' %s' $PAYLOAD)"
  echo "  (черновой прогон; повторите с --go)"
  exit 0
fi

echo "== сервер =="
# shellcheck disable=SC2086
rsync -az --partial --timeout=120 -e "ssh $SSHOPTS" $PAYLOAD "$HOST:$ROOT/udar/"

# Папка на сервере и адрес в браузере — РАЗНЫЕ вещи, и это не описка.
# Кладём по-прежнему в udar/, потому что папку на сервере заводит и
# переименовывает сессия сайта: это общий ресурс, и трогать его отсюда
# нельзя. А проверяем по адресу, который открывает человек. Со старого
# адреса стоит переадресация, и она сохраняет строку запроса — проверено
# на ?тихо.
ADRES="https://aka-gst.ru/hotline-abakan"

echo "== проверка =="
for path in "" "src/main.js" "assets/manifest.json"; do
  code=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$ADRES/$path")
  echo "  /hotline-abakan/$path → $code"
done
for path in "README.md" "tests/sim.mjs" "ART-ORDER.md" "serve.py"; do
  code=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$ADRES/$path")
  echo "  /hotline-abakan/$path → $code (ожидается 404)"
done

# Старый адрес обязан жить и довозить строку запроса: им глушат звук
# прогоны, и потеря параметра означает шум в чужие колонки.
staryy=$(curl -s -m 25 -o /dev/null -w '%{redirect_url}' "https://aka-gst.ru/udar/?%D1%82%D0%B8%D1%85%D0%BE")
echo "  старый адрес с ?тихо → ${staryy:-(нет переадресации)}"
case "$staryy" in
  *hotline-abakan*D1*82*) echo "  строка запроса доезжает" ;;
  *) echo "  ВНИМАНИЕ: строка запроса теряется" ;;
esac
