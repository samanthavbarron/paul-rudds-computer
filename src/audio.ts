// An original, intentionally inexpensive-sounding computer groove. No sampled media.
export class ComputerAudio {
  private context?: AudioContext;
  private timer?: ReturnType<typeof setInterval>;
  private step = 0;
  private enabled = false;
  private speed = 1;
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.context ??= new AudioContext();
      void this.context.resume();
      this.start();
    } else {
      clearInterval(this.timer);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  }
  setSpeed(speed: number) { this.speed = speed; if (this.enabled) this.start(); }
  private start() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 150 / this.speed);
  }
  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, slide?: number) {
    const c = this.context;
    if (!c || !this.enabled) return;
    const oscillator = c.createOscillator();
    const gain = c.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, c.currentTime);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(slide, c.currentTime + duration);
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    oscillator.connect(gain).connect(c.destination);
    oscillator.start(); oscillator.stop(c.currentTime + duration);
  }
  private tick() {
    const s = this.step++ % 16;
    if (s % 4 === 0) this.tone(110, 0.15, 'sine', 0.10, 35);
    if (s % 4 === 2) this.tone(150, 0.06, 'triangle', 0.035, 800);
    if (s % 2 === 0) this.tone(3200, 0.018, 'square', 0.007);
    const bass = [82.41, 82.41, 98, 73.42];
    if ([0, 3, 6, 8, 11, 14].includes(s)) this.tone(bass[Math.floor(s / 4)], 0.12, 'sawtooth', 0.018);
    if ([2, 7, 10, 15].includes(s)) this.tone([329.63, 392, 293.66, 440][Math.floor(s / 4)], 0.12, 'triangle', 0.025);
  }
  speak(text: string) {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.88; utterance.pitch = 0.6; utterance.volume = 0.75;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(v => /en-US/i.test(v.lang)) ?? null;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  dispose() { clearInterval(this.timer); void this.context?.close(); }
}
