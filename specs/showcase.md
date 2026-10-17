# Background Showcase

## Status

Implemented. A silent, slowly drifting, irregular mosaic shows the current snapshot of 108 public image/video attachments from 65 posts. The 84 images and 24 videos are composed into two-minute H.264 loops. The desktop version is 1024 by 768 and 6,644,598 bytes; the phone version is 576 by 1024 and 4,999,468 bytes. Both are 12 fps with no audio. Posters provide an immediate static fallback.

## Source Sync

This spec owns `scripts/build_showcase.py`, `site/showcase/`, `site/showcase.js`, background/control markup and styles in `site/index.html` and `site/styles.css`, decorative-media exclusions in `site/music.js`, visible-video preloading in `site/app.js`, showcase verification in `scripts/check_public_bundle.py`, and `tests/test_showcase.py`.

## Behavior

### Offline composition

- The builder reads only indexed public posts and their declared image/video attachments. Video posters do not become duplicate source items, and text-only posts have no visual attachment to include. Original feed files remain unchanged.
- A deterministic shuffle and aspect-aware rectangle packing produce varied tile sizes. Every grid cell has exactly one owner and every source appears in both variants. Padding uses repeated existing sources. Images fill their tile; short video excerpts use a cyclic crossfade. A constant vertical drift wraps the complete board, including its video phase, over 120 seconds.
- H.264 Main, level 3.1, YUV 4:2:0, CRF 29 and the slow preset balance the compiled background's size and broad playback support. MP4 fast start is enabled. The local 12-second AV1 comparison saved about 13 percent at its tested settings; production retains one H.264 stream per orientation. This comparison does not establish equivalent codec quality or device energy use.
- `site/showcase/manifest.json` records source identities and hashes, complete cell ownership, variant dimensions/timing and encoded-file sizes/hashes. The standard-library verifier rejects preview builds, unsafe paths, oversized videos, altered encoded bytes, missing media, grid gaps/overlaps and omitted sources. Each video is at most 8 MiB; each poster is at most 256 KiB.
- The showcase is a pre-rendered snapshot. New feed-only posts remain immediately readable through the normal feed route. Refreshing background content is an explicit site-authoring step, followed by the normal Pages release. Existing source-byte updates do not invalidate an already published background snapshot. Rebuild the showcase when replacing or removing media that should also change in the background.

### Browser lifecycle and cache

- The page displays a responsive static poster immediately and schedules optional video preparation after the page has loaded. An aspect ratio of at most 6/5 selects the portrait variant. Only the selected video is fetched; an orientation-category change swaps to the other variant when needed.
- The entire selected loop is read with a hard byte limit and verified against its size and SHA-256 before playback. A local Blob URL supplies the single muted, looping, inline background video. Repeating the loop performs no source-media or loop-video network request.
- Cache Storage `small-loop-devlog:showcase:v1` retains only the current snapshot's two possible video URLs, keyed by their content hashes. Old keys are removed before insertion. Capacity is bounded by two files of at most 8 MiB each; the current pair totals 11,644,066 bytes. This bounds encoded cache bytes, not total decoded browser/GPU memory. Unselected variants are never proactively downloaded. A descriptor of at most 4 KiB in browser storage allows verified cached playback when the manifest endpoint is unavailable; all stored paths, sizes and hashes are revalidated.
- Cache denial or quota failure falls back to the same bounded in-memory playback. Corrupt cached bytes are discarded, and the poster stays visible until an explicit retry succeeds. No service worker intercepts the page, feed, music, or another application.
- Reduced motion, Save-Data and 2G connections default to the static poster without downloading video. The user may explicitly enable motion using the header's play/pause control. A paused preference persists in browser storage. Reduced-motion changes reset a temporary explicit override.
- User pause releases the decoded video source and revokes its Blob URL. Hidden tabs pause playback and cancel unfinished preparation. Returning to a visible tab resumes eligible motion; page exit releases owned media resources. No JavaScript per-frame animation or live tile-layout loop runs.
- The background is decorative, muted, hidden from accessibility APIs and pointer-inert. Light surfaces protect the intro, filter controls and post text. The header provides a keyboard-accessible 44-pixel motion toggle. Music/post-video mutual exclusion ignores the decorative background.

### Foreground media

- Feed videos start with `preload="none"`. One IntersectionObserver enables metadata within 300 pixels of the viewport and disconnects old registrations when filters rebuild cards. Browsers without IntersectionObserver retain the previous metadata behavior. User-initiated playback remains available before preloading.

## Rebuild

The authoring environment needs FFmpeg/ffprobe with libx264 and Pillow. The website has no added runtime dependency. Build into a new directory inside this checkout:

```sh
python3 scripts/build_showcase.py --output .local/showcase-next
```

Review the full loops and coverage manifest, replace the five generated files in `site/showcase/` with the reviewed candidate, and update presentation cache tokens. Keep only the current needed candidate. For a bounded codec experiment, use `--preview-seconds 12 --variant landscape --av1` with a new local output directory; preview manifests cannot pass public validation.

## Verification

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/check_public_bundle.py`
- `deno check site/app.js site/music.js site/showcase.js`
- `git diff --check`
- Probe and fully decode both loops, confirming duration, frame rate, dimensions, pixel format and the absence of audio. Inspect a wrap boundary and both orientation layouts.
- Test cold and warm cache behavior, reduced motion, Save-Data, explicit pause/resume, hidden-tab suspension, orientation changes, cache corruption/retry, music coexistence, foreground video playback, filters, lightbox and narrow layouts. Count actual video requests. Report headless playback evidence separately from physical phone/GPU/battery claims.
