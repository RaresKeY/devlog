export function resumePosition(value, duration) {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (Number.isFinite(duration) && duration > 0 && value >= duration) return 0;
  return value;
}

export function mediaHasAudio(media) {
  if (media.tagName !== "VIDEO") return true;
  if (media.dataset.hasAudio === "false") return false;
  if (media.dataset.hasAudio === "true") return true;
  if (media.readyState >= 1 && media.audioTracks) return media.audioTracks.length > 0;
  // Older posts and browsers without track inspection retain the audio handoff.
  return true;
}
