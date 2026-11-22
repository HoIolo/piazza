#!/bin/sh
# macOS 打包：默认 universal（Intel + Apple Silicon），并尽量用本机证书签名。
#
# 签名不是为了过 Gatekeeper（那需要 Developer ID + 公证），
# 而是为了让 TCC 认得「这是同一个 app」，更新或重装后不再重新索要文件夹权限。
set -e
cd "$(dirname "$0")/.."
identity=$(sh scripts/sign-identity.sh)
if [ -n "$identity" ]; then
  export APPLE_SIGNING_IDENTITY="$identity"
  echo "使用签名身份：$identity"
else
  echo "未找到可用证书，打包结果将是 ad-hoc 签名（TCC 授权会随构建失效）"
fi
exec npm run tauri build -- --target universal-apple-darwin "$@"
