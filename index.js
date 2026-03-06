const DEFAULT_GRID_SIZE = 32;
const TICK_RATE = 100;
const TWO_PI = Math.PI * 2;
const INV_PI = 2 / Math.PI;
const ANIM_SCALE = 0.002;
const FREQ_SCALE = 10;
const MOD_DEPTH = 3;
const FEEDBACK_DEPTH = Math.PI;
const INV_SQRT3 = 1 / Math.sqrt(3);

const KNOB_SIZE = 40;
const KNOB_DIM = '#2a2a35';
const KNOB_GRAY = '#888';

function lerp(a, b, t) { return a + (b - a) * t; }
function cubic(v, scale) { return v * v * v * scale; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// --- Knob Rendering ---

function drawKnob(ctx, normalized, litColor, dimColor) {
  const size = KNOB_SIZE;
  const cx = size / 2, cy = size / 2;
  const radius = size / 2 - 4;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.lineWidth = 2;
  ctx.strokeStyle = dimColor;
  ctx.stroke();

  const angle = -Math.PI / 2 + normalized * TWO_PI;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 3.5, 0, TWO_PI);
  ctx.fillStyle = litColor;
  ctx.fill();
}

function createKnobCanvas() {
  const canvas = document.createElement('canvas');
  canvas.className = 'knob';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = KNOB_SIZE * dpr;
  canvas.height = KNOB_SIZE * dpr;
  canvas.style.width = KNOB_SIZE + 'px';
  canvas.style.height = KNOB_SIZE + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

function attachKnobDrag(canvas, getVal, onDrag, min, max) {
  function startDrag(startY, startVal) {
    const range = max - min;
    function onMove(y) {
      const dy = startY - y;
      onDrag(Math.max(min, Math.min(max, startVal + dy * range / 150)));
    }
    function onEnd() {
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', tm);
      document.removeEventListener('touchend', onEnd);
    }
    const mm = (e) => onMove(e.clientY);
    const tm = (e) => { e.preventDefault(); onMove(e.touches[0].clientY); };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', tm, { passive: false });
    document.addEventListener('touchend', onEnd);
  }
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientY, getVal());
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrag(e.touches[0].clientY, getVal());
  }, { passive: false });
}

// --- Label Formatters ---

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

function dirLabel(v) {
  return `${Math.round(v * 180)}\u00B0`;
}

function phaseLabel(v) {
  const deg = Math.round(v * 360) % 360;
  if (deg === 0) return '0\u00B0';
  return `${deg}\u00B0`;
}

function shapeLabel(v) {
  if (v < 0.01) return 'Tri';
  if (Math.abs(v - 0.5) < 0.01) return 'Sine';
  if (v > 0.99) return 'Sq';
  return v < 0.5 ? 'Tri\u2013Sine' : 'Sine\u2013Sq';
}

function cutoffLabel(v) {
  if (Math.abs(v) < 0.005) return 'Off';
  return v > 0 ? `Lo ${(v * 100) | 0}%` : `Hi ${(-v * 100) | 0}%`;
}

function hueLabel(v) {
  const deg = Math.round(v * 360);
  if (deg === 0 || deg === 360) return 'Off';
  return `${deg}\u00B0`;
}

function modLabel(v) {
  if (Math.abs(v) < 0.005) return 'Off';
  return `${(v * 100) | 0}%`;
}

function gainLabel(v) {
  if (v < 0.005) return 'Off';
  if (v > 0.995) return '100%';
  return `${Math.round(v * 100)}%`;
}

function speedLabel(raw) {
  const speed = cubic(raw, 1000);
  if (Math.abs(speed) < 0.01) return 'Paused';
  return `${speed > 0 ? '+' : ''}${speed.toFixed(1)}\u00D7`;
}

function mirrorLabel(v) {
  return `${(v * 100) | 0}%`;
}

function feedbackLabel(v) {
  if (Math.abs(v) < 0.005) return 'Off';
  return `${Math.round(v * 100)}%`;
}

// --- Parameter Definitions ---

const FREQ_DEFAULT = Math.cbrt(1 / FREQ_SCALE);

