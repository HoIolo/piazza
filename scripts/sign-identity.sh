#!/bin/sh
# 打印本机可用的代码签名身份；没有可用证书时什么也不输出。
#
# 为什么需要它：ad-hoc 签名的 app，TCC 把授权记在 cdhash 上，
# 换个构建就变一次，于是「允许访问桌面文件夹」会反复弹。
# 用一个稳定证书签名后，TCC 记的是「这个 bundle id + 这个团队」，
# 授权一次就长期有效。
[ "$(uname)" = "Darwin" ] || exit 0
security find-identity -v -p codesigning 2>/dev/null \
  | sed -n 's/^[[:space:]]*[0-9]*) [0-9A-F]* "\(.*\)"$/\1/p' \
  | grep -E "^(Developer ID Application|Apple Development|Apple Distribution)" \
  | head -1
