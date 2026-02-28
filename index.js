const DEFAULT_GRID_SIZE = 32;
const TICK_RATE = 100;
const TWO_PI = Math.PI * 2;
const INV_PI = 2 / Math.PI;
const DRIFT_SCALE = 0.002;
const FREQ_SCALE = 10;
const MOD_DEPTH = 3;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function cubic(v, scale) {
  return v * v * v * scale;
}

function geoLabel(v) {
  if (v < -0.99) return 'Grid';
  if (v > 0.99) return 'Linear';
  if (Math.abs(v) < 0.01) return 'Radial';
  return v < 0 ? 'Grid\u2013Rad' : 'Rad\u2013Lin';
}

function freqLabel(raw) {
  const freq = cubic(raw, FREQ_SCALE);
  if (Math.abs(freq) < 0.005) return '0';
  return freq.toFixed(1);
}

function shapeLabel(v) {
  if (v < 0.01) return 'Tri';
  if (Math.abs(v - 0.5) < 0.01) return 'Sine';
  if (v > 0.99) return 'Sq';
  return v < 0.5 ? 'Tri\u2013Sine' : 'Sine\u2013Sq';
}

function phaseLabel(v) {
  if (Math.abs(v) < 0.005) return '0';
  if (v < 0) return `${(-v * 360) | 0}\u00B0`;
  return `Drift +${v.toFixed(2)}`;
}

function cutoffLabel(v) {
  if (Math.abs(v) < 0.005) return 'Off';
  return v > 0 ? `Lo ${(v * 100) | 0}%` : `Hi ${(-v * 100) | 0}%`;
}

function modLabel(v) {
  if (Math.abs(v) < 0.005) return 'Off';
  return `${(v * 100) | 0}%`;
}

const FREQ_X_DEFAULT = Math.cbrt(1 / FREQ_SCALE);

const SIGNAL_PARAMS = [
  { key: 'geometry', label: 'Geo',    min: -1, max: 1,    step: 0.01,  group: 0, fmt: geoLabel },
  { key: 'freqX',   label: 'Freq X', min: -1, max: 1,    step: 0.001, group: 0, fmt: freqLabel },
  { key: 'freqY',   label: 'Freq Y', min: -1, max: 1,    step: 0.001, group: 0, fmt: freqLabel },
  { key: 'drift',   label: 'Phase',  min: -1, max: 1,    step: 0.01,  group: 0, fmt: phaseLabel },
  { key: 'shape',   label: 'Shape',  min: 0,  max: 1,    step: 0.01,  group: 1, fmt: shapeLabel },
  { key: 'cutoff',  label: 'Cutoff', min: -1, max: 1,    step: 0.01,  group: 1, fmt: cutoffLabel },
  { key: 'mod',     label: 'Mod',    min: -1, max: 1,    step: 0.01,  group: 2, fmt: modLabel },
];

class Signal {
  constructor(name) {
    this.name = name;
    this.geometry = 1;
    this.freqX = FREQ_X_DEFAULT;
    this.freqY = 0;
    this.drift = 0;
    this.shape = 0.5;
    this.cutoff = 0;
    this.mod = 0;
    this.phase = 0;
    this._fx = cubic(this.freqX, FREQ_SCALE);
    this._fy = cubic(this.freqY, FREQ_SCALE);
  }

  advancePhase() {
    if (this.drift < 0) {
      this.phase = -this.drift;
    } else if (this.drift > 0) {
      this.phase = (this.phase + this.drift * DRIFT_SCALE) % 1;
    }
  }

  prepareFrame() {
    this._fx = cubic(this.freqX, FREQ_SCALE);
    this._fy = cubic(this.freqY, FREQ_SCALE);
  }

