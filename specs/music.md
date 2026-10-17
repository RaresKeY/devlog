# Music Library and Player

## Status

Implemented. A compact player in the lower-right corner provides music explicitly added to `site/music/index.json`. The initial library contains the 12 chapters of the Hallowmere: Beyond the Gate soundtrack as separate stereo 48 kHz Ogg Opus files encoded at 192 kbps VBR. The original soundtrack video in the feed remains available.

## Source Sync

This spec owns `site/music.js`, `site/music/`, the music-player markup and styles in `site/index.html` and `site/styles.css`, the catalog checks in `scripts/check_public_bundle.py`, and `tests/test_music_catalog.py`.

## Behavior

- The music library is explicitly curated. Feed tags, video audio, and files merely present on disk never add tracks. A new upload becomes playable by adding its Opus file and catalog entry, validating the public bundle, and deploying Pages.
- The schema-v1 catalog has exactly `schemaVersion` and `tracks`. Each track declares unique `id` and `path`, non-empty `title`, `project` and `album`, positive finite `duration` in seconds, `contentType` equal to `audio/ogg; codecs=opus`, and `sourcePost` identifying an existing public post. Optional `artwork` is a safe `album-slug/artwork-slug.webp` path relative to the catalog, with an existing WebP signature and a 128 KiB size limit. Tracks may share a cover. Omission or an image loading failure uses the site's brand icon. The initial 192-square cover is derived from the soundtrack's published still image. The catalog accepts at most 500 tracks. Text fields are limited to 240 characters.
- Track paths use `album-slug/track-slug.opus`, relative to the catalog. The verifier rejects duplicate identities or paths, traversal, remote URLs, missing source posts, missing media, invalid Ogg Opus signatures and unlisted files. The existing public file and aggregate size limits apply.
- The catalog is fetched from the deployed site independently of the runtime post feed. A catalog failure leaves the feed usable and displays an unavailable music state. A valid empty catalog hides the player.
- Initial page load fetches no audio and never starts playback. The single audio element uses `preload="none"`, with its source assigned only on a play action. Browser storage retains the selected track and volume, never an autoplay preference or audio data.
- The compact charcoal bar provides cover art, the current title and project, grouped previous/play/next controls, and a visible seek line with elapsed and total times. Cover/title opens the matching dark library panel above it, with volume and the scrollable track list. The full album name remains in the playlist and title tooltip. Controls retain 44px button targets and explicit focus/hover/pressed states. A small cover loads independently of audio; changing tracks on the same album does not reload it. Track selection starts that track; next/previous preserve a paused state. Previous restarts the current track when more than three seconds have played. Ended tracks advance automatically, wrapping at the end of the library.
- Music pauses when a post video starts. Starting music pauses other page media. The silent decorative showcase is excluded in both directions. Playback and network failures are visible, and another track can be chosen without reloading the feed. Quick track changes ignore obsolete play-promise rejections. Loading messages clear on pause or when the track becomes ready; genuine playback errors remain visible.
- Controls support keyboard activation, visible focus, range-input seeking and volume, and Escape to collapse the panel and return focus to its trigger. The panel and bar respect narrow viewports and safe-area insets. Supported Media Session actions expose play, pause, track navigation and seeking to system controls.
- Overflowing titles drift within the title area only while playing. Hover or keyboard focus holds the title still; reduced-motion mode keeps a static ellipsis. A ResizeObserver checks text fitting on layout/track changes. The player uses media events rather than a timer or JavaScript animation loop. Progress updates set the seek fill, and Media Session metadata includes the current artwork. Collapsing it keeps intentional playback running. No framework, external runtime library, or audio cache is introduced.

## Verification

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/check_public_bundle.py`
- `deno check site/app.js site/music.js`
- `git diff --check`
- Inspect the real browser at desktop and narrow phone widths. Verify no initial audio request or autoplay, actual Opus playback, pause/resume, seeking, volume persistence, playlist navigation, automatic advance, media mutual exclusion, collapsed/expanded states, keyboard focus and visible failures. Retest the feed's search, gallery lightbox and saved-copy fallback.
