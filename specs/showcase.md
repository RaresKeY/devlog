# Background Showcase

## Status

Implemented. A curated, gapless mosaic uses 16 public attachments, eight still images and eight six-second video previews. The complete board repeats at an eight-degree angle. Browser transform animation supplies the slow diagonal drift independently of the previews' 24 fps. The current motion assets total 300,453 bytes for landscape and 287,695 bytes for portrait; their static posters add 57,270 and 37,912 bytes respectively. The music player and original feed media keep their existing behavior.

## Source Sync

This spec owns `scripts/build_showcase.py`, `scripts/showcase_selection.json`, `site/showcase/`, `site/showcase.js`, `site/showcase-layout.js`, background/control markup and styles in `site/index.html` and `site/styles.css`, decorative-media exclusions in `site/music.js`, visible-video preloading in `site/app.js`, showcase verification in `scripts/check_public_bundle.py`, `tests/test_showcase.py`, and `tests/showcase_test.js`.

## Behavior

### Authored composition

- The selection file names only indexed public posts and declared image/video attachments, with optional video start times. It is an explicit authoring selection rather than an automatic mirror of every attachment. Original feed files remain unchanged and available in their posts.
- Deterministic aspect-aware rectangle packing produces varied tile sizes. Every grid cell has exactly one owner and every selected source appears in both orientations. Padding repeats existing sources. Images fill their tile. A one-second cyclic crossfade makes each six-second video preview repeatable.
- Each orientation has one WebP image atlas, a static poster, and eight separate small H.264 previews. Landscape uses six 128 by 96 cells per row; portrait uses four 96 by 96 cells. Each clip is encoded at its largest owned tile size. H.264 Main level 3.1, YUV 4:2:0, CRF 29, a two-second keyframe interval, MP4 fast start, and no audio provide broadly supported native playback without shipping multiple codec renditions.
- The browser rotates an oversized plane by minus eight degrees and repeats whole boards. Inverse-rotated viewport bounds plus a guard prevent exposed corners. A linear Web Animations transform moves the rail at 12 CSS pixels per second, or nine at viewport widths up to 640 pixels. Advancing one whole board wraps exactly. There is no production JavaScript frame loop or per-frame layout calculation.
- Only visible preview tiles can acquire a native video player. A reusable pool permits two active players for landscape and one for portrait. IntersectionObserver controls assignment and release. Other tiles retain their atlas still. Players start at the rail's current six-second phase and fade in over 180 ms. No IntersectionObserver support leaves the moving image atlas usable without preview decoding.
- Schema-v2 `manifest.json` records source identities/hashes, complete cell ownership, asset sizes/hashes, dimensions and preview timing. Public validation rejects comparison builds, unsafe paths, incorrect ownership, altered assets, omitted previews/sources, grid gaps/overlaps and budget violations. Limits are 32 sources, 16 video previews per orientation, 512 KiB per atlas, 256 KiB per clip or poster, 3 MiB per orientation and 6 MiB combined. These are encoded byte limits, not total decoded browser/GPU memory limits.
- This is an authored snapshot. Feed-only posts remain immediately readable through the normal feed route. Refreshing the background requires an explicit selection/build/review and Pages release. Later source-byte updates do not invalidate an existing snapshot; rebuild when removing or replacing showcased media.

### Browser lifecycle and cache

- A responsive static poster appears immediately. Optional preparation waits until page load and idle time. An aspect ratio of at most 6/5 selects portrait. Only that orientation's atlas and previews are fetched, with at most two transfers in flight. The atlas becomes visible after decoding; clip preparation does not block reading the feed.
- Every asset is read with a hard byte limit and checked against its size and SHA-256 before a Blob URL is created. Native playback uses those URLs, so repeating clips never fetch their sources again. Cache denial or quota failure retains the bounded in-memory path.
- Cache Storage `small-loop-devlog:showcase:v2` retains only the current two possible atlas/preview sets, keyed by content hashes. Old keys and the exact owned v1 cache are removed. Unrelated caches are preserved. Unselected assets are not downloaded proactively. A validated descriptor of at most 32 KiB in browser storage allows cached playback when the manifest endpoint is unavailable. Corrupt cache bytes are discarded and the poster remains until an explicit retry.
- Reduced motion, Save-Data and 2G connections default to a static poster without atlas or preview downloads. The header's keyboard-accessible 44-pixel toggle can explicitly enable motion. Pause persists in browser storage; reduced-motion changes clear the temporary explicit override.
- User pause destroys the scene, releases native media sources and revokes Blob URLs. Hidden tabs cancel unfinished preparation, pause the transform, and release active decoders while retaining the small encoded asset set for resume. Page exit releases owned resources. Resize rebuilds geometry only when dimensions or orientation change.
- Decorative media is muted, hidden from accessibility APIs and pointer-inert. Light foreground surfaces protect readability. Music/post-video mutual exclusion ignores `data-background-media`; background playback does not start, pause or download music. No service worker intercepts page, feed, music or another application.

### Foreground media

- Feed videos start with `preload="none"`. One IntersectionObserver enables metadata within 300 pixels of the viewport and disconnects old registrations when filters rebuild cards. Browsers without IntersectionObserver retain the previous metadata behavior. User-initiated playback remains available before preloading.

### Optimization decisions

The delivery combines established browser primitives: [transform animation](https://web.dev/articles/animations-guide), [visibility-driven media loading](https://web.dev/articles/lazy-loading-video), [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API), and [hidden-page suspension](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). The video frame rate does not limit the scrolling transform.

A matched full-board video alternative used the same selected content, geometry, duration and tilt. The hybrid reduces the area decoded continuously by keeping still imagery in an atlas and limiting active clips. A single video remains a reasonable choice for a fully animated composition; file size alone does not select the renderer. Desktop and emulated-phone measurements are local evidence rather than physical-phone or battery claims. A tested alternative that replaced group opacity with an equivalent foreground tint did not improve cadence and was discarded. Additional codec versions were not justified by these small preview files and the compatibility/maintenance cost.

## Rebuild

The authoring environment needs FFmpeg/ffprobe with libx264 and Pillow. The website has no added runtime dependency. Edit the public selection and build into a new directory inside this checkout:

```sh
python3 scripts/build_showcase.py --output .local/showcase-next
```

Review both layouts, preview loops and wrap boundaries. Replace `site/showcase/` with the reviewed generated assets and manifest, remove superseded runtime assets, and bump changed presentation tokens. Keep only the current needed candidate. `--compare-video` additionally produces private matched full-board comparison videos; its preview manifest cannot pass public validation.

## Verification

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/check_public_bundle.py`
- `deno test tests/projects_test.js tests/showcase_test.js`
- `deno check site/app.js site/music.js site/showcase.js site/showcase-layout.js`
- `git diff --check`
- Probe and fully decode all previews, confirming six-second duration, 24 fps, dimensions, pixel format and no audio. Inspect wrap boundaries and both orientation layouts.
- Test cold/warm cache requests, pool limits, reduced motion, Save-Data, explicit pause/resume, hidden-tab suspension, resize/orientation, cache corruption/retry, manifest-unavailable cache fallback, music coexistence, filters and lightbox. Inspect geometry at both sides of a whole-board wrap. Report software browser results separately from verified hardware compositing and emulated viewports separately from physical devices.
