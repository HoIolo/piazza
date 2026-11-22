#!/bin/sh
# `tauri dev --runner` 的中间人：先把编出来的 app 签上名，再执行它。
#
# 不签名的话每次 cargo 重新链接都换一个 cdhash，TCC 认为这是另一个 app，
# 「访问桌面文件夹」会一次次重新问。签名一次约 1 秒，比每次点弹窗便宜。
set -e
app="$1"
shift
if [ "$(uname)" = "Darwin" ]; then
  identity=$(sh "$(dirname "$0")/sign-identity.sh")
  if [ -n "$identity" ]; then
    codesign --force --sign "$identity" "$app" >/dev/null 2>&1 || true
  fi
fi
exec "$app" "$@"
