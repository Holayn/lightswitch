const { spawn, exec } = require('child_process');
const util = require('util');
const readline = require('readline');
const execAsync = util.promisify(exec);

if (!process.env.KASA_TARGET) {
  console.error('Missing environment variable KASA_TARGET');
  return;
}

const LIGHTS_ALIASES = ['pendant', 'counter'];
const GPIO_CHIP = process.env.GPIO_CHIP || 'gpiochip0';
const BUTTON_PIN = 17;
const LED_PIN = 4;
const QUIET_MS = 100; // line must be silent this long before we treat it as a settled press
const BIAS = process.env.GPIO_BIAS || 'pull-down'; // match your actual wiring: 'pull-up' | 'pull-down' | 'disabled'

let isLightsOn = false;
let ledProcess = null;
let quietTimer = null;
let pendingEdge = null;

function setLED(on) {
  if (ledProcess) {
    ledProcess.kill('SIGTERM');
    ledProcess = null;
  }
  ledProcess = spawn('gpioset', [`--chip=${GPIO_CHIP}`, `${LED_PIN}=${on ? 1 : 0}`]);
  ledProcess.on('error', (err) => console.log('gpioset error:', err));
}

function updateProcessingLEDState(on) {
  setLED(on);
}

function watchButton() {
  const monitor = spawn('gpiomon', [`--chip=${GPIO_CHIP}`, `--bias=${BIAS}`, '--edges=both', String(BUTTON_PIN)]);

  const rl = readline.createInterface({ input: monitor.stdout });
  rl.on('line', (line) => {
    const match = line.match(/\b(rising|falling)\b/i);
    if (!match) return;

    pendingEdge = match[1].toLowerCase();
    if (quietTimer) clearTimeout(quietTimer);

    // A lot of new lines can come in from a button press, since gpiomon reports any electrical transition.
    quietTimer = setTimeout(() => {
      // Only treat a settle on the edge that means "pressed" for your wiring.
      // pull-down wiring -> button press pulls line HIGH -> settle on 'rising'
      // pull-up wiring   -> button press pulls line LOW  -> settle on 'falling'
      const pressEdge = BIAS === 'pull-up' ? 'falling' : 'rising';
      if (pendingEdge === pressEdge) {
        onButtonClick();
      }
      quietTimer = null;
    }, QUIET_MS);
  });

  monitor.stderr.on('data', (data) => console.log('gpiomon stderr:', data.toString()));
  monitor.on('error', (err) => {
    console.log('ERROR spawning gpiomon:', err);
    process.exit(1);
  });
  monitor.on('exit', (code) => {
    console.log(`gpiomon exited with code ${code}, restarting in 1s...`);
    setTimeout(watchButton, 1000);
  });
}

async function onButtonClick() {
  console.log(`${new Date().toISOString()}: button clicked`);
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
  const { stdout, stderr } = await execAsync(`kasa --target ${process.env.KASA_TARGET} --alias ${deviceAlias} ${state}`);
  if (stderr) {
    if (retries < 3) {
      await execKasa(deviceAlias, state, retries + 1);
    }
    console.log('stderr:', stderr);
  } else {
    console.log('stdout:', stdout);
  }
}

function cleanup() {
  if (ledProcess) ledProcess.kill('SIGTERM');
  if (quietTimer) clearTimeout(quietTimer);
  process.exit();
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

watchButton();
console.log('Initialized');
