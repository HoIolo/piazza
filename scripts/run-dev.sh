#!/bin/sh
# cargo 的 target runner：先把编出来的 app 签上名，再执行它。
#
# 注意不能用 `tauri dev --runner`——那个位置期望的是「另一个 cargo」，
# 传过去的参数是 `run --no-default-features ...`。cargo 自己的 runner
# 才是按 `<runner> <二进制> <参数>` 调的，正好对得上。
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