const GLOBAL_PARAMS = [
  { key: 'speed',       label: 'Speed',    min: -1, max: 1, step: 0.01, val: 0.1, fmt: speedLabel,    mode: 'bounce' },
  { key: 'mirror',      label: 'Mirror',   min: 0,  max: 1, step: 0.01, val: 0,   fmt: mirrorLabel,   mode: 'wrap' },
  { key: 'feedback',    label: 'Feedback', min: -1, max: 1, step: 0.01, val: 0,   fmt: feedbackLabel, mode: 'bounce' },
  { key: 'hueRotation', label: 'Hue',      min: 0,  max: 1, step: 0.01, val: 0,   fmt: hueLabel,      mode: 'wrap' },
  { key: 'modDepth',    label: 'FM',       min: -1, max: 1, step: 0.01, val: 0,   fmt: modLabel,      mode: 'bounce' },
];

const globalAnim = { speed: false, mirror: false, feedback: false, hueRotation: false, modDepth: false };
const globalAcc = { speed: 0, mirror: 0, feedback: 0, hueRotation: 0, modDepth: 0 };
const globalRate = { speed: 0, mirror: 0, feedback: 0, hueRotation: 0, modDepth: 0 };

const CHANNEL_PARAMS = [
  { key: 'geo',    label: 'Geo',    min: -1, max: 1, step: 0.01,  fmt: geoLabel },
  { key: 'freq',   label: 'Freq',   min: -1, max: 1, step: 0.001, fmt: freqLabel },
  { key: 'dir',    label: 'Dir',    min: -1, max: 1, step: 0.01,  fmt: dirLabel },
  { key: 'drift',  label: 'Phase',  min: 0,  max: 1, step: 0.01,  fmt: phaseLabel },
  { key: 'shape',  label: 'Shape',  min: 0,  max: 1, step: 0.01,  fmt: shapeLabel },
  { key: 'cutoff', label: 'Cutoff', min: -1, max: 1, step: 0.01,  fmt: cutoffLabel },
  { key: 'gain',   label: 'Gain',   min: 0,  max: 1, step: 0.01,  fmt: gainLabel },
];

const ANIM_OFF = { geo: false, freq: false, dir: false, drift: false, shape: false, cutoff: false, gain: false };
const ACC_ZERO = { geo: 0, freq: 0, dir: 0, drift: 0, shape: 0, cutoff: 0, gain: 0 };

const CHANNEL_DEFAULTS = [
  { geo: 1, freq: FREQ_DEFAULT, dir: 0,     drift: 0.15, shape: 0.5, cutoff: 0, gain: 1,
    anim: { ...ANIM_OFF, drift: true }, acc: { ...ACC_ZERO } },
  { geo: 1, freq: FREQ_DEFAULT, dir: 0.06,  drift: 0.20, shape: 0.5, cutoff: 0, gain: 1,
    anim: { ...ANIM_OFF, drift: true }, acc: { ...ACC_ZERO } },
  { geo: 1, freq: FREQ_DEFAULT, dir: -0.06, drift: 0.10, shape: 0.5, cutoff: 0, gain: 1,
    anim: { ...ANIM_OFF, drift: true }, acc: { ...ACC_ZERO } },
];

const CHANNEL_COLORS = [
  { bg: '#ff4444', border: '#ff6666' },
  { bg: '#44cc44', border: '#66dd66' },
  { bg: '#4488ff', border: '#66aaff' },
];

// --- LED ---

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

// --- LEDGrid ---

class LEDGrid {
  constructor(canvas, gridX = DEFAULT_GRID_SIZE, gridY = DEFAULT_GRID_SIZE) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridX = gridX;
    this.gridY = gridY;
    this.tick = 0;

    this.speed = cubic(0.1, 1000);
    this.mirror = 0;
    this.feedback = 0;
    this.hueRotation = 0;
    this.modDepth = 0;

    this.channels = CHANNEL_DEFAULTS.map(d => ({
      ...d,
      anim: { ...d.anim },
      acc: { ...d.acc },
    }));
    this.prevLum = new Float32Array(gridX * gridY);
    this.onFrame = null;

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

