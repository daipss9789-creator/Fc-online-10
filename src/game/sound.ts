import {
  HAPTIC_PATTERNS,
  isEliteOvrCard,
  resolvePackRevealVibrationPattern,
  resolveUpgradeVibrationPattern,
  vibrateDevice,
} from './haptics';
import { SeasonCode } from './types';

class GameSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playClick(pitchScale: number = 1): void {
    this.triggerHaptic('tap');
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 * pitchScale, now);
    osc.frequency.exponentialRampToValueAtTime(240 * pitchScale, now + 0.045);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playWalkoutStage(stage: 'entry' | 'flag' | 'position' | 'club' | 'reveal'): void {
    this.triggerHaptic(stage === 'reveal' ? 'walkout' : stage === 'entry' ? 'light' : 'tap');
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (stage === 'entry') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.55);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.62);
      return;
    }

    const stageFreqs: Record<string, number[]> = {
      flag: [220, 329.63],
      position: [261.63, 392.0],
      club: [329.63, 493.88],
      reveal: [261.63, 329.63, 392.0, 523.25],
    };
    const notes = stageFreqs[stage] || [330];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = stage === 'reveal' ? 'sawtooth' : 'triangle';
      const t0 = now + i * 0.045;
      const dur = stage === 'reveal' ? 0.55 : 0.24;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.075, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
  }

  public playCardRevealCelebration(params: {
    ovr: number;
    season?: SeasonCode;
    isBatch?: boolean;
  }): void {
    const pattern = resolvePackRevealVibrationPattern(params);
    vibrateDevice(pattern);

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const isElite = isEliteOvrCard(params.ovr, params.season);
    const notes = isElite
      ? [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]
      : [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isElite && i >= 3 ? 'sawtooth' : 'triangle';
      const t0 = now + i * 0.045;
      const dur = isElite ? 0.68 : 0.52;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.08, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
  }

  public triggerCardObtainVibration(ovr: number, season?: SeasonCode): boolean {
    const pattern = resolvePackRevealVibrationPattern({ ovr, season });
    return vibrateDevice(pattern);
  }

  public playPackTear(): void {
    vibrateDevice(HAPTIC_PATTERNS.packTear);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.22);
    const noiseBuffer = ctx.createBuffer(1, length, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, 1.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + 0.2);
    filter.Q.value = 1.6;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.18, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = now + 0.08 + idx * 0.04;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.06, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
  }

  public playChamberCharge(): void {
    this.triggerHaptic('suspense');
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const hum = ctx.createOscillator();
    const hGain = ctx.createGain();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(85, now);
    hum.frequency.exponentialRampToValueAtTime(340, now + 1.85);
    hGain.gain.setValueAtTime(0.03, now);
    hGain.gain.linearRampToValueAtTime(0.085, now + 1.5);
    hGain.gain.exponentialRampToValueAtTime(0.001, now + 1.95);
    hum.connect(hGain);
    hGain.connect(ctx.destination);
    hum.start(now);
    hum.stop(now + 2.0);

    for (let i = 0; i < 10; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = now + i * 0.17;
      osc.type = i >= 6 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(190 + i * 48, t0);
      osc.frequency.exponentialRampToValueAtTime(135 + i * 40, t0 + 0.11);
      gain.gain.setValueAtTime(0.075, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    }
  }

  public playUpgradeSuspense(): void {
    this.playChamberCharge();
  }

  public playUpgradeOutcome(
    success: boolean,
    highGradeCelebration: boolean = false,
    resultOvr: number = 0
  ): void {
    const pattern = resolveUpgradeVibrationPattern({
      succeeded: success,
      newGrade: highGradeCelebration ? 8 : success ? 2 : 1,
      newOvr: resultOvr,
    });
    vibrateDevice(pattern);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(success ? 150 : 120, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    subGain.gain.setValueAtTime(0.16, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.22);

    if (success) {
      const chord = highGradeCelebration
        ? [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66]
        : [392.0, 493.88, 587.33, 783.99];
      chord.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = highGradeCelebration && idx >= 4 ? 'sawtooth' : 'triangle';
        const t0 = now + idx * 0.055;
        const dur = highGradeCelebration ? 0.85 : 0.65;
        osc.frequency.setValueAtTime(f, t0);
        gain.gain.setValueAtTime(highGradeCelebration ? 0.095 : 0.1, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
      });
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(64, now + 0.44);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.47);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.49);
    }
  }

  public triggerHaptic(
    type: 'tap' | 'light' | 'success' | 'failure' | 'suspense' | 'walkout' | 'eliteWalkout'
  ): void {
    const pattern = HAPTIC_PATTERNS[type];
    if (pattern !== undefined) {
      vibrateDevice(pattern);
    }
  }

  public playFoosballKick(): void {
    this.triggerHaptic('tap');
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Kick impact + goal chime
    const kick = ctx.createOscillator();
    const kGain = ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(210, now);
    kick.frequency.exponentialRampToValueAtTime(55, now + 0.11);
    kGain.gain.setValueAtTime(0.14, now);
    kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    kick.connect(kGain);
    kGain.connect(ctx.destination);
    kick.start(now);
    kick.stop(now + 0.13);

    const chime = ctx.createOscillator();
    const cGain = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(587.33, now + 0.22);
    chime.frequency.setValueAtTime(880, now + 0.3);
    cGain.gain.setValueAtTime(0.08, now + 0.22);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    chime.connect(cGain);
    cGain.connect(ctx.destination);
    chime.start(now + 0.22);
    chime.stop(now + 0.52);
  }
}

export const gameSound = new GameSoundEngine();
