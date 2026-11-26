# Spectral Relief for Ableton Live (Max for Live)

An Audio Effect that passes the sound through untouched and draws its spectrum as a printed
mountain range in the device strip. Put it right after an instrument (Wavetable, Operator, Drift),
or on any track.

## Files

- `Spectral Relief.amxd`: the device
- `spectral-relief-v8.js`: drawing and analysis, plain ES5 (works in `v8ui` and `jsui`)
- `sr.fft~.maxpat`: the `pfft~` subpatch (2048-point FFT, Hann window, amplitude per bin into a `buffer~`)
- `Spectral Relief.maxpat`: the same patch as plain JSON, for reading and diffs
- `build.mjs`: builds all three patch files from code (`node m4l/build.mjs`)

## Install

1. Keep the three files (`.amxd`, `.js`, `sr.fft~.maxpat`) in one folder, for example
   `User Library/Presets/Audio Effects/Max Audio Effect/Spectral Relief/`.
2. Drag `Spectral Relief.amxd` onto a track.
3. To share it as a single file, open the device in Max (the edit button) and click **Freeze**.
   This copies the script and the subpatch into the device.

## Controls

| Control | Does |
|---|---|
| Ink | dots (AM halftone at 45°), stipple (FM) or lines (15° line screen) |
| Colour | print (light ink on Live's graphite) or Alpenglow Neon |
| Depth | how many layers of history are drawn |
| Height | how tall the range is |
| Rough | ridge noise |
| Screen | screen cell size in pixels |
| Freeze | holds the picture |

## Requirements and status

- `v8ui` needs Max 9 (bundled with recent Live 12 releases). On Max 8, open the device, swap the
  `v8ui` for a `jsui` with the same file name and save.
- This has not been opened in Live yet: no Live install was available when the device was built.
  The script was run in Node against a mock of Max's `mgraphics`, `Buffer` and `Task`, in every
  screen and colour, and the patch files are checked as valid JSON.
- The device relies on Max for Live replacing `---` in the `buffer~` name and in two message boxes
  with a number unique to each instance. That lets two copies of the device draw their own tracks.
