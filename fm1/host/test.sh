#!/bin/sh
# Builds the port with the sanitizers and renders every screen and colour at both sizes.
set -e
cd "$(dirname "$0")"
out=${TMPDIR:-/tmp}/spectral-relief-test
mkdir -p "$out"
cc -O1 -g -std=c99 -Wall -Wextra -fsanitize=address,undefined -fno-sanitize-recover=undefined \
   -I.. -DSR_MAXW=1600 -DSR_MAXH=1000 -DSR_MAXP=72 ../sr.c render.c -o "$out/render"
for size in "240 240 22" "1100 690 40"; do
  set -- $size
  for mode in am fm line; do
    for colour in print alpenglow normal; do
      "$out/render" -w "$1" -h "$2" -planes "$3" -mode "$mode" -colour "$colour" -marks -seconds 3 -o "$out/$1-$mode-$colour.ppm"
    done
  done
done
"$out/render" -dark -o "$out/dark.ppm"
"$out/render" -colour normal -trails 0.8 -o "$out/trails.ppm"
"$out/render" -w 1100 -h 690 -planes 40 -cell 4.5 -colour normal -trails 0.8 -o "$out/trails-big.ppm"
"$out/render" -pattern pad -o "$out/pad.ppm"
"$out/render" -pattern acid -o "$out/acid.ppm"
echo "all renders ok: $out"
