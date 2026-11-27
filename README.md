# Spectral Relief

A music visualizer study for synthesizers. The sound spectrum becomes a mountain range printed like a
press proof: frequency on the horizontal axis, energy as ridge height, time as depth. The ink is
halftone, stipple or line screen.

Live site: https://saulofilho.github.io/spectral-relief/

The site has the live proof (a built-in Web Audio synth or an audio file of your own), the moodboard,
the sound → landscape specification and previews on two hardware targets: the FM-1's 240 × 240 screen
and Ableton Live's device strip (Max for Live). Three colour modes: print (one ink, one paper),
Alpenglow Neon (blue world, one low warm light) and Normal (surface direction as RGB with fading
trails, after the [TORUS experiment](https://saulofilho.github.io/TORUS/)).

The engine also exists outside the browser:

- [`fm1/`](fm1/): a C port for the FM-1 (240 × 240 RGB565, integer FFT, strip rendering), with a host
  harness that renders PPMs. Not yet run on the device.
- [`m4l/`](m4l/): a Max for Live Audio Effect (`pfft~` + `v8ui`). Not yet opened in Live.

## Run locally

```bash
python3 -m http.server 8737
```

Then open http://localhost:8737.

## Publishing

GitHub Pages serves the `main` branch from the root folder. The `.nojekyll` file makes Pages serve the
files as they are.

## Layout

- `index.html`: the page
- `assets/spectral-relief.js`: drawing engine (canvas 2D, no libraries) and synth
- `assets/style.css`: styles
- `refs/`: moodboard references (`ref-*`) and studies rendered by the C engine (`study-*`)
- `fm1/`: C port and host harness
- `m4l/`: Max for Live device and its build script
