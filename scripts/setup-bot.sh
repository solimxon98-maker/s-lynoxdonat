#!/usr/bin/env bash
# Telegram botni sozlash: webhook (secret bilan), buyruqlar, nom/tavsif, menyu tugmasi (Web App).
# Kerakli env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_URL, WEBAPP_URL
set -euo pipefail
: "${TELEGRAM_BOT_TOKEN:?}" "${TELEGRAM_WEBHOOK_SECRET:?}" "${WEBHOOK_URL:?}" "${WEBAPP_URL:?}"
API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

call() {
  local method="$1" body="$2"
  local res
  res=$(curl -sS -X POST "$API/$method" -H 'Content-Type: application/json' -d "$body")
  if echo "$res" | grep -q '"ok":true'; then echo "✅ $method"; else echo "❌ $method: $res"; return 1; fi
}

call setWebhook "{\"url\":\"$WEBHOOK_URL\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\",\"callback_query\"],\"max_connections\":40}"
call setMyCommands '{"commands":[{"command":"start","description":"Asosiy menyu"},{"command":"orders","description":"📦 Buyurtmalarim"},{"command":"balance","description":"💰 Balans"},{"command":"profile","description":"👤 Profil"},{"command":"invite","description":"👥 Do‘st taklif qilish"},{"command":"help","description":"💬 Yordam"}]}'
call setMyName '{"name":"S-LynoxDonat"}' || true   # Telegram ba'zan tez-tez o'zgartirishni cheklaydi
call setMyShortDescription '{"short_description":"Mobile Legends uchun tezkor va qulay donat 💎"}' || true
call setMyDescription '{"description":"S-LynoxDonat — Mobile Legends: Bang Bang uchun Diamond xarid qilish xizmati.\n\n⚡ Tezkor xizmat\n🔒 Xavfsiz to‘lov\n🤖 Avtomatik buyurtma\n🕐 24/7"}' || true
call setChatMenuButton "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"💎 Donat\",\"web_app\":{\"url\":\"$WEBAPP_URL/?p=donate\"}}}"
echo "Bot tayyor. Avatar: @BotFather → /setuserpic → logo.png"
