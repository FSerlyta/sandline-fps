// Synthesised sound: every effect is built from oscillators and filtered noise in the
// Web Audio API, so the game ships no audio files. The context starts on the first user
// gesture (the play click), as browsers require.
let context = null;
let master = null;
let noiseBuffer = null;

function ensure() {
  if (context) return true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.35;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  } catch {
    return false;
  }
  return true;
}

function noise(duration, filterFreq, gainValue, type = 'lowpass') {
  if (!context) return;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = context.createGain();
  gain.gain.setValueAtTime(gainValue, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start();
  source.stop(context.currentTime + duration);
}

function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
  if (!context) return;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, context.currentTime);
  if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(gainValue, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

export const audio = {
  unlock() {
    if (ensure() && context.state === 'suspended') context.resume();
  },
  shot(kind, distance = 0) {
    if (!ensure()) return;
    const volume = Math.max(0.08, 1 - distance / 70);
    if (kind === 'sniper') {
      noise(0.22, 900, 0.9 * volume);
      tone(140, 0.18, 0.5 * volume, 'sine', 50);
    } else if (kind === 'pistol') {
      noise(0.09, 1800, 0.55 * volume);
      tone(220, 0.07, 0.3 * volume, 'square', 90);
    } else if (kind === 'smg') {
      noise(0.07, 2400, 0.45 * volume);
    } else {
      noise(0.12, 1400, 0.7 * volume);
      tone(180, 0.1, 0.35 * volume, 'sine', 60);
    }
  },
  dryFire() {
    if (!ensure()) return;
    tone(1400, 0.04, 0.15, 'square');
  },
  reload() {
    if (!ensure()) return;
    tone(900, 0.05, 0.2, 'square');
    setTimeout(() => tone(600, 0.05, 0.2, 'square'), 260);
  },
  step(running) {
    if (!ensure()) return;
    noise(0.06, running ? 700 : 420, running ? 0.16 : 0.09);
  },
  hit() {
    if (!ensure()) return;
    tone(1900, 0.05, 0.25, 'sine');
  },
  kill() {
    if (!ensure()) return;
    tone(1500, 0.06, 0.25, 'sine');
    setTimeout(() => tone(2100, 0.08, 0.25, 'sine'), 70);
  },
  hurt() {
    if (!ensure()) return;
    tone(110, 0.15, 0.4, 'sine', 70);
  },
  beep(final = false) {
    if (!ensure()) return;
    tone(final ? 1400 : 1000, final ? 0.3 : 0.09, 0.3, 'sine');
  },
  plant() {
    if (!ensure()) return;
    tone(700, 0.12, 0.3, 'sine');
    setTimeout(() => tone(700, 0.12, 0.3, 'sine'), 150);
  },
  explosion() {
    if (!ensure()) return;
    noise(0.9, 300, 1.0);
    tone(70, 0.8, 0.7, 'sine', 30);
  },
  roundWin() {
    if (!ensure()) return;
    tone(523, 0.14, 0.3, 'sine');
    setTimeout(() => tone(659, 0.14, 0.3, 'sine'), 140);
    setTimeout(() => tone(784, 0.25, 0.3, 'sine'), 280);
  },
  roundLose() {
    if (!ensure()) return;
    tone(392, 0.18, 0.3, 'sine');
    setTimeout(() => tone(311, 0.3, 0.3, 'sine'), 180);
  },
  buy() {
    if (!ensure()) return;
    tone(880, 0.06, 0.25, 'sine');
    setTimeout(() => tone(1174, 0.08, 0.25, 'sine'), 70);
  },
};
