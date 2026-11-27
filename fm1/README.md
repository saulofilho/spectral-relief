# Spectral Relief for the FM-1

A C port of the site's drawing engine for the FM-1's 240 × 240 RGB565 screen. It has no libm,
no allocation and no framebuffer. The per-frame path is all integer math.

- `sr.h`, `sr.c`: the engine. It covers a 1024-point FFT, 96 log columns from 30 Hz to 14 kHz,
  48 layers of history, three print screens (halftone, stipple, lines), three colour modes (print,
  Alpenglow Neon, Normal with trails) and the non-photo-blue diagram marks.
- `host/render.c`: a host harness. It plays a small saw synth through the real FFT path, steps the
  engine at 30 frames a second and writes the last frame as a PPM.
- `host/test.sh`: builds with AddressSanitizer and UBSan, then renders every screen and colour at
  240 × 240 and at 1100 × 690.

## Build and render on the host

```bash
cc -O2 -I fm1 fm1/sr.c fm1/host/render.c -o render
```

```bash
./render -mode am -colour alpenglow -o fm1.ppm
```

Options: `-w -h -mode am|fm|line -colour print|alpenglow|normal -dark -planes N -cell PX -height F -jag F
-shift PX -trails F -pattern arp|pad|acid -seconds S -marks -bench -o FILE`. To render above 240 × 240, build
with `-DSR_MAXW=1600 -DSR_MAXH=1000 -DSR_MAXP=72`. The engine studies on the site's
moodboard were made this way.

## Inside a firmware

The FM-1 firmwares draw the screen in strips from a small canvas, with no full framebuffer
(see `gfx.c`). The engine follows the same model:

```c
static sr_t sr;
sr_init(&sr, 240, 240, 44100);                 /* once */

sr_feed(&sr, block, n, 2);                     /* audio callback: stride 2 takes one stereo channel */

sr_analyze(&sr);                               /* per frame, in the main loop */
sr_tick(&sr, us_since_last_frame);
sr_frame(&sr);
for (uint32_t y = 0; y < 240; y += 40) {
    sr_strip565(&sr, y, 40, cv_px, 1);         /* byteswap = 1: the panel takes big-endian RGB565 */
    sr_marks565(&sr, y, 40, cv_px, 1);         /* optional */
    lcd_blit(0, y, 240, 40, cv_px);
}
```

`sr.p` holds the controls: `mode`, `colour`, `planes`, `cell_q4`, `height_q8`, `jag_q8`,
`shift_q8`, `trails_q8`, `dark`. Setting `sr.frozen = 1` holds the picture.

Normal's trails fade the previous frame instead of erasing it. The renderer reads that frame back
from the buffer you pass in, so trails only work when every strip goes into one full framebuffer
(240 × 240 × 2 bytes = 113 KB). With the 240 × 40 strip buffer of the example, leave
`trails_q8 = 0`.

## Numbers

| | |
|---|---|
| RAM | 26 KB state, 8 KB FFT work, 15 KB strip scratch, 6 KB tables |
| Host time | under 1 ms per 240 × 240 frame (Apple silicon, `-O2`) |
| Device time | not measured yet |

## Not done yet

- Nothing has run on an FM-1 yet. The next step is a page in one of the firmwares, with the FFT cost per
  block and the frame rate left over after audio measured on the device.
- The 64-bit multiplies in `sr_frame` and the FFT are cheap on a Cortex-M4 but slow on an M0. If the
  FM-1's core is the smaller one, they should become 32-bit.
- Ridge noise differs from the site on purpose. The rock undulation repeats every 16 px instead of
  7, because a real FFT gives taller, denser spectra than the site's simulation, and at 7 px they read
  as hair.