  #waveAt(angle) {
    const s = Math.sin(angle);
    if (this.shape <= 0.5) {
      const tri = INV_PI * Math.asin(s);
      return lerp(tri, s, this.shape * 2);
    }
    const sq = s >= 0 ? 1 : -1;
    return lerp(s, sq, (this.shape - 0.5) * 2);
  }

  valueAt(col, row, tick, gridX, gridY, modSource = 0) {
    const fx = this._fx;
    const fy = this._fy;
    const temporal = tick / TICK_RATE;
    const phaseT = this.phase * TWO_PI + modSource * this.mod * MOD_DEPTH * TWO_PI;
    const g = this.geometry;

    let wave;

    if (g >= 1) {
      const spatial = (col / gridX) * fx + (row / gridY) * fy;
      wave = this.#waveAt((spatial + temporal) * TWO_PI + phaseT);
    } else if (g <= -1) {
      wave = this.#waveAt(((col / gridX) * fx + temporal) * TWO_PI + phaseT)
           * this.#waveAt(((row / gridY) * fy + temporal) * TWO_PI + phaseT);
    } else {
      const nx = col / gridX - 0.5;
      const ny = row / gridY - 0.5;
      const rSpatial = Math.sqrt(nx * nx + ny * ny) * 2 * fx + Math.atan2(ny, nx) / TWO_PI * fy;
      const rWave = this.#waveAt((rSpatial + temporal) * TWO_PI + phaseT);

      if (g > 0) {
        const lSpatial = (col / gridX) * fx + (row / gridY) * fy;
        const lWave = this.#waveAt((lSpatial + temporal) * TWO_PI + phaseT);
        wave = lerp(rWave, lWave, g);
      } else {
        const pWave = this.#waveAt(((col / gridX) * fx + temporal) * TWO_PI + phaseT)
                    * this.#waveAt(((row / gridY) * fy + temporal) * TWO_PI + phaseT);
        wave = lerp(rWave, pWave, -g);
      }
    }

    const v = (wave + 1) * 0.5;

    const c = this.cutoff;
    if (c > 0) {
      if (c >= 1 || v <= c) return 0;
      return (v - c) / (1 - c);
    } else if (c < 0) {
      const ceil = 1 + c;
      if (ceil <= 0 || v >= ceil) return 0;
      return v / ceil;
    }
    return v;
  }
}

class LED {
  constructor(x, y, cellWidth, cellHeight, col, row) {
    this.x = x;
    this.y = y;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.col = col;
    this.row = row;
    this.r = 0;
    this.g = 0;
    this.b = 0;
  }

  setColor(r, g, b) {
    this.r = (r * 255 + 0.5) | 0;
    this.g = (g * 255 + 0.5) | 0;
    this.b = (b * 255 + 0.5) | 0;
  }
}

