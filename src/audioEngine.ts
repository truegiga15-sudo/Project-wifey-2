/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class LoveAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  private isInitialized = false;
  private isMuted = true;
  private padOscs: OscillatorNode[] = [];
  private chordInterval: number | null = null;

  // Romantic scale notes (frequencies in Hz)
  // A major 9, D major 9, F# minor 11, E9
  private chords = [
    [110, 165, 220, 277, 330, 440], // A Major add 9 (A, E, A, C#, E, A)
    [146.83, 220, 293.66, 369.99, 440, 554.37], // D Major 7/9 (D, A, D, F#, A, C#)
    [92.5, 138.59, 185, 220, 277.18, 329.63], // F# minor 11 (F#, C#, F#, A, C#, E)
    [82.41, 123.47, 164.81, 196, 246.94, 329.63] // E minor 7 (E, B, E, G, B, E)
  ];
  private currentChordIndex = 0;

  constructor() {
    // Audio engine starts dormant.
  }

  public init() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Create low-pass filter with low resonance for warm analog sound
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(320, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.0, this.ctx.currentTime);

      // Create delay node for ethereal echo
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.setValueAtTime(0.4, this.ctx.currentTime);
      
      this.delayGain = this.ctx.createGain();
      this.delayGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

      // Connect delay loop
      this.delayNode.connect(this.delayGain);
      this.delayGain.connect(this.delayNode);

      // Pad Gain
      this.padGain = this.ctx.createGain();
      this.padGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

      // Routing
      // Pad -> Filter -> Master
      // Pad -> Filter -> Delay -> Master
      this.padGain.connect(this.filterNode);
      this.filterNode.connect(this.masterGain);
      
      this.filterNode.connect(this.delayNode);
      this.delayGain.connect(this.masterGain);

      this.isInitialized = true;
      this.isMuted = false;

      // Start evolutionary soundscape
      this.startAmbientPad();
      this.startChordRotation();

      // Smooth fade in
      this.masterGain.gain.linearRampToValueAtTime(0.7, this.ctx.currentTime + 2.5);
    } catch (e) {
      console.error("Web Audio API not supported or blocked", e);
    }
  }

  public toggleMute(): boolean {
    if (!this.isInitialized) {
      this.init();
      return false; // Active now
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.isMuted) {
      this.isMuted = false;
      this.masterGain?.gain.linearRampToValueAtTime(0.7, this.ctx!.currentTime + 1.0);
    } else {
      this.isMuted = true;
      this.masterGain?.gain.linearRampToValueAtTime(0.0, this.ctx!.currentTime + 0.5);
    }
    return this.isMuted;
  }

  public getMuteStatus(): boolean {
    return this.isMuted;
  }

  private startAmbientPad() {
    if (!this.ctx || !this.padGain) return;

    // Clear old oscillators
    this.padOscs.forEach(o => {
      try { o.stop(); } catch(e) {}
    });
    this.padOscs = [];

    const now = this.ctx.currentTime;
    const activeChord = this.chords[this.currentChordIndex];

    // Create 4-5 detuned triangle/sine oscillators for rich, lush pad sounds
    activeChord.forEach((freq, idx) => {
      if (!this.ctx || !this.padGain) return;

      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      // Alternate waveforms for complexity
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      
      // Slight detuning for chorus/warmth effect
      const detuneAmount = (Math.random() - 0.5) * 8; 
      osc.detune.setValueAtTime(detuneAmount, now);

      // Gentle gain per note
      const baseGain = 0.03 + (1 / (idx + 4)) * 0.04;
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(baseGain, now + 2.0);

      osc.connect(oscGain);
      oscGain.connect(this.padGain);
      osc.start(now);

      this.padOscs.push(osc);
    });

    // Animate the filter cutoff to represent breathing
    this.animateFilter();
  }

  private animateFilter() {
    if (!this.ctx || !this.filterNode) return;
    const now = this.ctx.currentTime;
    // Slow evolving sweep from 250Hz to 600Hz
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.frequency.setValueAtTime(this.filterNode.frequency.value, now);
    this.filterNode.frequency.exponentialRampToValueAtTime(260 + Math.random() * 300, now + 4.0);
  }

  private startChordRotation() {
    this.chordInterval = window.setInterval(() => {
      if (this.isMuted || !this.ctx) return;
      this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;
      this.startAmbientPad();
    }, 8000); // Rotate chords every 8s
  }

  /**
   * Heartbeat sound effect (realistic lub-dub double beat)
   */
  public playHeartbeat() {
    if (this.isMuted || !this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // First beat - "Lub" (lower frequency, deeper, slightly longer)
    this.triggerSubPulse(55, 0.45, 0.04, 0.28, now);

    // Second beat - "Dub" (slightly higher frequency, slightly snappier)
    this.triggerSubPulse(59, 0.35, 0.04, 0.22, now + 0.22);
  }

  private triggerSubPulse(freq: number, volume: number, attack: number, decay: number, startTime: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    // Pitch sweep downwards slightly to simulate a deep physical kick drum
    osc.frequency.exponentialRampToValueAtTime(30, startTime + decay);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(80, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + decay);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + decay + 0.1);
  }

  /**
   * Delicate glass-like chime when sparkles/pulses emerge
   */
  public playSparkleChime(scaleDegree: number = 0) {
    if (this.isMuted || !this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    
    // Pentatonic romantic notes in higher octave (A5, B5, C#6, E6, F#6)
    const notes = [880, 987.77, 1108.73, 1318.51, 1479.98, 1760, 1975.53, 2217.46];
    const freq = notes[Math.min(Math.max(0, scaleDegree), notes.length - 1)] || 880;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.5, now); // Sweet perfect fifth overtone

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.04, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    
    // Connect to master via delay node for echoing charm
    if (this.delayNode) {
      gainNode.connect(this.delayNode);
    } else {
      gainNode.connect(this.masterGain);
    }
    gainNode.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.3);
    osc2.stop(now + 1.3);
  }

  /**
   * A beautiful sweeping filter rise for transition sweeps
   */
  public playSwell() {
    if (this.isMuted || !this.ctx || !this.filterNode) return;

    const now = this.ctx.currentTime;
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.frequency.setValueAtTime(250, now);
    this.filterNode.frequency.exponentialRampToValueAtTime(1200, now + 1.5);
    this.filterNode.frequency.exponentialRampToValueAtTime(320, now + 3.0);
  }

  public destroy() {
    if (this.chordInterval) {
      clearInterval(this.chordInterval);
    }
    this.padOscs.forEach(o => {
      try { o.stop(); } catch(e) {}
    });
    if (this.ctx) {
      this.ctx.close();
    }
  }
}
