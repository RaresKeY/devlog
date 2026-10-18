import { mediaHasAudio, resumePosition } from "./media-state.js?v=20261018-1";
import { createAudioFader } from "./audio-fader.js?v=20261018-1";

const catalogUrl = new URL("./music/index.json", import.meta.url);
const preferencesKey = "small-loop-devlog:music:v1";
const player = document.querySelector("#music-player");
const audio = document.querySelector("#music-audio");
const toggle = document.querySelector("#music-toggle");
const expand = document.querySelector("#music-expand");
const panel = document.querySelector("#music-panel");
const title = document.querySelector("#music-title");
const titleText = document.querySelector("#music-title-text");
const cover = document.querySelector("#music-cover");
const fallbackCover = new URL(cover.getAttribute("src"), document.baseURI).href;
const subtitle = document.querySelector("#music-subtitle");
const seek = document.querySelector("#music-seek");
const volume = document.querySelector("#music-volume");
const elapsed = document.querySelector("#music-elapsed");
const duration = document.querySelector("#music-duration");
const message = document.querySelector("#music-message");
const list = document.querySelector("#music-tracks");
const next = document.querySelector("#music-next");
const previous = document.querySelector("#music-previous");
let tracks = [];
let selected = 0;
let selectionRevision = 0;
let pendingPosition = 0;
let lastPreferenceSave = -Infinity;
let wantsPlayback = false;
let resumeOwner = null;
let pendingFadeIn = false;
let transportRevision = 0;
const fader = createAudioFader(audio);

function currentPosition() {
  return pendingPosition ?? audio.currentTime;
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(preferencesKey));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function savePreferences() {
  if (!tracks.length) return;
  lastPreferenceSave = performance.now();
  try {
    const position = resumePosition(currentPosition(), Number.isFinite(audio.duration) ? audio.duration : tracks[selected].duration);
    localStorage.setItem(preferencesKey, JSON.stringify({ volume: audio.volume, track: tracks[selected].id, position }));
  } catch {
    // Playback remains available when browser storage is disabled.
  }
}

function validateCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.tracks) || catalog.tracks.length > 500) {
    throw new Error("Invalid music catalog");
  }
  const ids = new Set();
  const paths = new Set();
  for (const track of catalog.tracks) {
    if (!track || typeof track.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(track.id) || ids.has(track.id) ||
        ![track.title, track.project, track.album].every((value) => typeof value === "string" && value.trim() && value.length <= 240) ||
        typeof track.path !== "string" || !/^[a-z0-9-]+\/[a-z0-9-]+\.opus$/.test(track.path) || paths.has(track.path) ||
        track.contentType !== "audio/ogg; codecs=opus" || !Number.isFinite(track.duration) || track.duration <= 0 ||
        typeof track.sourcePost !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(track.sourcePost)) {
      throw new Error("Invalid music track");
    }
    if ("artwork" in track && (typeof track.artwork !== "string" || !/^[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(track.artwork))) {
      throw new Error("Invalid music artwork");
    }
    ids.add(track.id);
    paths.add(track.path);
  }
  return catalog.tracks;
}

function setExpanded(open) {
  panel.hidden = !open;
  expand.setAttribute("aria-expanded", String(open));
  const action = `${open ? "Close" : "Open"} music library`;
  const track = tracks[selected];
  expand.setAttribute("aria-label", `${action}${track ? `, ${track.title} by ${track.project}` : ""}`);
  expand.title = track ? `${track.title} · ${track.album}\n${action}` : action;
}

function updateTitleOverflow() {
  const overflow = Math.max(0, titleText.scrollWidth - title.clientWidth);
  title.classList.toggle("is-overflowing", overflow > 2);
  title.style.setProperty("--title-travel", `${-overflow}px`);
  title.style.setProperty("--title-duration", `${Math.max(8, Math.min(24, overflow / 15 + 5))}s`);
}

if ("ResizeObserver" in window) {
  const titleObserver = new ResizeObserver(updateTitleOverflow);
  titleObserver.observe(title);
  titleObserver.observe(titleText);
}

cover.addEventListener("error", () => { if (cover.src !== fallbackCover) cover.src = fallbackCover; });

