#!/bin/sh
# 打印本机可用的代码签名身份；没有可用证书时什么也不输出。
#
# 为什么需要它：ad-hoc 签名的 app，TCC 把授权记在 cdhash 上，换个构建就变一次，
# 于是「允许访问桌面文件夹」会反复弹。用一个稳定证书签名后，TCC 记的是
# 「这个 bundle id + 这张证书」，授权一次就长期有效。
#
# 顺序按用途排，不按钥匙串顺序：Developer ID Application 是正式分发用的；
# 没有的话优先 Apple Distribution（公司/团队证书，CI 出的发布包也用它，
# 本地与下载版才是「同一个 app」）；最后才退到个人开发证书。
[ "$(uname)" = "Darwin" ] || exit 0
for kind in "Developer ID Application" "Apple Distribution" "Apple Development"; do
  identity=$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/^[[:space:]]*[0-9]*) [0-9A-F]* "\(.*\)"$/\1/p' \
    | grep -F "$kind" \
    | head -1)
  if [ -n "$identity" ]; then
    printf '%s\n' "$identity"
    exit 0
  fi
done
