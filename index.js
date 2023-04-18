const { Gpio } = require( 'onoff' );
const RPiGPIOButtons = require('rpi-gpio-buttons');
const util = require('util');

const exec = util.promisify(require('child_process').exec);

const LIGHTS_ALIASES = ['pendant', 'desk', 'counter'];

let isLightsOn = false;

const buttons = new RPiGPIOButtons({
  pins: [17],
  usePullUp: false,
});

buttons.on('button_event', (type) => {
  if (type === 'clicked' || type === 'released') {
    onButtonClick();
  }
});

buttons
  .init()
  .catch(error => {
    console.log('ERROR', error.stack);
    process.exit(1);
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

async function execKasa(deviceAlias, state) {
  const { stdout, stderr } = await exec(`kasa --type plug --alias ${deviceAlias} ${state}`);
  if (stderr) {
    console.log('stderr:', stderr);
  } else {
    console.log('stdout:', stdout);
  }
}

function updateProcessingLEDState(on) {
  const ledOut = new Gpio('4', 'out');
  ledOut.writeSync( on ? 1 : 0 );
}

console.log('Initialized');