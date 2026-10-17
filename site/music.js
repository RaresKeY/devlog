const catalogUrl = new URL("./music/index.json", import.meta.url);
const preferencesKey = "small-loop-devlog:music:v1";
const player = document.querySelector("#music-player");
const audio = document.querySelector("#music-audio");
const toggle = document.querySelector("#music-toggle");
const expand = document.querySelector("#music-expand");
const panel = document.querySelector("#music-panel");
const title = document.querySelector("#music-title");
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
  try {
    localStorage.setItem(preferencesKey, JSON.stringify({ volume: audio.volume, track: tracks[selected]?.id }));
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
    ids.add(track.id);
    paths.add(track.path);
  }
  return catalog.tracks;
}

function setExpanded(open) {
  panel.hidden = !open;
  expand.setAttribute("aria-expanded", String(open));
  expand.title = open ? "Collapse music player" : "Open music player";
}

function updatePlayback() {
  const playing = !audio.paused && !audio.ended;
  toggle.querySelector(".play-symbol").hidden = playing;
  toggle.querySelector(".pause-symbol").hidden = !playing;
  toggle.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${tracks[selected]?.title || "music"}`);
  toggle.title = playing ? "Pause music" : "Play music";
  player.classList.toggle("is-playing", playing);
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

function updateProgress() {
  const length = Number.isFinite(audio.duration) ? audio.duration : tracks[selected]?.duration || 0;
  elapsed.textContent = formatTime(audio.currentTime);
  duration.textContent = formatTime(length);
  seek.max = String(length);
  seek.value = String(Math.min(audio.currentTime, length));
  seek.disabled = !Number.isFinite(audio.duration) || audio.readyState < 1;
  seek.setAttribute("aria-valuetext", `${formatTime(audio.currentTime)} of ${formatTime(length)}`);
}

function selectTrack(index) {
  selected = (index + tracks.length) % tracks.length;
  selectionRevision++;
  const track = tracks[selected];
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  title.textContent = track.title;
  subtitle.textContent = `${track.project} · ${track.album}`;
  message.textContent = "";
  list.querySelectorAll("button").forEach((button, i) => {
    if (i === selected) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  updateProgress();
  updatePlayback();
  savePreferences();
  if ("mediaSession" in navigator && typeof MediaMetadata === "function") {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.project, album: track.album });
  }
}

async function play() {
  const revision = selectionRevision;
  message.textContent = "";
  if (!audio.getAttribute("src")) audio.src = new URL(tracks[selected].path, catalogUrl).href;
  else if (audio.error) audio.load();
  try {
    await audio.play();
  } catch (error) {
    if (revision === selectionRevision && error.name !== "AbortError") {
      message.textContent = "Couldn't play this track. Try again or choose another.";
      setExpanded(true);
    }
  }
}

function moveTrack(offset, keepPlaying = !audio.paused) {
  if (!tracks.length) return;
  selectTrack(selected + offset);
  if (keepPlaying) play();
}

function previousTrack() {
  if (audio.currentTime > 3) audio.currentTime = 0;
  else moveTrack(-1);
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
toggle.addEventListener("click", () => { if (audio.paused) play(); else audio.pause(); });
next.addEventListener("click", () => moveTrack(1));
previous.addEventListener("click", previousTrack);
seek.addEventListener("input", () => {
  if (!seek.disabled) { audio.currentTime = Number(seek.value); updateProgress(); }
});
volume.addEventListener("input", () => { audio.volume = Number(volume.value); savePreferences(); });
audio.addEventListener("loadedmetadata", updateProgress);
audio.addEventListener("durationchange", updateProgress);
audio.addEventListener("timeupdate", updateProgress);
audio.addEventListener("play", () => {
  document.querySelectorAll("video:not([data-background-media]), audio").forEach((media) => { if (media !== audio) media.pause(); });
  updatePlayback();
});
audio.addEventListener("pause", () => {
  if (message.textContent === "Loading track…") message.textContent = "";
  updatePlayback();
});
audio.addEventListener("ended", () => moveTrack(1, true));
audio.addEventListener("waiting", () => { if (!audio.paused) message.textContent = "Loading track…"; });
audio.addEventListener("canplay", () => { if (message.textContent === "Loading track…") message.textContent = ""; });
audio.addEventListener("playing", () => { message.textContent = ""; });
audio.addEventListener("error", () => {
  message.textContent = "Couldn't load this track. Try again or choose another.";
  setExpanded(true);
  updatePlayback();
});
document.addEventListener("play", (event) => { if (event.target !== audio && !event.target.hasAttribute("data-background-media")) audio.pause(); }, true);

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
    selectTrack(Math.max(0, tracks.findIndex((track) => track.id === preferences.track)));
    player.hidden = false;
    if ("mediaSession" in navigator) {
      const handlers = {
        play, pause: () => audio.pause(), previoustrack: previousTrack, nexttrack: () => moveTrack(1),
        seekto: ({ seekTime }) => { if (Number.isFinite(audio.duration) && Number.isFinite(seekTime)) audio.currentTime = Math.max(0, Math.min(seekTime, audio.duration)); },
      };
      for (const [action, handler] of Object.entries(handlers)) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Some browsers support fewer media actions. */ }
      }
    }
  } catch {
    player.hidden = false;
    title.textContent = "Music";
    subtitle.textContent = "Unavailable right now";
    message.textContent = "Couldn't load the music library. Reload to try again.";
    toggle.disabled = next.disabled = previous.disabled = true;
  }
}

initialize();
