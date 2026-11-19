#!/bin/sh
# Copy every env/src/*.ts and env/src/*.json into sdk/conformance byte for byte. This script is the
# ONLY writer of sdk/conformance: the copies are never edited by hand, so the suite an entrant runs
# locally is the suite the sealed env runs (tests/unit/comp-github-core-clone-01-sdk.test.ts is the
# drift guard). The .json copy is calibration.json: manifest.ts imports it (`./calibration.json`) for
# T_REF_MS, so the kit's runner cannot resolve that import without it.
#
#   sh sdk/sync.sh           copy env/src -> sdk/conformance (and remove copies whose source is gone)
#   sh sdk/sync.sh --check   write nothing; exit 1 and name every file that is missing, differs or is extra
#
# Run it after changing anything under env/src. sdk/run.ts imports only ./conformance/, never env/src.

set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
src="$here/../env/src"
dst="$here/conformance"
check=0
if [ "${1:-}" = "--check" ]; then
  check=1
fi

if [ ! -d "$src" ]; then
  echo "sync.sh: no env/src beside sdk/ ($src)" >&2
  exit 1
fi
mkdir -p "$dst"
drift=0

for file in "$src"/*.ts "$src"/*.json; do
  [ -e "$file" ] || continue
  name=$(basename "$file")
  target="$dst/$name"
  if [ ! -f "$target" ]; then
    if [ "$check" = 1 ]; then
      echo "missing: conformance/$name (env/src/$name exists)"
      drift=1
    else
      cp "$file" "$target"
      echo "synced: $name"
    fi
  elif ! cmp -s "$file" "$target"; then
    if [ "$check" = 1 ]; then
      echo "differs: conformance/$name (env/src/$name is newer)"
      drift=1
    else
      cp "$file" "$target"
      echo "synced: $name"
    fi
  fi
done

for target in "$dst"/*.ts "$dst"/*.json; do
  [ -e "$target" ] || continue
  name=$(basename "$target")
  if [ ! -f "$src/$name" ]; then
    if [ "$check" = 1 ]; then
      echo "extra: conformance/$name (env/src/$name does not exist)"
      drift=1
    else
      rm -f "$target"
      echo "removed: $name"
    fi
  fi
done

if [ "$check" = 1 ] && [ "$drift" = 0 ]; then
  echo "sdk/conformance is byte-identical to env/src"
fi
exit "$drift"
