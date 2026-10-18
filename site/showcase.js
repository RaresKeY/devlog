import { fitPlane, validateManifest } from "./showcase-layout.js?v=20261018-2";

const root = document.querySelector("#showcase-background");
const toggle = document.querySelector("#showcase-toggle");
const manifestUrl = new URL("./showcase/manifest.json?v=20261018-2", import.meta.url);
const cacheName = "small-loop-devlog:showcase:v2";
const preferenceKey = "small-loop-devlog:showcase-paused:v1";
const descriptorKey = "small-loop-devlog:showcase-descriptor:v2";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const portrait = matchMedia("(max-aspect-ratio: 6/5)");
const connection = navigator.connection;
let userPaused = false;
let explicitPlay = false;
let failed = false;
let manifest = null;
let cache = null;
let controller = null;
let revision = 0;
let scene = null;
let prepared = false;
let layoutKey = "";
const ready = new Map();

try { userPaused = localStorage.getItem(preferenceKey) === "true"; } catch { /* Optional preference. */ }

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
  toggle.querySelector(".showcase-pause").toggleAttribute("hidden", !active);
  toggle.querySelector(".showcase-play").toggleAttribute("hidden", active);
}

function abort() {
  revision++;
  controller?.abort();
  controller = null;
  prepared = false;
}

function assetUrl(asset) {
  const url = new URL(asset.path, manifestUrl);
  url.searchParams.set("v", asset.sha256);
  return url.href;
}

async function readBounded(response, asset, signal) {
  if (!response.ok) throw new Error("Showcase unavailable");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Canceled", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > asset.bytes || size > 512 * 1024) throw new Error("Showcase asset exceeds its limit");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (size !== asset.bytes) throw new Error("Incomplete showcase asset");
  const blob = new Blob(chunks, { type: asset.path.endsWith(".webp") ? "image/webp" : "video/mp4" });
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  if (hash !== asset.sha256) throw new Error("Showcase identity mismatch");
  return blob;
}

async function loadAsset(asset, signal) {
  if (ready.has(asset.path)) return ready.get(asset.path);
  const url = assetUrl(asset);
  let stored;
  try { stored = await cache?.match(url); } catch { cache = null; }
  let blob;
  try { blob = await readBounded(stored || await fetch(url, { signal, cache: "force-cache" }), asset, signal); }
  catch (error) {
    if (stored && error.name !== "AbortError") await cache?.delete(url).catch(() => {});
    throw error;
  }
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  if (!stored && cache) {
    try { await cache.put(url, new Response(blob, { headers: { "Content-Type": blob.type } })); } catch { /* Bounded memory fallback. */ }
  }
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  const value = { url: URL.createObjectURL(blob) };
  ready.set(asset.path, value);
  return value;
}

