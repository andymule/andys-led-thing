const COUNTER_SPEED_DIVISOR = 100;
const DEFUALT_GRID_SIZE = 8;

class Signal {
  constructor(name) {
    this.amp = 1;
    this.floor = 0;
    this.hz = 1;
    this.name = name;
    this.phase = 0;
  }

  valueAt(location, counter, speed = COUNTER_SPEED_DIVISOR) {
    return this.floor + this.amp * Math.sin((counter / speed + location) * this.hz + (this.phase % 360 / 360 * speed));
  }

  updateHz(newHz) {
    this.hz = newHz;
  }

  updatePhase(newPhase) {
    this.phase = newPhase;
  }
};

class LEDSize {
  constructor(x, y, width) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = width; // square for now
  }
}

class LED {
  constructor(size, color) {
    this.color = color;
    this.size = size;
  }

  updateColor(r, g, b) {
    this.color = [r * 255, g * 255, b * 255];
  }
}

class Grid {
  constructor(size = DEFUALT_GRID_SIZE) {
    this.size = size;
  }
}

class LEDGrid extends Grid {
  constructor(canvas, size) {
    super(size);
    this.counter = 0;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.leds = this.buildLEDs();
    this.signals = [new Signal('red'), new Signal('green'), new Signal('blue')];
  }
  
  animate() {
    this.counter += 1;
    this.updateLEDs();
    requestAnimationFrame(() => this.animate());
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawLEDs();
  }

  buildLEDs() {
    const ledSize = this.canvas.width / this.size;
    const leds = [];
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const xx = x / this.size * this.canvas.width;
        const yy = y / this.size * this.canvas.height;
        const LEDColor = [x / this.size * 255, y / this.size * 255, 130];
        const size = new LEDSize(xx, yy, ledSize);
        const led = new LED(size, LEDColor)
        leds.push(led);
      }
    }

    return leds;
  }

  drawLEDs() {
    this.leds.forEach(led => {
      const {x: LEDxPos, y: LEDyPos, width: LEDwidth} = led.size;
      const LEDheight = LEDwidth; // square for now
      const [r, g, b] = led.color;
      this.ctx.fillStyle = `rgb(${r},${g},${b})`;
      this.ctx.fillRect(LEDxPos, LEDyPos, LEDwidth, LEDheight);
    });
  }

  updateLEDs() {
    const [redSignal, greenSignal, blueSignal] = this.signals;
    this.leds.forEach((led, i) => 
      led.updateColor(
        redSignal.valueAt(i, this.counter),
        greenSignal.valueAt(i, this.counter),
        blueSignal.valueAt(i, this.counter)
      ));
  }
};

// build grid and render
const ledGrid = new LEDGrid(document.getElementById('canvas-container'));
ledGrid.animate();

// build html for modifying signal values
// TODO: when more than prototype is needed update to react
const signalControllerContainer = document.getElementById('signal-controller-container');
ledGrid.signals.forEach(signal => {
  // parent wrapper
  const signalController = document.createElement('div');
  signalController.classList.add('signal_controller_container');
  
  // output controls
  const signalControllerHTML = `
    <h2>${signal.name} signal</h2>
    <div class="signal_controller">
      <label for="${signal.name}hz">${signal.hz} hz</label>
      <input type="range" id="${signal.name}hz" name="${signal.name}hz" min="0" max="10" value="${signal.hz}" step="0.1">
    </div>
    <div class="signal_controller">
      <label for="${signal.name}phase">${signal.phase} phase</label>
      <input type="range" id="${signal.name}phase" name="${signal.name}phase" min="0" max="1000" value="${signal.phase}" step="10">
    </div>
  `;

  // append to wrapper
  signalController.innerHTML = signalControllerHTML;
  signalControllerContainer.appendChild(signalController);

  // add event listeners to inputs
  document.getElementById(`${signal.name}hz`).addEventListener('change', event => {
    const newHz = event.target.value;
    signal.updateHz(newHz);
    document.querySelector(`label[for="${signal.name}hz"]`).textContent = `${newHz} hz`;
  });

  document.getElementById(`${signal.name}phase`).addEventListener('change', event => {
    const newPhase = event.target.value;
    signal.updatePhase(newPhase);
    document.querySelector(`label[for="${signal.name}phase"]`).textContent = `${newPhase} phase`;
  });
});
