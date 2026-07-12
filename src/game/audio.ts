// Procedural Web Audio engine — no assets required, constructed after first
// user gesture to satisfy autoplay policies.

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOscs: OscillatorNode[] = [];
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private _muted = false;
  private timeScale = 1;

  get muted() {
    return this._muted;
  }

  /** Must be called from a user gesture handler. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this._muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
    return this._muted;
  }

  setTimeScale(scale: number) {
    this.timeScale = scale;
    if (this.ctx && this.musicGain) {
      // tape-slowdown feel: music dips in level during slow-mo
      this.musicGain.gain.setTargetAtTime(scale < 1 ? 0.05 : 0.12, this.ctx.currentTime, 0.15);
    }
  }

  // ---------- engine loop ----------

  startEngine() {
    if (!this.ctx || !this.master || this.engineOscs.length) return;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.16;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    for (const detune of [0, 8]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      osc.detune.value = detune;
      osc.connect(this.engineFilter);
      osc.start();
      this.engineOscs.push(osc);
    }
  }

  /** speedRatio: 1 = base speed. Pitch follows speed; slow-mo drops it (tape effect). */
  setEngineSpeed(speedRatio: number) {
    if (!this.ctx || !this.engineOscs.length) return;
    const freq = 50 * speedRatio * (0.55 + 0.45 * this.timeScale);
    const t = this.ctx.currentTime;
    for (const osc of this.engineOscs) osc.frequency.setTargetAtTime(freq, t, 0.1);
    this.engineFilter?.frequency.setTargetAtTime(300 + 260 * speedRatio, t, 0.1);
  }

  stopEngine() {
    for (const osc of this.engineOscs) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.engineOscs = [];
    this.engineGain?.disconnect();
    this.engineGain = null;
    this.engineFilter = null;
  }

  // ---------- one-shots ----------

  private noiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  whoosh() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.12);
    filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.35);
  }

  comboChime(level: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const base = 520 + Math.min(level, 8) * 70;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * (i === 0 ? 1 : 1.5);
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    }
  }

  coin() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    for (const [i, freq] of [1318.5, 1975.5].entries()) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    }
  }

  checkpointDing() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 880;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  }

  crash() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    // muffled thud
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(120, ctx.currentTime);
    thud.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.4);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.9, ctx.currentTime);
    thudGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    thud.connect(thudGain).connect(this.master);
    thud.start();
    thud.stop(ctx.currentTime + 0.5);
    // crunch noise
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.55);
  }

  // ---------- background music: light Web Audio arpeggio ----------

  startMusic() {
    if (!this.ctx || !this.master || this.musicTimer !== null) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.12;
    this.musicGain.connect(this.master);
    // C major pentatonic-ish cheery loop
    const notes = [261.6, 329.6, 392.0, 523.3, 392.0, 329.6, 440.0, 329.6];
    const playStep = () => {
      if (!this.ctx || !this.musicGain) return;
      const freq = notes[this.musicStep % notes.length] * (this.timeScale < 1 ? 0.5 : 1);
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.45);
      this.musicStep++;
    };
    this.musicTimer = window.setInterval(playStep, 280);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicGain?.disconnect();
    this.musicGain = null;
  }
}