function updatePlayback() {
  const playing = wantsPlayback && !resumeOwner && !audio.ended && !audio.error;
  toggle.querySelector(".play-symbol").toggleAttribute("hidden", playing);
  toggle.querySelector(".pause-symbol").toggleAttribute("hidden", !playing);
  toggle.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${tracks[selected]?.title || "music"}`);
  toggle.title = playing ? "Pause music" : "Play music";
  player.classList.toggle("is-playing", playing);
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

function updateProgress() {
  const length = Number.isFinite(audio.duration) ? audio.duration : tracks[selected]?.duration || 0;
  const position = currentPosition();
  elapsed.textContent = formatTime(position);
  duration.textContent = formatTime(length);
  seek.max = String(length);
  seek.value = String(Math.min(position, length));
  seek.style.setProperty("--progress", `${length > 0 ? Math.min(100, position / length * 100) : 0}%`);
  seek.disabled = !Number.isFinite(audio.duration) || audio.readyState < 1;
  seek.setAttribute("aria-valuetext", `${formatTime(position)} of ${formatTime(length)}`);
}

function restorePosition() {
  if (pendingPosition !== null && audio.readyState >= 1) {
    try {
      audio.currentTime = resumePosition(pendingPosition, audio.duration);
      pendingPosition = null;
    } catch { /* Retry when the media becomes ready. */ }
  }
  updateProgress();
}

function seekTo(position) {
  const length = Number.isFinite(audio.duration) ? audio.duration : tracks[selected]?.duration || 0;
  const target = Number.isFinite(position) ? Math.max(0, Math.min(position, length)) : 0;
  if (audio.readyState >= 1) { pendingPosition = null; audio.currentTime = target; }
  else pendingPosition = target;
  updateProgress();
  savePreferences();
}

function selectTrack(index, position = 0) {
  wantsPlayback = false;
  resumeOwner = null;
  pendingFadeIn = false;
  transportRevision++;
  fader.stop();
  selected = (index + tracks.length) % tracks.length;
  selectionRevision++;
  const track = tracks[selected];
  pendingPosition = resumePosition(position, track.duration);
  audio.removeAttribute("src");
  audio.load();
  titleText.textContent = track.title;
  subtitle.textContent = track.project;
  setExpanded(!panel.hidden);
  const artwork = track.artwork ? new URL(track.artwork, catalogUrl).href : fallbackCover;
  if (cover.src !== artwork) cover.src = artwork;
  message.textContent = "";
  list.querySelectorAll("button").forEach((button, i) => {
    if (i === selected) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  updateProgress();
  updatePlayback();
  updateTitleOverflow();
  savePreferences();
  if ("mediaSession" in navigator && typeof MediaMetadata === "function") {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.project, album: track.album, artwork: [{ src: artwork }] });
  }
}

function pauseMusic(interrupter = null) {
  if (interrupter) {
    if (!wantsPlayback) return;
    resumeOwner = interrupter;
  } else {
    wantsPlayback = false;
    resumeOwner = null;
  }
  transportRevision++;
  pendingFadeIn = false;
  fader.pause();
  updatePlayback();
}

function fadeIn() {
  if (pendingFadeIn && wantsPlayback && !resumeOwner && !audio.paused) {
    pendingFadeIn = false;
    fader.rise();
  }
}

async function play({ automatic = false } = {}) {
  if (!tracks.length || (automatic && (!wantsPlayback || activeOtherMedia()))) return;
  const revision = selectionRevision;
  const request = ++transportRevision;
  wantsPlayback = true;
  resumeOwner = null;
  pendingFadeIn = true;
  message.textContent = "";
  // Apply the user's choice before queued media events can arrive out of order.
  if (!automatic) {
    document.querySelectorAll("video:not([data-background-media]), audio:not([data-background-media])").forEach((media) => {
      if (media !== audio && mediaHasAudio(media)) media.pause();
    });
  }
  if (!audio.getAttribute("src")) audio.src = new URL(tracks[selected].path, catalogUrl).href;
  else if (audio.error) { pendingPosition = currentPosition(); audio.load(); }
  try {
    const ready = fader.prepare();
    const playback = audio.play();
    updatePlayback();
    await Promise.all([ready, playback]);
    if (request === transportRevision && revision === selectionRevision) fadeIn();
  } catch (error) {
    if (request === transportRevision && revision === selectionRevision && error.name !== "AbortError") {
      pauseMusic();
      fader.stop();
      message.textContent = automatic ? "Press Play to resume music." : "Couldn't play this track. Try again or choose another.";
      if (!automatic) setExpanded(true);
    }
  }
}

function moveTrack(offset, keepPlaying = wantsPlayback && !resumeOwner) {
  if (!tracks.length) return;
  selectTrack(selected + offset);
  if (keepPlaying) play();
}

function previousTrack() {
  if (currentPosition() > 3) seekTo(0);
  else moveTrack(-1);
}

function activeOtherMedia() {
  return [...document.querySelectorAll("video:not([data-background-media]), audio:not([data-background-media])")]
    .find((media) => media !== audio && mediaHasAudio(media) && !media.paused && !media.ended && !media.error);
}

function buildPlaylist() {
  list.replaceChildren(...tracks.map((track, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Play ${track.title}, ${track.project}, ${track.album}`);
    const number = document.createElement("span");
    number.className = "music-track-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const details = document.createElement("span");
    details.className = "music-track-details";
    const name = document.createElement("span");
    name.textContent = track.title;
    const album = document.createElement("small");
    album.textContent = `${track.project} · ${track.album}`;
    details.append(name, album);
    const length = document.createElement("span");
    length.className = "music-track-duration";
    length.textContent = formatTime(track.duration);
    button.append(number, details, length);
    button.addEventListener("click", () => { selectTrack(index); play(); });
    item.append(button);
    return item;
  }));
}

