```
npm install && npm start
```
Open http://localhost:3000

# LED Grid

Web simulator for a generative RGB LED matrix. Prototype for an Arduino build (CV rack module or knob-based toy).

One master signal drives a 32x32 grid. Color emerges from spreading phase and frequency across R/G/B channels using golden-angle offsets, then rotating through hue space. All controls are analog sliders, mapping 1:1 to physical knobs.

## Controls (13 knobs)

**Global (3):** Speed (exponential ±1000×), Mirror (sweeps Off→X→Y→XY), Feedback (prev frame → phase modulation)

**Pattern (5):**

| Knob | Range | What it does |
|------|-------|-------------|
| Geo | -1 to 1 | Grid (-1) ↔ Radial (0) ↔ Linear (1) |
| Freq | ±10 (cubic) | Pattern density (polar magnitude) |
| Dir | -180° to 180° | Pattern angle (polar direction) |
| Phase | -1 to 1 | Left: static offset (0°–360°). Right: auto-drift |
| Shape | 0 to 1 | Triangle → Sine → Square |

**Color (5):**

| Knob | Range | What it does |
|------|-------|-------------|
| Cutoff | -1 to 1 | Drop lows (right) or drop highs (left) with rescale |
| Hue | 0°–360° | Rotates R/G/B assignment around the color wheel |
| Φ Spread | 0–100% | Phase offset across channels (golden angle: 0°/137°/275°) |
| F Spread | ±100% | Frequency divergence across channels (golden ratio) |
| FM | ±100% | Cross-channel frequency modulation (R → G → B chain) |
