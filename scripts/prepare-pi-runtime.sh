#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
version=22.22.3
case "${TAURI_ENV_TARGET_TRIPLE:-$(uname -m)}" in
  arm64|aarch64-apple-darwin)
    arch=arm64
    checksum=753c1629e168cc788ccc46ab61e0b35549fce08c07f82fcd3bb0d41f7fb01e7b
    ;;
  x86_64|x86_64-apple-darwin)
    arch=x64
    checksum=939beff36e3adf3f93c5a9078d559e53245b488d5d47c5faf9fa0f1d21ede54d
    ;;
  *) echo "Unsupported target for the bundled Pi runtime" >&2; exit 1 ;;
esac

output="$PWD/src-tauri/resources/pi-runtime"
fingerprint=$(shasum -a 256 "$0" pi-runtime/package.json pi-runtime/package-lock.json pi-runtime/worker.mjs pi-runtime/accounts.mjs pi-runtime/title.mjs pi-runtime/resume.mjs pi-runtime/context-window.mjs | shasum -a 256)
stamp="$arch $version $fingerprint"
if [[ -x "$output/bin/node" && -f "$output/.ready" && $(cat "$output/.ready") == "$stamp" ]]; then
  exit 0
fi

# Keep the temporary tree on the same filesystem as the final bundle resources.
mkdir -p "$PWD/src-tauri/target"
stage=$(mktemp -d "$PWD/src-tauri/target/pi-runtime.XXXXXX")
trap 'rm -rf "$stage"' EXIT
archive="node-v$version-darwin-$arch.tar.xz"
curl -fL --retry 3 "https://nodejs.org/dist/v$version/$archive" -o "$stage/$archive"
printf '%s  %s\n' "$checksum" "$stage/$archive" | shasum -a 256 -c -
tar -xJf "$stage/$archive" -C "$stage"
distribution="$stage/node-v$version-darwin-$arch"
runtime="$stage/runtime"
mkdir -p "$runtime/bin" "$runtime/lib"
cp "$distribution/bin/node" "$runtime/bin/"
cp "$distribution/LICENSE" "$runtime/NODE-LICENSE"
cp -R "$distribution/lib/node_modules/npm" "$runtime/lib/"
for name in npm npx; do
  cat > "$runtime/bin/$name" <<WRAPPER
#!/bin/sh
bin_dir=\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)
exec "\$bin_dir/node" "\$bin_dir/../lib/npm/bin/$name-cli.js" "\$@"
WRAPPER
  chmod +x "$runtime/bin/$name"
done
cp pi-runtime/{package.json,package-lock.json,worker.mjs,accounts.mjs,title.mjs,resume.mjs,context-window.mjs} "$runtime/"
PATH="$runtime/bin:$PATH" "$runtime/bin/npm" ci --prefix "$runtime" --omit=dev --no-audit --no-fund
printf '%s\n' "$stamp" > "$runtime/.ready"
if [[ -d "$output" ]]; then mv "$output" "$stage/previous-runtime"; fi
if ! mv "$runtime" "$output"; then
  if [[ -d "$stage/previous-runtime" ]]; then mv "$stage/previous-runtime" "$output"; fi
  exit 1
fi