expand.addEventListener("click", () => setExpanded(panel.hidden));
document.querySelector("#music-collapse").addEventListener("click", () => { setExpanded(false); expand.focus(); });
player.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !panel.hidden) {
    event.stopPropagation();
    setExpanded(false);
    expand.focus();
  }
});
toggle.addEventListener("click", () => {
  if (wantsPlayback && !resumeOwner && !audio.ended && !audio.error) pauseMusic();
  else play();
});
next.addEventListener("click", () => moveTrack(1));
previous.addEventListener("click", previousTrack);
seek.addEventListener("input", () => {
  if (!seek.disabled) seekTo(Number(seek.value));
});
volume.addEventListener("input", () => { audio.volume = Number(volume.value); savePreferences(); });
audio.addEventListener("loadedmetadata", restorePosition);
audio.addEventListener("durationchange", updateProgress);
audio.addEventListener("timeupdate", () => {
  updateProgress();
  if (!audio.paused && performance.now() - lastPreferenceSave >= 5000) savePreferences();
});
audio.addEventListener("seeked", savePreferences);
audio.addEventListener("play", () => {
  // A video may have started after the music request but before its play event.
  const other = activeOtherMedia();
  if (other) pauseMusic(other);
  else if (!wantsPlayback) fader.pause();
  updatePlayback();
});
audio.addEventListener("pause", () => {
  if (audio.paused) {
    if (!resumeOwner && !audio.ended) wantsPlayback = false;
    pendingFadeIn = false;
    fader.stop();
  }
  if (message.textContent === "Loading track…") message.textContent = "";
  savePreferences();
  updatePlayback();
});
audio.addEventListener("ended", () => {
  if (!audio.ended) return;
  if (!wantsPlayback || resumeOwner || activeOtherMedia()) updatePlayback();
  else moveTrack(1, true);
});
audio.addEventListener("waiting", () => { if (!audio.paused) message.textContent = "Loading track…"; });
audio.addEventListener("canplay", () => { restorePosition(); if (message.textContent === "Loading track…") message.textContent = ""; });
audio.addEventListener("playing", () => { message.textContent = ""; fadeIn(); });
audio.addEventListener("error", () => {
  wantsPlayback = false;
  resumeOwner = null;
  pendingFadeIn = false;
  transportRevision++;
  fader.stop();
  message.textContent = "Couldn't load this track. Try again or choose another.";
  setExpanded(true);
  updatePlayback();
});
function yieldToMedia(event) {
  const media = event.target;
  if (media instanceof HTMLMediaElement && media !== audio && mediaHasAudio(media) && !media.hasAttribute("data-background-media") &&
      !media.paused && !media.ended && !media.error) pauseMusic(media);
}
document.addEventListener("play", yieldToMedia, true);
document.addEventListener("playing", yieldToMedia, true);
document.addEventListener("loadedmetadata", yieldToMedia, true);
document.addEventListener("ended", (event) => {
  if (event.target !== resumeOwner || !wantsPlayback || !event.target.ended) return;
  const other = activeOtherMedia();
  if (other) { resumeOwner = other; return; }
  resumeOwner = null;
  if (audio.ended) moveTrack(1, true);
  else play({ automatic: true });
}, true);
document.addEventListener("visibilitychange", () => { if (document.hidden) savePreferences(); });
window.addEventListener("pagehide", () => {
  wantsPlayback = false;
  resumeOwner = null;
  pendingFadeIn = false;
  transportRevision++;
  fader.stop();
  savePreferences();
  updatePlayback();
});

async function initialize() {
  try {
    const response = await fetch(catalogUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Music catalog unavailable");
    tracks = validateCatalog(await response.json());
    if (!tracks.length) return;
    const preferences = readPreferences();
    audio.volume = typeof preferences.volume === "number" && preferences.volume >= 0 && preferences.volume <= 1 ? preferences.volume : 0.6;
    volume.value = String(audio.volume);
    buildPlaylist();
    const savedIndex = tracks.findIndex((track) => track.id === preferences.track);
    selectTrack(Math.max(0, savedIndex), savedIndex >= 0 ? preferences.position : 0);
    player.hidden = false;
    if ("mediaSession" in navigator) {
      const handlers = {
        play, pause: () => pauseMusic(), previoustrack: previousTrack, nexttrack: () => moveTrack(1),
        seekto: ({ seekTime }) => { if (Number.isFinite(audio.duration) && Number.isFinite(seekTime)) seekTo(seekTime); },
      };
      for (const [action, handler] of Object.entries(handlers)) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Some browsers support fewer media actions. */ }
      }
    }
  } catch {
    player.hidden = false;
    titleText.textContent = "Music";
    subtitle.textContent = "Unavailable right now";
    message.textContent = "Couldn't load the music library. Reload to try again.";
    toggle.disabled = next.disabled = previous.disabled = true;
  }
}

initialize();
