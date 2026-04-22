export function playTimerEndSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const playTone = (freq: number, startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
      osc.start(startTime);
      osc.stop(startTime + 0.65);
    };
    const t = ctx.currentTime;
    playTone(880, t);
    playTone(1100, t + 0.3);
    playTone(1320, t + 0.6);
  } catch {
    // Audio unavailable — fail silently
  }
}
