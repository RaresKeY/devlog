import { fitPlane, validateManifest } from "../site/showcase-layout.js";

function assert(condition, label) { if (!condition) throw new Error(label); }
function rejects(change) {
  const data = fixture();
  change(data);
  let rejected = false;
  try { validateManifest(data); } catch { rejected = true; }
  assert(rejected, "Invalid manifest was accepted");
}
function fixture() {
  const asset = (path, width, height) => ({ path, width, height, bytes: 100, sha256: "0".repeat(64) });
  const variants = Object.fromEntries(["landscape", "portrait"].map((name) => [name, {
    width: 256, height: 192,
    atlas: asset(`${name}-atlas.webp`, 256, 192),
    poster: asset(`${name}.webp`, 1024, 768),
    clips: [{ ...asset(`${name}-01.mp4`, 128, 96), source: 1, fps: 24, duration: 6 }],
    layout: { columns: 2, rows: 2, cellWidth: 128, cellHeight: 96,
      tiles: [0, 1, 2, 3].map((n) => ({ source: n % 2, x: n % 2, y: Math.floor(n / 2), width: 1, height: 1 })) },
  }]));
  return { schemaVersion: 2, preview: false, sources: [{ kind: "image" }, { kind: "video" }], variants };
}

Deno.test("rotated plane covers every viewport corner at phone, desktop and extreme aspect ratios", () => {
  for (const [width, height] of [[320, 700], [375, 812], [1440, 1000], [1920, 1080], [3440, 1440], [320, 2000], [854, 300]]) {
    const plane = fitPlane(width, height, { width: 768, height: 576 });
    const angle = -plane.angle * Math.PI / 180;
    for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) {
      assert(Math.abs(x * Math.cos(angle) - y * Math.sin(angle)) <= plane.width / 2, "Exposed horizontal corner");
      assert(Math.abs(x * Math.sin(angle) + y * Math.cos(angle)) <= plane.height / 2, "Exposed vertical corner");
    }
  }
});

Deno.test("complete repeated boards cover the viewport at every phase and wrap to identical positions", () => {
  for (const [width, height] of [[320, 2000], [1440, 1000], [3440, 1440]]) {
    const plane = fitPlane(width, height, { width: 768, height: 576 });
    for (const phase of [0, .1, .5, .999999, 1]) {
      assert(plane.copies * plane.boardHeight - phase * plane.boardHeight >= plane.height, "Exposed strip edge");
    }
    assert(plane.boardHeight / (plane.duration / 1000) === (width <= 640 ? 9 : 12), "Unexpected drift speed");
  }
});

Deno.test("validated manifests retain all selected images and looping video previews", () => {
  assert(validateManifest(fixture()).sources.length === 2, "Selected sources changed");
});

Deno.test("rejects untrusted cached paths, hashes, preview builds and oversized assets", () => {
  for (const path of ["../secret.webp", "https://example.com/image.webp", "landscape-atlas.webp?x=1"]) {
    rejects((data) => data.variants.landscape.atlas.path = path);
  }
  rejects((data) => data.preview = true);
  rejects((data) => data.variants.landscape.atlas.sha256 = "invalid");
  rejects((data) => data.variants.landscape.clips[0].bytes = 256 * 1024 + 1);
  rejects((data) => data.variants.landscape.atlas.width = 512);
});

Deno.test("rejects omitted, duplicated and invalid preview ownership", () => {
  rejects((data) => data.variants.landscape.clips = []);
  rejects((data) => data.variants.landscape.clips.push({ ...data.variants.landscape.clips[0] }));
  rejects((data) => data.variants.landscape.clips[0].source = 0);
  rejects((data) => data.variants.landscape.clips[0].path = "landscape-02.mp4");
  rejects((data) => data.variants.landscape.clips[0].duration = 120);
});

Deno.test("rejects incomplete or overlapping mosaics in offline descriptors", () => {
  rejects((data) => data.variants.landscape.layout.tiles.pop());
  rejects((data) => data.variants.landscape.layout.tiles[0].x = 1);
  rejects((data) => data.variants.landscape.layout.tiles.forEach((tile) => tile.source = 0));
});
