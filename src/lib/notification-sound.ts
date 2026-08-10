let sharedAudioContext: AudioContext | null = null;

export function playNotificationSound() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }

    const context = sharedAudioContext;

    if (context.state === "suspended") {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12);

    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.36);
  } catch {
    // ignore audio failures in unsupported browsers
  }
}