  #waveAt(angle, shape) {
    const s = Math.sin(angle);
    if (shape <= 0.5) {
      const tri = INV_PI * Math.asin(s);
      return lerp(tri, s, shape * 2);
    }
    const sq = s >= 0 ? 1 : -1;
    return lerp(s, sq, (shape - 0.5) * 2);
  }

  #applyCutoff(v, cutoff) {
    if (cutoff > 0) {
      if (cutoff >= 1 || v <= cutoff) return 0;
      return (v - cutoff) / (1 - cutoff);
    } else if (cutoff < 0) {
      const ceil = 1 + cutoff;
      if (ceil <= 0 || v >= ceil) return 0;
      return v / ceil;
    }
    return v;
  }

  #evalChannel(e, col, row, fx, fy, modSource, fbLum) {
    const temporal = this.tick / TICK_RATE;
    const phaseT = e.drift * TWO_PI
                 + modSource * this.modDepth * MOD_DEPTH * TWO_PI
                 + fbLum * this.feedback * FEEDBACK_DEPTH;
    const g = e.geo;
    const gx = this.gridX;
    const gy = this.gridY;

    let wave;
    if (g >= 1) {
      const spatial = (col / gx) * fx + (row / gy) * fy;
      wave = this.#waveAt((spatial + temporal) * TWO_PI + phaseT, e.shape);
    } else if (g <= -1) {
      wave = this.#waveAt(((col / gx) * fx + temporal) * TWO_PI + phaseT, e.shape)
           * this.#waveAt(((row / gy) * fy + temporal) * TWO_PI + phaseT, e.shape);
    } else {
      const nx = col / gx - 0.5;
      const ny = row / gy - 0.5;
      const rSpatial = Math.sqrt(nx * nx + ny * ny) * 2 * fx
                     + Math.atan2(ny, nx) / TWO_PI * fy;
      const rWave = this.#waveAt((rSpatial + temporal) * TWO_PI + phaseT, e.shape);

      if (g > 0) {
        const lSpatial = (col / gx) * fx + (row / gy) * fy;
        const lWave = this.#waveAt((lSpatial + temporal) * TWO_PI + phaseT, e.shape);
        wave = lerp(rWave, lWave, g);
      } else {
        const pWave = this.#waveAt(((col / gx) * fx + temporal) * TWO_PI + phaseT, e.shape)
                    * this.#waveAt(((row / gy) * fy + temporal) * TWO_PI + phaseT, e.shape);
        wave = lerp(rWave, pWave, -g);
      }
    }

    return this.#applyCutoff((wave + 1) * 0.5, e.cutoff) * e.gain;
  }

  #computeHueMatrix() {
    const theta = this.hueRotation * TWO_PI;
    const cosA = Math.cos(theta);
    const sinA = Math.sin(theta);
    const k = (1 - cosA) / 3;
    const s = sinA * INV_SQRT3;
    return [
      cosA + k, k - s, k + s,
      k + s, cosA + k, k - s,
      k - s, k + s, cosA + k
    ];
  }

  #update() {
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

    const eff = new Array(3);
    for (let ch = 0; ch < 3; ch++) {
      const c = this.channels[ch];
      const e = {};
      for (const p of CHANNEL_PARAMS) {
        e[p.key] = c.anim[p.key]
          ? p.min + c.acc[p.key] * (p.max - p.min)
          : c[p.key];
      }
      eff[ch] = e;
    }

    const chFx = new Array(3);
    const chFy = new Array(3);
    for (let ch = 0; ch < 3; ch++) {
      const e = eff[ch];
      const f = cubic(e.freq, FREQ_SCALE);
      const d = e.dir * Math.PI;
      chFx[ch] = f * Math.cos(d);
      chFy[ch] = f * Math.sin(d);
    }

    const hue = this.#computeHueMatrix();
    const hasFeedback = Math.abs(this.feedback) > 0.001;

    for (let idx = 0; idx < this.leds.length; idx++) {
      const led = this.leds[idx];
      let col = led.col;
      let row = led.row;
      if (mx > 0 && col >= halfX) col = lerp(col, gx - 1 - col, mx);
      if (my > 0 && row >= halfY) row = lerp(row, gy - 1 - row, my);

      const fb = hasFeedback ? this.prevLum[idx] : 0;

      const r0 = this.#evalChannel(eff[0], col, row, chFx[0], chFy[0], 0, fb);
      const g0 = this.#evalChannel(eff[1], col, row, chFx[1], chFy[1], r0, fb);
      const b0 = this.#evalChannel(eff[2], col, row, chFx[2], chFy[2], g0, fb);

      const r = clamp01(hue[0] * r0 + hue[1] * g0 + hue[2] * b0);
      const g = clamp01(hue[3] * r0 + hue[4] * g0 + hue[5] * b0);
      const b = clamp01(hue[6] * r0 + hue[7] * g0 + hue[8] * b0);

      led.setColor(r, g, b);
      const lum = (r0 + g0 + b0) / 3;
      const fbDecay = Math.abs(this.feedback);
      this.prevLum[idx] = Math.min(lum + this.prevLum[idx] * fbDecay, 4);
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
    this.prevLum = new Float32Array(gridX * gridY);
  }

  start() {
    const frame = () => {
      for (const p of GLOBAL_PARAMS) {
        if (globalAnim[p.key]) {
          globalAcc[p.key] = (globalAcc[p.key] + globalRate[p.key] * ANIM_SCALE + 1) % 1;
          const t = globalAcc[p.key];
          const eff = p.mode === 'bounce'
            ? p.min + (1 - Math.abs(2 * t - 1)) * (p.max - p.min)
            : p.min + t * (p.max - p.min);
          if (p.key === 'speed') this.speed = cubic(eff, 1000);
          else this[p.key] = eff;
        }
      }
      this.tick += this.speed;
      for (let ch = 0; ch < 3; ch++) {
        const c = this.channels[ch];
        for (const p of CHANNEL_PARAMS) {
          if (c.anim[p.key]) {
            c.acc[p.key] = (c.acc[p.key] + c[p.key] * ANIM_SCALE + 1) % 1;
          }
        }
      }
      this.#update();
      this.#draw();
      if (this.onFrame) this.onFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

// --- Initialization ---

const grid = new LEDGrid(document.getElementById('led-canvas'));
grid.start();

// --- Global Controls ---

const globalControls = [];

function globalEffValue(p) {
  const t = globalAcc[p.key];
  return p.mode === 'bounce'
    ? p.min + (1 - Math.abs(2 * t - 1)) * (p.max - p.min)
    : p.min + t * (p.max - p.min);
}

function buildGlobalSection(containerId, params) {
  const row = document.querySelector(`#${containerId} .control-row`);

  for (const param of params) {
    let rawVal = param.val;

    const group = document.createElement('div');
    group.className = 'control-group';

    const nameEl = document.createElement('span');
    nameEl.className = 'param-name';
    nameEl.textContent = param.label;

    const { canvas, ctx } = createKnobCanvas();

    const valueEl = document.createElement('span');
    valueEl.className = 'control-value';
    valueEl.textContent = param.fmt(param.val);

    group.appendChild(nameEl);
    group.appendChild(canvas);
    group.appendChild(valueEl);
    row.appendChild(group);

    attachKnobDrag(canvas,
      () => globalAnim[param.key] ? globalRate[param.key] : rawVal,
      (v) => {
        if (globalAnim[param.key]) {
          globalRate[param.key] = v;
        } else {
          rawVal = v;
          if (param.key === 'speed') grid.speed = cubic(v, 1000);
          else grid[param.key] = v;
          valueEl.textContent = param.fmt(v);
          drawKnob(ctx, (v - param.min) / (param.max - param.min), KNOB_GRAY, KNOB_DIM);
        }
      }, param.min, param.max);

    nameEl.addEventListener('click', () => {
      if (globalAnim[param.key]) {
        const eff = globalEffValue(param);
        rawVal = eff;
        if (param.key === 'speed') grid.speed = cubic(eff, 1000);
        else grid[param.key] = eff;
        globalAnim[param.key] = false;
        valueEl.textContent = param.fmt(eff);
        nameEl.classList.remove('animating');
        drawKnob(ctx, (eff - param.min) / (param.max - param.min), KNOB_GRAY, KNOB_DIM);
      } else {
        globalAcc[param.key] = (rawVal - param.min) / (param.max - param.min);
        globalRate[param.key] = rawVal;
        globalAnim[param.key] = true;
        nameEl.classList.add('animating');
      }
    });

    drawKnob(ctx, (rawVal - param.min) / (param.max - param.min), KNOB_GRAY, KNOB_DIM);

    globalControls.push({
      key: param.key, ctx, valueEl, nameEl,
      fmt: param.fmt, min: param.min, max: param.max, mode: param.mode,
    });
  }
}

buildGlobalSection('global-controls', GLOBAL_PARAMS);

// --- Channel Controls ---

let selectedChannel = 0;

function buildChannelSection(containerId, params) {
  const row = document.querySelector(`#${containerId} .control-row`);
  const controls = [];

  for (const param of params) {
    const ch = grid.channels[0];
    const isAnim = ch.anim[param.key];
    const displayVal = isAnim
      ? param.min + ch.acc[param.key] * (param.max - param.min)
      : ch[param.key];

    const group = document.createElement('div');
    group.className = 'control-group';

    const nameEl = document.createElement('span');
    nameEl.className = 'param-name' + (isAnim ? ' animating' : '');
    nameEl.textContent = param.label;

    const { canvas, ctx } = createKnobCanvas();

    const valueEl = document.createElement('span');
    valueEl.className = 'control-value';
    valueEl.textContent = param.fmt(displayVal);

    group.appendChild(nameEl);
    group.appendChild(canvas);
    group.appendChild(valueEl);
    row.appendChild(group);

    attachKnobDrag(canvas,
      () => grid.channels[selectedChannel][param.key],
      (v) => {
        grid.channels[selectedChannel][param.key] = v;
        if (!grid.channels[selectedChannel].anim[param.key]) {
          valueEl.textContent = param.fmt(v);
          drawKnob(ctx, (v - param.min) / (param.max - param.min),
            CHANNEL_COLORS[selectedChannel].bg, KNOB_DIM);
        }
      },
      param.min, param.max);

    const norm = (displayVal - param.min) / (param.max - param.min);
    drawKnob(ctx, norm, CHANNEL_COLORS[0].bg, KNOB_DIM);

    controls.push({
      key: param.key, ctx, canvas, valueEl, nameEl,
      fmt: param.fmt, min: param.min, max: param.max,
    });
  }

  return controls;
}

const channelControls = buildChannelSection('channel-controls', CHANNEL_PARAMS);

// --- Animation Toggle ---

function toggleAnimation(ctrl) {
  const ch = grid.channels[selectedChannel];
  const colors = CHANNEL_COLORS[selectedChannel];

  if (ch.anim[ctrl.key]) {
    const effVal = ctrl.min + ch.acc[ctrl.key] * (ctrl.max - ctrl.min);
    ch[ctrl.key] = effVal;
    ch.anim[ctrl.key] = false;
    ctrl.valueEl.textContent = ctrl.fmt(effVal);
    ctrl.nameEl.classList.remove('animating');
    drawKnob(ctrl.ctx, (effVal - ctrl.min) / (ctrl.max - ctrl.min), colors.bg, KNOB_DIM);
  } else {
    ch.acc[ctrl.key] = (ch[ctrl.key] - ctrl.min) / (ctrl.max - ctrl.min);
    ch.anim[ctrl.key] = true;
    ctrl.nameEl.classList.add('animating');
  }
}

for (const ctrl of channelControls) {
  ctrl.nameEl.addEventListener('click', () => toggleAnimation(ctrl));
}

// --- Per-Frame UI Update ---

function updateUI() {
  for (const ctrl of globalControls) {
    if (globalAnim[ctrl.key]) {
      const t = globalAcc[ctrl.key];
      const effNorm = ctrl.mode === 'bounce' ? 1 - Math.abs(2 * t - 1) : t;
      const eff = ctrl.min + effNorm * (ctrl.max - ctrl.min);
      drawKnob(ctrl.ctx, effNorm, KNOB_GRAY, KNOB_DIM);
      ctrl.valueEl.textContent = ctrl.fmt(eff);
    }
  }

  const ch = grid.channels[selectedChannel];
  const colors = CHANNEL_COLORS[selectedChannel];

  for (const ctrl of channelControls) {
    if (ch.anim[ctrl.key]) {
      const displayVal = ctrl.min + ch.acc[ctrl.key] * (ctrl.max - ctrl.min);
      drawKnob(ctrl.ctx, ch.acc[ctrl.key], colors.bg, KNOB_DIM);
      ctrl.valueEl.textContent = ctrl.fmt(displayVal);
    }
  }
}

grid.onFrame = updateUI;

// --- Channel Switching ---

function switchChannel(ch) {
  selectedChannel = ch;
  const data = grid.channels[ch];
  const colors = CHANNEL_COLORS[ch];

  for (const ctrl of channelControls) {
    const isAnim = data.anim[ctrl.key];
    ctrl.nameEl.classList.toggle('animating', isAnim);

    const displayVal = isAnim
      ? ctrl.min + data.acc[ctrl.key] * (ctrl.max - ctrl.min)
      : data[ctrl.key];
    const norm = (displayVal - ctrl.min) / (ctrl.max - ctrl.min);
    ctrl.valueEl.textContent = ctrl.fmt(displayVal);
    drawKnob(ctrl.ctx, norm, colors.bg, KNOB_DIM);
  }

  const section = document.getElementById('channel-controls');
  section.style.setProperty('--ch-bg', colors.bg);
  section.style.setProperty('--ch-border', colors.border);

  document.querySelector('.ch-btn.active').classList.remove('active');
  document.querySelectorAll('.ch-btn')[ch].classList.add('active');
}

// --- Channel Toggle ---

document.querySelectorAll('.ch-btn').forEach((btn, i) => {
  btn.addEventListener('click', () => switchChannel(i));
});

switchChannel(0);

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
