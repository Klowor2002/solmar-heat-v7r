// audio.js — procedural WebAudio: no samples, everything synthesized.
//
// A tiny synth bench: an engine hum that tracks the player's speed,
// a two-tone siren that fades in with police proximity, noise-burst
// gunshots, and soft UI blips for pickups and mission stings. The
// context is created lazily on the first user gesture (browser rule),
// and every voice is cheap enough to leave running for a session.

export class AudioBench {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: a detuned saw pair through a lowpass, gain tied to speed.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineFilter = engineFilter;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // Siren: square wave whose frequency the update loop flips.
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 660;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  // Called every frame with the driving state and nearest-cop distance.
  update(dt, speed01, inCar, copDist) {
    if (!this.ctx) return;
    // A tab switch or OS interruption can suspend the context
    // mid-session; unlock() only runs on menu clicks, so heal it
    // here, throttled to one attempt every couple of seconds.
    if (this.ctx.state === 'suspended') {
      const now = performance.now();
      if (!this.resumeTry || now - this.resumeTry > 2000) {
        this.resumeTry = now;
        this.ctx.resume();
      }
      return;
    }
    const t = this.ctx.currentTime;
    const target = inCar ? 0.05 + speed01 * 0.10 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);

    this.sirenFlip += dt;
    if (this.sirenFlip > 0.42) {
      this.sirenFlip = 0;
      this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 700 ? 620 : 830;
    }
    const sirenLevel = copDist < 60 ? (1 - copDist / 60) * 0.045 : 0;
    this.sirenGain.gain.setTargetAtTime(sirenLevel, t, 0.2);
  }

  blip(freq = 880, dur = 0.09, gain = 0.12, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  shot() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = ctx.sampleRate * 0.14;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const g = ctx.createGain(); g.gain.value = 0.22;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 500;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  sting(up = true) {
    if (!this.ctx) return;
    const base = up ? [523, 659, 784] : [392, 330, 262];
    base.forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 0.10, 'triangle'), i * 90));
  }

  cash() { this.blip(1320, 0.07, 0.10); setTimeout(() => this.blip(1760, 0.1, 0.10), 60); }
}
