function createContext() {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Context ? new Context({ latencyHint: "playback" }) : null;
}

export function createAudioFader(audio, { contextFactory = createContext, fadeOutMs = 400, fadeInMs = 700 } = {}) {
  let context = null;
  let gain = null;
  let pauseTimer = null;
  let active = false;

  function cancelPause() {
    if (pauseTimer !== null) clearTimeout(pauseTimer);
    pauseTimer = null;
  }

  function ramp(target, milliseconds = 0) {
    if (!gain) return;
    const now = context.currentTime;
    const held = gain.gain.value;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(held, now);
    if (milliseconds && typeof gain.gain.linearRampToValueAtTime === "function") {
      gain.gain.linearRampToValueAtTime(target, now + milliseconds / 1000);
    } else {
      gain.gain.setValueAtTime(target, now);
      gain.gain.value = target;
    }
  }

  function stop() {
    active = false;
    cancelPause();
    ramp(0);
    audio.pause();
    if (context?.state === "running") context.suspend().catch(() => {});
  }

  return {
    prepare() {
      active = true;
      cancelPause();
      if (!context) {
        context = contextFactory();
        if (context) {
          gain = context.createGain();
          gain.gain.value = 0;
          context.createMediaElementSource(audio).connect(gain);
          gain.connect(context.destination);
        }
      }
      // Always request resume, including when a preceding suspend is still queued.
      return context ? context.resume().then(() => {
        if (!active && context.state === "running") return context.suspend();
      }) : Promise.resolve();
    },
    rise() {
      active = true;
      cancelPause();
      ramp(1, fadeInMs);
    },
    pause() {
      if (audio.paused || !gain) { stop(); return; }
      if (pauseTimer !== null) return;
      ramp(0, fadeOutMs);
      // Let the final zero-gain audio block render before suspending its clock.
      const renderGrace = Math.max(20, (context.baseLatency || 0) * 1000);
      pauseTimer = setTimeout(() => { pauseTimer = null; stop(); }, fadeOutMs + renderGrace);
    },
    stop,
  };
}
