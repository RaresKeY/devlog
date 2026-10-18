import { mediaHasAudio, resumePosition } from "../site/media-state.js";

function assert(value) { if (!value) throw new Error("Unexpected media state"); }

Deno.test("resume accepts a valid offset and rejects corrupt or completed positions", () => {
  assert(resumePosition(23.5, 60) === 23.5);
  for (const value of [undefined, null, "23", true, {}, -1, NaN, Infinity, 60, 999]) {
    assert(resumePosition(value, 60) === 0);
  }
  assert(resumePosition(0, 60) === 0);
  assert(resumePosition(23, NaN) === 23);
});

Deno.test("declared stream metadata keeps silent videos independent across browsers", () => {
  const video = { tagName: "VIDEO", dataset: { hasAudio: "false" }, readyState: 0 };
  assert(!mediaHasAudio(video));
  assert(!mediaHasAudio({ ...video, readyState: 4 }));
  assert(mediaHasAudio({ ...video, dataset: { hasAudio: "true" } }));
  assert(mediaHasAudio({ ...video, dataset: { hasAudio: "true" }, muted: true, volume: 0 }));
});

Deno.test("legacy videos use native track metadata when available after loading", () => {
  const video = { tagName: "VIDEO", dataset: {}, readyState: 1, audioTracks: { length: 0 } };
  assert(!mediaHasAudio(video));
  assert(mediaHasAudio({ ...video, audioTracks: { length: 1 } }));
  assert(mediaHasAudio({ ...video, readyState: 0 }));
  assert(mediaHasAudio({ ...video, audioTracks: undefined }));
});

Deno.test("foreground audio elements retain the exclusive audio handoff", () => {
  assert(mediaHasAudio({ tagName: "AUDIO", dataset: { hasAudio: "false" } }));
});
