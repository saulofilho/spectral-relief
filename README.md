# Relevo Espectral

A music visualizer study for synthesizers. The sound spectrum becomes a mountain range printed like a
press proof: frequency on the horizontal axis, energy as ridge height, time as depth. The ink is
halftone, stipple or line screen.

Live site: https://saulofilho.github.io/relevo-espectral/

The site has the live proof (a built-in Web Audio synth or an audio file of your own), the moodboard,
the sound → landscape specification and previews on two hardware targets: the FM-1's 240 × 240 screen
and Ableton Live's device strip (Max for Live).

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
- `assets/relevo.js`: drawing engine (canvas 2D, no libraries) and synth
- `assets/style.css`: styles
- `refs/`: moodboard references
