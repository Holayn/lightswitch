const { Chip, Line } = require('node-libgpiod');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const LIGHTS_ALIASES = ['pendant', 'counter'];

let isLightsOn = false;

const chip = new Chip(0); // gpiochip0 — the main header on Pi 3/4; use the right chip number for Pi 5 (often 4)
const button = new Line(chip, 17);
const led = new Line(chip, 4);

led.requestOutputMode();
button.requestInputModeEvents({ edge: 'both', bias: 'disabled' });
// adjust `bias` to 'pull-up' or 'pull-down' to match your wiring if `disabled` doesn't work as expected

button.on('event', (event) => {
  // event.eventType: 1 = rising edge, 2 = falling edge
  onButtonClick();
});

async function onButtonClick() {
  updateProcessingLEDState(true);
  try {
    await toggleLights();
  } catch (e) {
    console.log(e);
  } finally {
    updateProcessingLEDState(false);
  }
}

async function toggleLights() {
  await Promise.all(LIGHTS_ALIASES.map(alias => {
    return execKasa(alias, isLightsOn ? 'off' : 'on');
  }));
  isLightsOn = !isLightsOn;
}

async function execKasa(deviceAlias, state, retries = 0) {
  const { stdout, stderr } = await exec(`kasa --target ${process.env.KASA_TARGET} --alias ${deviceAlias} ${state}`);
  if (stderr) {
    if (retries < 3) {
      await execKasa(deviceAlias, state, retries + 1);
    }
    console.log('stderr:', stderr);
  } else {
    console.log('stdout:', stdout);
  }
}

function updateProcessingLEDState(on) {
  led.setValue(on ? 1 : 0);
}

console.log('Initialized');