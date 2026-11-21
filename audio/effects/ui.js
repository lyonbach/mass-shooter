import { SoundEffect } from '../core/effect.js';
import { Tone, Noise } from '../core/primitives.js';

export class Arpeggio extends SoundEffect {
    static key = 'pickup';
    render({ gain, at, voice }) {
        for (const [i, f] of [440, 554, 659].entries()) {
            new Tone(this.engine, { voice, freq: f, end: f, duration: 0.3, gain: gain * this.n('noteGain'), type: 'sine', time: at + i * 0.08 });
        }
    }
}

export class WaveFanfare extends SoundEffect {
    static key = 'wave';
    render({ gain, at, voice }) {
        for (const [i, f] of [330, 440, 660].entries()) {
            new Tone(this.engine, { voice, freq: f, end: f, duration: 0.2, gain: gain * this.n('noteGain'), type: 'triangle', time: at + i * 0.13 });
        }
    }
}

export class UpgradeChime extends Arpeggio {
    static key = 'upgrade';
}

export class LowHealthAlarm extends SoundEffect {
    static key = 'lowHealth';
    render({ gain, at, voice }) {
        const saw = gain * this.n('sawGain'), square = gain * this.n('squareGain'), noise = gain * this.n('noiseGain'), decay = this.n('decay');
        for (const offset of [0, 0.48, 0.96]) {
            new Tone(this.engine, { voice, freq: 185, end: 175, duration: 0.32 * decay, gain: saw, type: 'sawtooth', time: at + offset * decay });
            new Tone(this.engine, { voice, freq: 277.5, end: 262.5, duration: 0.32 * decay, gain: square, type: 'square', time: at + offset * decay });
            new Noise(this.engine, { voice, duration: 0.12 * decay, gain: noise, frequency: 900, time: at + offset * decay });
        }
    }
}

export class MissileWarning extends SoundEffect {
    static key = 'missileAlert';
    render({ gain, at, voice }) {
        for (const offset of [0, 0.1, 0.2]) {
            new Tone(this.engine, { voice, freq: 980, end: 820, duration: 0.05, gain: gain * this.n('toneGain'), type: 'sine', time: at + offset });
        }
    }
}

export class Alert extends SoundEffect {
    static key = 'alert';
    render({ gain, at, voice }) {
        const level = gain * this.n('toneGain'), decay = this.n('decay');
        for (const offset of [0, 0.36]) {
            new Tone(this.engine, { voice, freq: 330, end: 310, duration: 0.22 * decay, gain: level * 0.65, type: 'sawtooth', time: at + offset * decay });
            new Tone(this.engine, { voice, freq: 495, end: 465, duration: 0.22 * decay, gain: level * 0.35, type: 'square', time: at + offset * decay });
        }
    }
}

export class UiBlip extends SoundEffect {
    static key = 'ui';
    render({ gain, at, voice }) {
        new Tone(this.engine, { voice, freq: 700, end: 1000, duration: 0.08, gain: gain * this.n('toneGain'), time: at });
    }
}
