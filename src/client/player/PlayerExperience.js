import * as soundworks from 'soundworks/client';
import PitchAndRollEstimator from './PitchAndRollEstimator.js';
import ButtonView from './ButtonView.js';
import LoopSynth from './LoopSynth.js';
import StretchSynth from './StretchSynth.js';

const audioContext = soundworks.audioContext;

const deviceMotionPlatformFeatureDef = {
  id: 'device-motion',
  check: function () {
    return !!DeviceMotionEvent;
  },
  interactionHook: function () {
    if (DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
      return DeviceMotionEvent.requestPermission()
        .then((response) => {
          return Promise.resolve((response == 'granted'));
        })
        .catch((err) => {
          console.log(err);
          return Promise.resolve(false);
        });
    }
  }
}

function getBaseName(fileName) {
  let slashIndex = fileName.lastIndexOf("/");

  if (slashIndex >= 0)
    fileName = fileName.substring(slashIndex + 1);

  let dotIndex = fileName.lastIndexOf(".");

  if (dotIndex >= 0)
    fileName = fileName.substring(0, dotIndex);

  return fileName;
}

function getButtonName(filePath) {
  const baseName = getBaseName(filePath);
  const segs = baseName.split('_');
  let skip = true;

  if (segs.length > 1) {
    let i = 0;

    // skip leading numbers
    if (!isNaN(parseInt(segs[0])))
      i++;

    let buttonName = segs[i];

    for (i++; i < segs.length; i++)
      buttonName += ' ' + segs[i];

    return buttonName;
  }

  return baseName;
}

// this experience plays a sound when it starts, and plays another sound when
// other clients join the experience
export default class PlayerExperience extends soundworks.Experience {
  constructor(assetsDomain) {
    super();

    this.platform = this.require('platform', {
      features: ['web-audio', 'device-motion']
    });
    this.platform.addFeatureDefinition(deviceMotionPlatformFeatureDef);

    this.fileSystem = this.require('file-system', {
      list: {
        path: 'sounds',
        directories: true,
        recursive: false,
      }
    });

    this.audioBufferManager = this.require('audio-buffer-manager');

    this.pitchAndRoll = new PitchAndRollEstimator();

    this.doLoop = false;
    this.useGranular = false;

    this.synth = new LoopSynth();
    this.audioBuffers = null;

    this.buttonSelectDir = this.buttonSelectDir.bind(this);
    this.toggleLoop = this.toggleLoop.bind(this);
    this.toggleGranular = this.toggleGranular.bind(this);
    this.buttonHome = this.buttonHome.bind(this);
    this.buttonStartPlaying = this.buttonStartPlaying.bind(this);
    this.buttonStopPlaying = this.buttonStopPlaying.bind(this);
  }

  buttonSelectDir(index, def) {
    this.hide();
    this.audioBufferManager.show();

    this.fileSystem.getList({
      path: `sounds/${def.label}`,
      directories: false,
      recursive: false,
    }).then((fileList) => {
      const definitions = [];

      for (let filePath of fileList) {
        definitions.push({
          label: getButtonName(filePath),
        });
      }

      this.audioBufferManager
        .loadFiles(fileList, this.audioBufferManager.view)
        .then(() => {
          this.audioBuffers = this.audioBufferManager.data;

          // create a list of buttons from the sound files names in the chosen directory
          this.view = new ButtonView(definitions, this.toggleLoop, this.toggleGranular, this.buttonHome, this.buttonStartPlaying, this.buttonStopPlaying, { showHeader: true, buttonState: true });

          this.audioBufferManager.hide();
          this.show();
        });
    });
  }

  toggleLoop(doLoop) {
    this.synth.setLoop(doLoop);
    this.doLoop = doLoop;
  }

  toggleGranular(useGranular) {
    if (useGranular !== this.useGranular) {
      this.synth.stop();
      this.view.resetButtons();
      this.useGranular = useGranular;

      if (useGranular)
        this.synth = new StretchSynth();
      else
        this.synth = new LoopSynth();

      this.synth.setLoop(this.doLoop);
    }
  }

  buttonHome(value) {
    location.reload();
  }

  buttonStartPlaying(index, def) {
    const audioBuffer = this.audioBuffers[index];
    this.synth.start(audioBuffer, () => {
      this.view.releaseButton(index, true); // release it, but silently!
    });
  }

  buttonStopPlaying(index, def) {
    this.synth.stop();
  }

  showMenu() {
    const definitions = [];

    // create a list of buttons from the directories in /sounds
    for (let filePath of this.fileSystem.fileList) {
      definitions.push({
        label: getBaseName(filePath),
      });
    }

    this.view = new ButtonView(definitions, null, null, null, this.buttonSelectDir, null, { showHeader: false, buttonState: false });
    this.show();
  }

  registerDeviceMotionListener() {
    window.addEventListener('devicemotion', (e) => {
      let accX = event.accelerationIncludingGravity.x;
      let accY = event.accelerationIncludingGravity.y;
      let accZ = event.accelerationIncludingGravity.z;

      const pitchAndRoll = this.pitchAndRoll;
      pitchAndRoll.estimateFromAccelerationIncludingGravity(accX, accY, accZ);

      this.synth.setPitch(pitchAndRoll.pitch);
      this.synth.setRoll(pitchAndRoll.roll);
    });
  }

  start() {
    super.start(); // don't forget this

    this.registerDeviceMotionListener();
    this.showMenu();
  }
}