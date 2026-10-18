import { createAudioFader } from "../site/audio-fader.js";

function assert(value, message) { if (!value) throw new Error(message); }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function fixture(options = {}) {
  const events = [];
  const audio = { volume: .37, paused: false, pauses: 0,
    pause() { this.paused = true; this.pauses++; } };
  const param = { value: 0,
    cancelScheduledValues(time) { events.push(["cancel", time]); },
    setValueAtTime(value, time) { this.value = value; events.push(["hold", value, time]); },
    linearRampToValueAtTime(value, time) { events.push(["ramp", value, time]); } };
  const context = { currentTime: 10, state: "suspended", destination: {}, sources: 0, resumes: 0,
    createGain() { return { gain: param, connect() {} }; },
    createMediaElementSource() { this.sources++; return { connect() {} }; },
    resume() { this.resumes++; this.state = "running"; return Promise.resolve(); },
    suspend() { this.state = "suspended"; return Promise.resolve(); } };
  let constructions = 0;
  const fader = createAudioFader(audio, { contextFactory: () => { constructions++; return context; }, ...options });
  return { audio, param, context, events, fader, constructions: () => constructions };
}

Deno.test("fader creates one lazy graph and schedules gain without changing user volume", async () => {
  const f = fixture();
  assert(f.constructions() === 0, "Initial load created an audio context");
  await f.fader.prepare();
  await f.fader.prepare();
  f.fader.rise();
  assert(f.context.sources === 1 && f.constructions() === 1, "Audio element was bound twice");
  assert(f.events.some((e) => e[0] === "ramp" && e[1] === 1 && e[2] === 10.7), "Missing fade-in envelope");
  assert(f.audio.volume === .37, "Envelope overwrote the user's volume");
  f.fader.stop();
});

Deno.test("fade-out delays native pause, settles at zero and suspends the graph", async () => {
  const f = fixture({ fadeOutMs: 20 });
  await f.fader.prepare();
  f.param.value = 1;
  f.fader.pause();
  f.fader.pause();
  assert(!f.audio.paused && f.audio.pauses === 0, "Audio paused before fading");
  await delay(70);
  assert(f.audio.paused && f.audio.pauses === 1, "Fade did not complete exactly once");
  assert(f.param.value === 0 && f.context.state === "suspended", "Paused graph stayed active");
  assert(f.audio.volume === .37, "Pause saved the envelope as user volume");
});

Deno.test("reversing a fade holds the current gain and cancels the obsolete pause", async () => {
  const f = fixture({ fadeOutMs: 25 });
  await f.fader.prepare();
  f.param.value = .6;
  f.fader.pause();
  f.context.currentTime = 10.01;
  f.param.value = .36;
  await f.fader.prepare();
  f.fader.rise();
  assert(f.events.some((e) => e[0] === "hold" && e[1] === .36 && e[2] === 10.01), "Fade reversal jumped in gain");
  await delay(45);
  assert(!f.audio.paused, "Old pause stopped resumed playback");
  f.fader.stop();
});

Deno.test("stop cancels pending fades and unsupported contexts retain working pause", async () => {
  const f = fixture({ fadeOutMs: 20 });
  await f.fader.prepare();
  f.fader.pause();
  f.fader.stop();
  await delay(55);
  assert(f.audio.pauses === 1, "Stopped timer fired again");
  const fallback = createAudioFader(f.audio, { contextFactory: () => null });
  await fallback.prepare();
  f.audio.paused = false;
  fallback.pause();
  assert(f.audio.paused && f.audio.volume === .37, "Fallback playback control failed");
});

Deno.test("a delayed context resume cannot reactivate a stopped graph", async () => {
  const f = fixture();
  let completeResume;
  f.context.resume = () => new Promise((resolve) => {
    completeResume = () => { f.context.state = "running"; resolve(); };
  });
  const ready = f.fader.prepare();
  f.fader.stop();
  completeResume();
  await ready;
  assert(f.context.state === "suspended" && f.param.value === 0, "Stopped graph resumed late");
});
