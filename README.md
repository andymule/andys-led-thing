```
npm install && npm start
```
Open http://localhost:3000

# LED Grid

Web simulator for a generative RGB LED matrix. Prototype for an Arduino build (CV rack module or knob-based toy).

Three independent R/G/B signal channels drive a 32x32 grid. All controls are analog sliders, mapping 1:1 to physical knobs.

## Controls

**Global (2):** Speed (exponential ±1000x), Mirror (sweeps Off→X→Y→XY)

**Per channel (7 × 3 = 21):**

| Knob | Range | What it does |
|------|-------|-------------|
| Geo | -1 to 1 | Grid (-1) ↔ Radial (0) ↔ Linear (1) |
| Freq X | ±10 (cubic) | Wave density / ring density / column density |
| Freq Y | ±10 (cubic) | Wave angle / spiral twist / row density |
| Phase | -1 to 1 | Left: static offset (0°–360°). Right: auto-drift |
| Shape | 0 to 1 | Triangle → Sine → Square |
| Cutoff | -1 to 1 | Drop lows (right) or drop highs (left) with rescale |
| Mod | -1 to 1 | Cross-channel FM. Chain: Red → Green → Blue |

23 knobs total.