async function loadManifest(signal) {
  if (!manifest) {
    try {
      const response = await fetch(manifestUrl, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Showcase manifest unavailable");
      manifest = validateManifest(await response.json());
      try { localStorage.setItem(descriptorKey, JSON.stringify(manifest)); } catch { /* Optional offline descriptor. */ }
    } catch (error) {
      if (error.name === "AbortError") throw error;
      const stored = localStorage.getItem(descriptorKey);
      if (!stored || stored.length > 32768) throw error;
      manifest = validateManifest(JSON.parse(stored));
    }
  }
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  try {
    cache = await caches.open(cacheName);
    const current = new Set(Object.values(manifest.variants).flatMap((variant) => [variant.atlas, ...variant.clips]).map(assetUrl));
    await Promise.all((await cache.keys()).filter((key) => !current.has(key.url)).map((key) => cache.delete(key)));
    await caches.delete("small-loop-devlog:showcase:v1");
  } catch { cache = null; }
}

// One image per repeated board; only visible clips acquire a video decoder.
export function createScene(container, variant, atlasUrl, clipUrl, activeLimit) {
  const geometry = fitPlane(container.clientWidth, container.clientHeight, variant);
  const plane = document.createElement("div");
  plane.className = "showcase-plane";
  plane.style.width = `${geometry.width}px`;
  plane.style.height = `${geometry.height}px`;
  const rail = document.createElement("div");
  rail.className = "showcase-rail";
  plane.append(rail);
  const slots = [];
  const pool = [];
  const images = [];
  const visible = new Map();
  let running = false;
  let disposed = false;
  for (let copy = 0; copy < geometry.copies; copy++) {
    const board = document.createElement("div");
    board.className = "showcase-board";
    board.style.height = `${geometry.boardHeight}px`;
    const image = document.createElement("img");
    image.src = atlasUrl;
    image.alt = "";
    image.draggable = false;
    images.push(image);
    board.append(image);
    for (const tile of variant.layout.tiles) {
      const clip = variant.clips.find((item) => item.source === tile.source);
      if (!clip) continue;
      const slot = document.createElement("span");
      slot.className = "showcase-slot";
      Object.assign(slot.style, { left: `${tile.x / variant.layout.columns * 100}%`, top: `${tile.y / variant.layout.rows * 100}%`,
        width: `${tile.width / variant.layout.columns * 100}%`, height: `${tile.height / variant.layout.rows * 100}%` });
      slots.push({ node: slot, clip });
      board.append(slot);
    }
    rail.append(board);
  }
  container.append(plane);
  const animation = rail.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(0, -${geometry.boardHeight}px, 0)` }], {
    duration: geometry.duration, iterations: Infinity, easing: "linear",
  });
  animation.pause();

  function release(player) {
    player.assignment = null;
    player.node.pause();
    player.node.removeAttribute("src");
    player.node.load();
    player.node.remove();
  }
  function play(player) {
    const assignment = player.assignment;
    if (!assignment) return;
    player.node.play().catch((error) => {
      if (error.name !== "AbortError" && running && player.assignment === assignment) {
        visible.delete(assignment);
        release(player);
      }
    });
  }
  function reconcile() {
    if (disposed || !running) return;
    for (const player of pool) if (player.assignment && !visible.has(player.assignment)) release(player);
    const occupied = new Set(pool.map((player) => player.assignment));
    for (const slot of visible.keys()) {
      if (occupied.has(slot) || !clipUrl(slot.clip)) continue;
      let player = pool.find((item) => !item.assignment);
      if (!player && pool.length < activeLimit) {
        const node = document.createElement("video");
        node.muted = true;
        node.defaultMuted = true;
        node.loop = true;
        node.playsInline = true;
        node.preload = "none";
        node.disablePictureInPicture = true;
        node.disableRemotePlayback = true;
        node.setAttribute("data-background-media", "");
        player = { node, assignment: null };
        pool.push(player);
        const owner = player;
        node.addEventListener("loadedmetadata", () => {
          if (owner.assignment) node.currentTime = ((animation.currentTime || 0) / 1000) % owner.assignment.clip.duration;
        });
        node.addEventListener("playing", () => node.classList.add("is-playing"));
        node.addEventListener("error", () => { if (owner.assignment) { visible.delete(owner.assignment); release(owner); } });
      }
      if (!player) break;
      player.assignment = slot;
      player.node.classList.remove("is-playing");
      slot.node.append(player.node);
      player.node.src = clipUrl(slot.clip);
      play(player);
      occupied.add(slot);
    }
  }
  const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const slot = slots.find((item) => item.node === entry.target);
      if (entry.isIntersecting && entry.intersectionRatio > 0.01) visible.set(slot, true);
      else visible.delete(slot);
    }
    reconcile();
  }, { threshold: [0, 0.01] }) : null;
  slots.forEach((slot) => observer?.observe(slot.node));
  return {
    geometry, animation, reconcile,
    ready: Promise.all(images.map((image) => image.decode())),
    play() { running = true; animation.play(); pool.forEach(play); reconcile(); },
    pause(releaseMedia = false) {
      running = false;
      animation.pause();
      pool.forEach((player) => releaseMedia ? release(player) : player.node.pause());
    },
    destroy() { disposed = true; running = false; observer?.disconnect(); animation.cancel(); pool.forEach(release); plane.remove(); },
  };
}

function release() {
  abort();
  scene?.destroy();
  scene = null;
  layoutKey = "";
  root.classList.remove("is-ready");
  for (const value of ready.values()) URL.revokeObjectURL(value.url);
  ready.clear();
}

async function refresh() {
  updateControl();
  if (document.hidden) { abort(); scene?.pause(true); return; }
  const name = portrait.matches ? "portrait" : "landscape";
  const key = `${name}:${root.clientWidth}:${root.clientHeight}`;
  if (!wantsMotion() && (!scene || layoutKey === key)) { abort(); scene?.pause(); return; }
  if (scene && layoutKey === key && prepared) { scene.play(); return; }
  abort();
  const current = revision;
  const owner = new AbortController();
  controller = owner;
  try {
    await loadManifest(owner.signal);
    const variant = manifest.variants[name];
    const atlas = await loadAsset(variant.atlas, owner.signal);
    if (current !== revision || document.hidden) return;
    if (!scene || layoutKey !== key) {
      const phase = scene ? ((scene.animation.currentTime || 0) / scene.geometry.duration) % 1 : 0;
      scene?.destroy();
      for (const [path, value] of ready) if (path !== variant.atlas.path) { URL.revokeObjectURL(value.url); ready.delete(path); }
      scene = createScene(root, variant, atlas.url, (clip) => ready.get(clip.path)?.url, name === "portrait" ? 1 : 2);
      scene.animation.currentTime = phase * scene.geometry.duration;
      layoutKey = key;
    }
    await scene.ready;
    if (current !== revision || document.hidden) return;
    root.classList.add("is-ready");
    if (!wantsMotion()) { scene.pause(); return; }
    scene.play();
    // Precache only the selected, bounded set. Two transfers can be in flight.
    const queue = [...variant.clips];
    await Promise.all([0, 1].map(async () => {
      while (queue.length && !owner.signal.aborted) {
        const asset = queue.shift();
        await loadAsset(asset, owner.signal);
        if (current === revision) scene?.reconcile();
      }
    }));
    if (current === revision) prepared = true;
  } catch (error) {
    if (current === revision && error.name !== "AbortError") { failed = true; release(); updateControl(); }
  } finally { if (current === revision) controller = null; }
}

toggle.addEventListener("click", () => {
  userPaused = wantsMotion();
  explicitPlay = !userPaused;
  failed = false;
  try { localStorage.setItem(preferenceKey, String(userPaused)); } catch { /* Optional preference. */ }
  refresh();
});
document.addEventListener("visibilitychange", refresh);
window.addEventListener("pagehide", release);
window.addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });
portrait.addEventListener("change", refresh);
reducedMotion.addEventListener("change", () => { explicitPlay = false; refresh(); });
connection?.addEventListener("change", refresh);
if ("ResizeObserver" in window) {
  new ResizeObserver(() => { if (scene) refresh(); }).observe(root);
} else window.addEventListener("resize", refresh);

function schedule() {
  updateControl();
  if ("requestIdleCallback" in window) requestIdleCallback(refresh, { timeout: 1500 });
  else setTimeout(refresh, 0);
}
if (document.readyState === "complete") schedule();
else window.addEventListener("load", schedule, { once: true });
