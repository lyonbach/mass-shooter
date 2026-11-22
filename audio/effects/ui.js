import { SoundEffect } from '../core/effect.js';
import { Tone } from '../core/primitives.js';

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

class BuzzerAlarm extends SoundEffect {
    render({ gain, at, voice }) {
        const startPitch = this.n('startPitch'), endPitch = this.n('endPitch');
        const speed = this.n('buzzSpeed'), duration = 0.5 / speed;
        const saw = gain * this.n('sawGain'), square = gain * this.n('squareGain');
        const ctx = this.engine.ctx;
        const buzz = (freq, end, level, type, time) => {
            const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(freq, time);
            oscillator.frequency.linearRampToValueAtTime(end, time + duration);
            envelope.gain.setValueAtTime(0, time);
            envelope.gain.linearRampToValueAtTime(level, time + 0.005);
            envelope.gain.setValueAtTime(level, time + duration - 0.005);
            envelope.gain.linearRampToValueAtTime(0, time + duration);
            voice.track(oscillator, [oscillator, envelope]);
            oscillator.connect(envelope); envelope.connect(voice.output);
            oscillator.start(time); oscillator.stop(time + duration + 0.03);
        };
        for (let i = 0; i < 3; i++) {
            const time = at + i / speed;
            buzz(startPitch, endPitch, saw, 'sawtooth', time);
            buzz(startPitch * 136 / 130, endPitch * 126 / 120, square, 'square', time);
        }
    }
}

export class LowHealthAlarm extends BuzzerAlarm {
    static key = 'lowHealth';
}

export class Alert extends BuzzerAlarm {
    static key = 'alert';
}

export class MissileWarning extends SoundEffect {
    static key = 'missileAlert';
    render({ gain, at, voice }) {
        for (const offset of [0, 0.1, 0.2]) {
            new Tone(this.engine, { voice, freq: 980, end: 820, duration: 0.05, gain: gain * this.n('toneGain'), type: 'sine', time: at + offset });
        }
    }
}

export class UiBlip extends SoundEffect {
    static key = 'ui';
    render({ gain, at, voice }) {
        new Tone(this.engine, { voice, freq: 700, end: 1000, duration: 0.08, gain: gain * this.n('toneGain'), time: at });
    }
}