class LEDGrid {
  constructor(canvas, gridX = DEFAULT_GRID_SIZE, gridY = DEFAULT_GRID_SIZE) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridX = gridX;
    this.gridY = gridY;
    this.tick = 0;
    this.speed = 0.1 * 0.1 * 0.1 * 1000;
    this.mirror = 0;
    this.signals = [new Signal('red'), new Signal('green'), new Signal('blue')];
    this.leds = this.#buildLEDs();
  }

  #buildLEDs() {
    const cellWidth = this.canvas.width / this.gridX;
    const cellHeight = this.canvas.height / this.gridY;
    const leds = new Array(this.gridX * this.gridY);
    for (let col = 0; col < this.gridX; col++) {
      for (let row = 0; row < this.gridY; row++) {
        leds[col * this.gridY + row] = new LED(
          col * cellWidth, row * cellHeight, cellWidth, cellHeight, col, row
        );
      }
    }
    return leds;
  }

  #update() {
    const [rSig, gSig, bSig] = this.signals;
    const t = this.tick;
    const gx = this.gridX;
    const gy = this.gridY;
    const halfX = gx / 2;
    const halfY = gy / 2;
    const m = this.mirror;
    let mx, my;
    if (m <= 1 / 3) {
      mx = m * 3; my = 0;
    } else if (m <= 2 / 3) {
      mx = 1 - (m - 1 / 3) * 3; my = (m - 1 / 3) * 3;
    } else {
      mx = (m - 2 / 3) * 3; my = 1;
    }

    for (const led of this.leds) {
      let col = led.col;
      let row = led.row;
      if (mx > 0 && col >= halfX) col = lerp(col, gx - 1 - col, mx);
      if (my > 0 && row >= halfY) row = lerp(row, gy - 1 - row, my);

      const r = rSig.valueAt(col, row, t, gx, gy);
      const g = gSig.valueAt(col, row, t, gx, gy, r);
      const b = bSig.valueAt(col, row, t, gx, gy, g);
      led.setColor(r, g, b);
    }
  }

  #draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const led of this.leds) {
      ctx.fillStyle = `rgb(${led.r},${led.g},${led.b})`;
      ctx.fillRect(led.x, led.y, led.cellWidth, led.cellHeight);
    }
  }

  resize(gridX, gridY) {
    this.gridX = gridX;
    this.gridY = gridY;
    this.leds = this.#buildLEDs();
  }

  start() {
    const frame = () => {
      this.tick += this.speed;
      for (const sig of this.signals) {
        sig.advancePhase();
        sig.prepareFrame();
      }
      this.#update();
      this.#draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

// --- Initialization ---

const grid = new LEDGrid(document.getElementById('led-canvas'));
grid.start();

// --- Global Controls ---

const globalEl = document.getElementById('global-controls');
const speedSlider = globalEl.querySelector('[data-param="speed"]');
const speedValue = globalEl.querySelector('[data-for="speed"]');

speedSlider.addEventListener('input', (e) => {
  const raw = parseFloat(e.target.value);
  grid.speed = cubic(raw, 1000);
  speedValue.textContent = Math.abs(grid.speed) < 0.01 ? 'Paused'
    : `${grid.speed > 0 ? '+' : ''}${grid.speed.toFixed(1)}x`;
});

const mirrorSlider = globalEl.querySelector('[data-param="mirror"]');
const mirrorValue = globalEl.querySelector('[data-for="mirror"]');

mirrorSlider.addEventListener('input', (e) => {
  grid.mirror = parseFloat(e.target.value);
  mirrorValue.textContent = `${(grid.mirror * 100) | 0}%`;
});

// --- Signal Controls ---

const controlsContainer = document.getElementById('controls');

for (const signal of grid.signals) {
  const card = document.createElement('div');
  card.className = 'signal-card';
  card.dataset.signal = signal.name;

  let html = `<h2>${signal.name}</h2>`;
  let prevGroup = SIGNAL_PARAMS[0].group;

  for (const param of SIGNAL_PARAMS) {
    if (param.group !== prevGroup) {
      html += '<div class="control-sep"></div>';
      prevGroup = param.group;
    }
    const id = `${signal.name}-${param.key}`;
    html += `
      <div class="control-group">
        <div class="control-label">
          <span>${param.label}</span>
          <span class="control-value" data-for="${id}">${param.fmt(signal[param.key])}</span>
        </div>
        <input type="range" data-param="${id}" data-key="${param.key}"
               min="${param.min}" max="${param.max}" value="${signal[param.key]}" step="${param.step}">
      </div>`;
  }

  card.innerHTML = html;
  controlsContainer.appendChild(card);

  for (const param of SIGNAL_PARAMS) {
    const id = `${signal.name}-${param.key}`;
    card.querySelector(`[data-param="${id}"]`).addEventListener('input', (e) => {
      signal[param.key] = parseFloat(e.target.value);
      card.querySelector(`[data-for="${id}"]`).textContent = param.fmt(signal[param.key]);
    });
  }
}

// --- Grid Size Controls ---

const gridXInput = document.getElementById('grid-x');
const gridYInput = document.getElementById('grid-y');

if (gridXInput) {
  gridXInput.addEventListener('change', () => {
    const v = Math.max(2, Math.min(128, parseInt(gridXInput.value, 10) || 32));
    gridXInput.value = v;
    grid.resize(v, grid.gridY);
  });
}

if (gridYInput) {
  gridYInput.addEventListener('change', () => {
    const v = Math.max(2, Math.min(128, parseInt(gridYInput.value, 10) || 32));
    gridYInput.value = v;
    grid.resize(grid.gridX, v);
  });
}
