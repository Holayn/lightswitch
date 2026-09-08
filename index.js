const { Gpio } = require('onoff');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

if (!process.env.KASA_TARGET) {
  console.error('Missing environment variable KASA_TARGET');
  return;
}

const LIGHTS_ALIASES = ['pendant', 'counter'];
const DEBOUNCE_MS = 50;

let isLightsOn = false;

const button = new Gpio(17, 'in', 'both', { debounceTimeout: DEBOUNCE_MS });
const ledOut = new Gpio(4, 'out');

button.watch((err, value) => {
  if (err) {
    console.log('ERROR', err.stack);
    return;
  }
  // Adjust this check depending on your wiring:
  // value === 0 -> button pressed (pull-up, active-low)
  // value === 1 -> button pressed (pull-down, active-high)
  if (value === 0) {
    onButtonClick();
  }
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
  ledOut.writeSync(on ? 1 : 0);
}

function cleanup() {
  button.unexport();
  ledOut.unexport();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log('Initialized');