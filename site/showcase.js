const root = document.querySelector("#showcase-background");
const video = document.querySelector("#showcase-video");
const toggle = document.querySelector("#showcase-toggle");
const manifestUrl = new URL("./showcase/manifest.json", import.meta.url);
const cacheName = "small-loop-devlog:showcase:v1";
const preferenceKey = "small-loop-devlog:showcase-paused:v1";
const descriptorKey = "small-loop-devlog:showcase-descriptor:v1";
const maximumBytes = 8 * 1024 * 1024;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const portrait = matchMedia("(max-aspect-ratio: 6/5)");
const connection = navigator.connection;
let userPaused = false;
let explicitPlay = false;
let failed = false;
let revision = 0;
let controller = null;
let pending = false;
let objectUrl = null;
let manifest = null;

try { userPaused = localStorage.getItem(preferenceKey) === "true"; } catch { /* Storage is optional. */ }

function wantsMotion() {
  const restricted = reducedMotion.matches || connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType);
  return !userPaused && (explicitPlay || !restricted) && !failed;
}

function updateControl() {
  const active = wantsMotion();
  toggle.hidden = false;
  toggle.title = active ? "Pause background" : "Play background";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.setAttribute("aria-pressed", String(active));
  toggle.querySelector(".showcase-pause").hidden = !active;
  toggle.querySelector(".showcase-play").hidden = active;
}

function stopPending() {
  revision++;
  controller?.abort();
  controller = null;
  pending = false;
}

function release() {
  stopPending();
  video.pause();
  video.removeAttribute("src");
  video.load();
  root.classList.remove("is-ready");
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function encodingFor(data, name) {
  const variant = data?.variants?.[name];
  const encoding = variant?.encodings?.[0];
  if (data?.schemaVersion !== 1 || data.preview !== false || !variant || !Array.isArray(variant.encodings) || variant.encodings.length !== 1 ||
      encoding?.codec !== "h264" || encoding.path !== `${name}.mp4` ||
      !Number.isSafeInteger(encoding.bytes) || encoding.bytes <= 0 || encoding.bytes > maximumBytes ||
      !/^[0-9a-f]{64}$/.test(encoding.sha256 || "")) {
    throw new Error("Invalid showcase manifest");
  }
  const url = new URL(encoding.path, manifestUrl);
  url.searchParams.set("v", encoding.sha256);
  return { ...encoding, url: url.href };
}

async function readBounded(response, encoding, signal) {
  if (!response.ok) throw new Error("Showcase unavailable");
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Canceled", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > encoding.bytes || size > maximumBytes) throw new Error("Showcase exceeds its limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (size !== encoding.bytes) throw new Error("Incomplete showcase");
  const blob = new Blob(chunks, { type: "video/mp4" });
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const actual = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
  if (actual !== encoding.sha256) throw new Error("Showcase identity mismatch");
  return blob;
}

async function load(signal) {
  if (!manifest) {
    try {
      const response = await fetch(manifestUrl, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Showcase manifest unavailable");
      const data = await response.json();
      encodingFor(data, "landscape");
      encodingFor(data, "portrait");
      manifest = data;
      const descriptor = { schemaVersion: 1, preview: false, variants: Object.fromEntries(
        ["landscape", "portrait"].map((name) => [name, { encodings: data.variants[name].encodings }]),
      ) };
      try { localStorage.setItem(descriptorKey, JSON.stringify(descriptor)); } catch { /* Optional offline metadata. */ }
    } catch (error) {
      if (error.name === "AbortError") throw error;
      const stored = localStorage.getItem(descriptorKey);
      if (!stored || stored.length > 4096) throw error;
      const data = JSON.parse(stored);
      encodingFor(data, "landscape");
      encodingFor(data, "portrait");
      manifest = data;
    }
  }
  const encoding = encodingFor(manifest, portrait.matches ? "portrait" : "landscape");
  let cache = null;
  try { cache = await caches.open(cacheName); } catch { /* Use a bounded in-memory copy if persistent caching is unavailable. */ }
  let cached = null;
  try { cached = await cache?.match(encoding.url); } catch { cache = null; }
  let blob;
  try {
    blob = await readBounded(cached || await fetch(encoding.url, { signal, cache: "force-cache" }), encoding, signal);
  } catch (error) {
    if (cached) await cache.delete(encoding.url).catch(() => {});
    throw error;
  }
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  if (cache) {
    try {
      const current = new Set([encodingFor(manifest, "landscape").url, encodingFor(manifest, "portrait").url]);
      await Promise.all((await cache.keys()).filter((key) => !current.has(key.url)).map((key) => cache.delete(key)));
      if (!cached) await cache.put(encoding.url, new Response(blob, { headers: { "Content-Type": "video/mp4" } }));
    } catch { /* Playback remains available when cache storage is full. */ }
  }
  return blob;
}

async function refresh() {
  updateControl();
  if (document.hidden) {
    video.pause();
    if (pending) stopPending();
    return;
  }
  if (!wantsMotion()) { release(); return; }
  if (pending) return;
  if (objectUrl) {
    try { await video.play(); } catch (error) {
      if (error.name !== "AbortError" && wantsMotion() && !document.hidden) { failed = true; release(); updateControl(); }
    }
    return;
  }
  pending = true;
  const current = ++revision;
  controller = new AbortController();
  try {
    const blob = await load(controller.signal);
    if (current !== revision || !wantsMotion() || document.hidden) return;
    objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;
    video.muted = true;
    await video.play();
  } catch (error) {
    if (current === revision && error.name !== "AbortError") {
      failed = true;
      release();
      updateControl();
    }
  } finally {
    if (current === revision) { pending = false; controller = null; }
  }
}

video.addEventListener("playing", () => root.classList.add("is-ready"));
video.addEventListener("error", () => { failed = true; release(); updateControl(); });
toggle.addEventListener("click", () => {
  const stop = wantsMotion();
  userPaused = stop;
  explicitPlay = !stop;
  failed = false;
  try { localStorage.setItem(preferenceKey, String(userPaused)); } catch { /* Optional preference. */ }
  refresh();
});
document.addEventListener("visibilitychange", refresh);
window.addEventListener("pagehide", release);
window.addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });
portrait.addEventListener("change", () => { release(); refresh(); });
reducedMotion.addEventListener("change", () => { explicitPlay = false; refresh(); });
connection?.addEventListener("change", refresh);

// The poster paints immediately; optional background preparation waits for the page.
function schedule() {
  updateControl();
  if ("requestIdleCallback" in window) requestIdleCallback(refresh, { timeout: 1500 });
  else setTimeout(refresh, 0);
}
if (document.readyState === "complete") schedule();
else window.addEventListener("load", schedule, { once: true });
