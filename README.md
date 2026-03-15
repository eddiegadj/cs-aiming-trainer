# CS Aiming Trainer

A browser-based 3D aim trainer for practicing flick shots and click timing (e.g. for Counter-Strike). Built with Three.js.

## How to run

Use a **local server** (required for ES modules and Three.js):

```bash
npx serve .
# or: python3 -m http.server 8080
```

Then open the URL (e.g. http://localhost:3000). Don’t open `index.html` as a file (file://) or the game won’t load.

## How to play

1. Click **Start round** to begin a timed round.
2. Red 3D spheres appear in front of you; move the mouse to look, then click to shoot.
3. Clicks on empty space count as **misses** and lower accuracy.
4. **Score** rewards fast reaction (faster hit = more points).
5. Use **Target size** (Small / Medium / Large), **Duration**, and **Sensitivity** to tune difficulty.
6. **Reset** clears all stats and stops the round.

## Features

- **3D scene** (Three.js): look around with the mouse, crosshair fixed at center
- Red spherical targets that spawn in view
- Hit/miss flash feedback
- Stats: score, hits, misses, accuracy %, average reaction time (ms)
- Configurable target size, round duration, sensitivity, invert Y

No build step—vanilla JS with Three.js from CDN.
