const DEFAULT_GRID_SIZE = 32;
const TICK_RATE = 100;
const TWO_PI = Math.PI * 2;
const INV_PI = 2 / Math.PI;
const DRIFT_SCALE = 0.002;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function geoLabel(v) {
  const blend = 1 - Math.abs(v);
  if (blend < 0.01) return 'Linear';
  if (blend > 0.99) return 'Radial';
  return `${(blend * 100) | 0}%`;
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

const SIGNAL_PARAMS = [
  { key: 'geometry', label: 'Geo',    min: -1, max: 1,   step: 0.01, group: 0, fmt: geoLabel },
  { key: 'freqX',   label: 'Freq X', min: 0,  max: 10,  step: 0.1,  group: 0, fmt: v => v.toFixed(1) },
  { key: 'freqY',   label: 'Freq Y', min: 0,  max: 10,  step: 0.1,  group: 0, fmt: v => v.toFixed(1) },
  { key: 'drift',   label: 'Phase',  min: -1, max: 1,   step: 0.01, group: 0, fmt: phaseLabel },
  { key: 'shape',   label: 'Shape',  min: 0,  max: 1,   step: 0.01, group: 1, fmt: shapeLabel },
  { key: 'cutoff',  label: 'Cutoff', min: -1, max: 1,   step: 0.01, group: 1, fmt: cutoffLabel },
];

class Signal {
  constructor(name) {
    this.name = name;
    this.geometry = -1;
    this.freqX = 1;
    this.freqY = 0;
    this.drift = 0;
    this.shape = 0.5;
    this.cutoff = 0;
    this.phase = 0;
  }

  advancePhase() {
    if (this.drift < 0) {
      this.phase = -this.drift;
    } else if (this.drift > 0) {
      this.phase += this.drift * DRIFT_SCALE;
    }
  }

  valueAt(col, row, tick, gridSize) {
    const nx = col / gridSize - 0.5;
    const ny = row / gridSize - 0.5;

    const linear = (col / gridSize) * this.freqX + (row / gridSize) * this.freqY;

    const dist = Math.sqrt(nx * nx + ny * ny) * 2;
    const ang = Math.atan2(ny, nx) / TWO_PI;
    const radial = dist * this.freqX + ang * this.freqY;

    const geo = 1 - Math.abs(this.geometry);
    const spatial = geo <= 0 ? linear
                  : geo >= 1 ? radial
                  : lerp(linear, radial, geo);

    const angle = (spatial + tick / TICK_RATE) * TWO_PI + this.phase * TWO_PI;
    const s = Math.sin(angle);

    let wave;
    if (this.shape <= 0.5) {
      const tri = INV_PI * Math.asin(s);
      wave = lerp(tri, s, this.shape * 2);
    } else {
      const sq = s >= 0 ? 1 : -1;
      wave = lerp(s, sq, (this.shape - 0.5) * 2);
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
  constructor(x, y, cellSize, col, row) {
    this.x = x;
    this.y = y;
    this.cellSize = cellSize;
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
  constructor(canvas, gridSize = DEFAULT_GRID_SIZE) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridSize = gridSize;
    this.tick = 0;
    this.speed = 0.27 * 0.27 * 0.27 * 50;
    this.mirror = 0;
    this.signals = [new Signal('red'), new Signal('green'), new Signal('blue')];
    this.leds = this.#buildLEDs();
  }

  #buildLEDs() {
    const cellSize = this.canvas.width / this.gridSize;
    const leds = new Array(this.gridSize * this.gridSize);
    for (let col = 0; col < this.gridSize; col++) {
      for (let row = 0; row < this.gridSize; row++) {
        leds[col * this.gridSize + row] = new LED(
          col * cellSize, row * cellSize, cellSize, col, row
        );
      }
    }
    return leds;
  }

  #update() {
    const [rSig, gSig, bSig] = this.signals;
    const t = this.tick;
    const gs = this.gridSize;
    const half = gs / 2;
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
      if (mx > 0 && col >= half) col = lerp(col, gs - 1 - col, mx);
      if (my > 0 && row >= half) row = lerp(row, gs - 1 - row, my);

      led.setColor(
        rSig.valueAt(col, row, t, gs),
        gSig.valueAt(col, row, t, gs),
        bSig.valueAt(col, row, t, gs)
      );
    }
  }

  #draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const led of this.leds) {
      ctx.fillStyle = `rgb(${led.r},${led.g},${led.b})`;
      ctx.fillRect(led.x, led.y, led.cellSize, led.cellSize);
    }
  }

  start() {
    const frame = () => {
      this.tick += this.speed;
      for (const sig of this.signals) {
        sig.advancePhase();
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

function expSpeed(v) {
  return v * v * v * 50;
}

speedSlider.addEventListener('input', (e) => {
  const raw = parseFloat(e.target.value);
  grid.speed = expSpeed(raw);
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
