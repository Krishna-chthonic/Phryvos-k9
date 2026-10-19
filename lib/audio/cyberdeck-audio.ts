/**
 * Procedural Web Audio API Soundscape (Tactile Cyber-Deck Engine).
 * Synthesizes 100% in-memory audio via Web Audio OscillatorNodes and GainNodes.
 * Zero external MP3/WAV file downloads, zero bandwidth cost, zero latency.
 *
 * Importers/callers: components/shell/AppShell.tsx, components/shell/CommandPalette.tsx,
 *                    components/chat/ChatApp.tsx, components/files/FilesApp.tsx
 * Affected API: Browser Web Audio API (AudioContext, OscillatorNode, GainNode)
 * Data schemas if any: LocalStorage key "phryvos_audio_enabled" (boolean string)
 * User instruction verbatim: "Procedural Web Audio API 'Tactile Cyber-Deck' Engine: Koi bhi .mp3 file bina add kiye, browser ke native Web Audio API OscillatorNodes se poora sci-fi soundscape synthesize karo"
 */

class CyberdeckAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("phryvos_audio_enabled");
        this.enabled = stored !== null ? stored === "true" : true;
      } catch {
        this.enabled = true;
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("phryvos_audio_enabled", String(val));
      } catch {}
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    if (this.enabled) {
      this.playNotification();
    }
    return this.enabled;
  }

  /**
   * Sub-bass power-up hum on vault unlock (45Hz -> 110Hz resonant swell).
   */
  public playVaultUnlock(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(45, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);

      sub.type = "sine";
      sub.frequency.setValueAtTime(30, now);
      sub.frequency.exponentialRampToValueAtTime(65, now + 0.4);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      sub.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      sub.start(now);
      osc.stop(now + 0.5);
      sub.stop(now + 0.5);
    } catch {}
  }

  /**
   * Frequency sweep downwards on vault lock.
   */
  public playVaultLock(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.28);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.32);
    } catch {}
  }

  /**
   * Subtle micro-click (~1750Hz, 15ms decay) for AI token streaming.
   * Throttled to prevent audio buffer saturation.
   */
  private lastTickTime = 0;
  public playTokenTick(): void {
    if (!this.enabled) return;
    const nowMs = performance.now();
    if (nowMs - this.lastTickTime < 45) return;
    this.lastTickTime = nowMs;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1750, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 0.015);

      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);
    } catch {}
  }

  /**
   * Soothing harmonic binaural chord on task or milestone completion
   * (C5 523.25Hz + E5 659.25Hz + G5 783.99Hz fading over 600ms).
   */
  public playTaskComplete(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const frequencies = [523.25, 659.25, 783.99];

      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.03);

        const startTime = now + idx * 0.03;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.6);
      });
    } catch {}
  }

  /**
   * Tactile keyboard click simulation (5ms transient).
   */
  public playKeyClick(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.01);

      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.015);
    } catch {}
  }

  /**
   * Gentle double-chime notification.
   */
  public playNotification(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [587.33, 880.0].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + i * 0.09;

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.09, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.28);
      });
    } catch {}
  }
}

export const cyberAudio = new CyberdeckAudioEngine();
