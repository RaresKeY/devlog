# Public Devlog Source and Deployment Contract

## Status

`RaresKeY/devlog` is the canonical public source. `site/` contains the directly maintained browser app published at `https://rareskey.github.io/devlog/`. `feed/index.json`, `feed/posts/`, and `feed/media/` contain the deterministic runtime content read from the raw `main` branch.

The one-time migration preserves 29 previously public posts and 46 media files. The former private canonical source and Firebase publication route are legacy and are not dependencies of this repository.

## Source Sync

This spec owns `site/`, `feed/`, `scripts/check_public_bundle.py`, `.github/workflows/deploy-pages.yml`, `.github/workflows/validate-feed.yml`, `README.md`, and `AGENTS.md`. Changes to their public-source, runtime, caching, validation, or deployment behavior require a matching update here.

## Behavior

### Public boundary

- The repository and its complete Git history are public.
- The canonical post order and summary metadata live in `feed/index.json`.
- Each `feed/posts/<id>.json` is a complete schema-versioned public post. Its ID and summary fields must match the index.
- Posts accept up to five images and two videos. Existing schema-v1 posts remain valid. Optional `ctaLabel` and `ctaUrl` provide a footer link, including an immutable public link to an earlier combined image; linked historical media does not become another gallery image or an orphan file in the current feed.
- Post media lives at `feed/media/<id>/<filename>` and is referenced as `../media/<id>/<filename>` from the post JSON.
- `site/` contains only the HTML, CSS, JavaScript, local presentation assets, icons, explicitly cataloged Opus music, the curated showcase, and `.nojekyll` needed by Pages. The [music contract](music.md) owns the music catalog and player; the [showcase contract](showcase.md) owns background composition, cache and lifecycle.
- Private history, drafts, credentials, local paths, build caches, scheduler state, and publisher or cloud configuration are forbidden.
- Each public file may be at most 100 MiB (104,857,600 bytes), while the complete checked public content is capped at 5 GB (5,000,000,000 bytes, decimal). This aggregate includes `site/`, `feed/`, `specs/`, `.github/workflows/`, `AGENTS.md`, and `README.md`. All credential, private-context, path, type, ownership, and schema checks still apply independently of file size.

### Runtime feed

- `site/app.js` fetches `https://raw.githubusercontent.com/RaresKeY/devlog/main/feed/index.json` and every indexed post directly from the same raw branch.
- Fetches use `cache: no-store` and a per-load cache-busting query so JSON/media-only pushes can appear without a Pages artifact deployment.
- The app renders only after the complete index and post set validates. It stores that complete set as a last-known-good browser copy.
- A live-fetch failure uses the saved copy when valid and displays a stale-feed notice. Without a valid copy, the app displays an error state; it never silently presents an empty feed.
- User-authored text is rendered through DOM text nodes and a small allow-listed Markdown renderer. Post JSON is never injected as HTML.
- The [taxonomy contract](taxonomy.md) owns actual project names and topic tags. Project controls group known historical titles and slug/case/spacing variants under one identity; filtering includes every alias and search retains the former names. Canonical backpost corrections update the post and index together.
- Each image keeps required non-empty `alt` text and may carry a separate string `caption` of at most 240 characters. An absent caption preserves the legacy visible alt-text caption; an empty or whitespace-only caption suppresses the figure and lightbox description while retaining image alt text and the accessible open-image button. An explicit non-empty caption is rendered as text in both places. Videos retain their existing caption contract. Optional boolean `hasAudio` records whether a video contains an audio stream; false allows it to play alongside music. The authoring ffprobe helper records this metadata without changing media bytes. Omission preserves legacy handling. An optional video `poster` references a JPEG, PNG or WebP under the same post media directory (at most 8 MiB, with a matching file signature). The app displays that still before playback through the native video poster attribute; the referenced poster is owned media and does not become an extra gallery image. Omission preserves existing browser behavior. This is an optional field in the existing schema-v1 post.

### Presentation tokens

- The compact hero introduces the author's games, tools, music and experiments with direct personal copy. The previous promotional eyebrow, slogan, summary metrics, blueprint backdrop, build-journal label and live-source badge are absent. Live-feed errors and stale-copy notices remain visible when applicable. A newly generated transparent purple game-making machine supplies the hero art; a generated loop mark supplies the header/footer icons and favicons. A matching primary icon lives at repository-root `icon.png`.
- Browser and touch icons crop the existing loop mark to reduce transparent margins, with a target maximum extent of 96 percent of the square canvas. The ICO includes 16, 24, 32, 48 and 64 pixel sizes; PNG variants provide 32, 180 and 512 pixel assets. The browser's 512-pixel variant is `favicon-tab-512.png`; the header, footer, player fallback and primary icon retain their existing artwork and framing.
- The warm palette, existing Georgia post text, uniform card corners, quieter borders and compact headings provide a straightforward feed. The existing search, project/status filters, post metadata, media galleries, links and lightbox retain their behavior. The compact charcoal music player floats in the lower-right corner with cover art, grouped transport controls and a visible seek line; its matching library panel opens above the bar. Bottom page space keeps footer content reachable below the player.
- A faint, fixed background mosaic drifts diagonally through a curated public-media selection using a repeated WebP atlas and a bounded pool of small video previews. Transform motion is independent of preview frame rate. Light intro/filter surfaces and opaque post cards retain legibility. Responsive verified asset caches have static-poster fallbacks, a header motion toggle, reduced-motion/data-saving defaults and hidden-tab suspension. The background does not take over music playback. Offscreen feed videos defer metadata until near the viewport.
- Links inside post content use a distinct underlined, highlighted treatment with visible hover and keyboard-focus states; navigation and other link styles are unchanged.
- Post body copy uses the original Georgia stack through the active `--post-content-*-current` font, size, line-height, and letter-spacing tokens. Former font trials and their runtime assets are not part of the current site.
- Gallery captions use 16px italic Georgia with a 1.5 line height and room for at least two lines. Figures stack media and captions vertically; captions fill the remaining figure height so captions in the same gallery row share a bottom edge without an exposed strip beneath shorter text. Longer captions expand naturally without clipping, and long words wrap within narrow thumbnails; stacked phone galleries retain the two-line minimum independently. Suppressed image captions remain absent.
- Posts with exactly four images and no videos use a featured gallery: the first image spans the full width at 16:9 without cropping, followed by three square thumbnails in declared image order. This arrangement remains three columns on narrow screens. Captions, accessible image buttons, lazy loading, and the full-image lightbox remain available. The public schema version is unchanged.
- Posts with exactly five images and no videos use a two-row lineup: the first two square images share the top row, followed by three square images in the bottom row. All images use `object-fit: contain` to retain the complete render. A six-column grid with spans of three and two preserves the declared order and the two-above-three arrangement at desktop and phone widths. Existing one-to-three-image, featured-four and mixed-media layouts keep their behavior, captions, accessible buttons, lazy loading and lightbox.
- Gallery videos use their intrinsic aspect ratio and `object-fit: contain`, preserving the complete frame and embedded labels for square, portrait and landscape media. The existing width, height ceiling, native controls, posters, captions and responsive gallery order remain in effect. Image crop rules are independent.
- `site/index.html` versions stylesheet, app/player modules, hero and icon URLs with query tokens. Presentation releases bump the changed assets' tokens so a fresh page load requests matching files despite GitHub Pages' ten-minute asset cache. Already-open pages adopt a release on reload.

### Workflows

- GitHub Pages uses Actions mode and publishes only `site/` through the `github-pages` environment.
- `.github/workflows/deploy-pages.yml` runs for `site/**`, the verifier, or its own workflow changes, plus manual dispatch. It validates before uploading the Pages artifact.
- `.github/workflows/validate-feed.yml` runs for `feed/**` pushes and pull requests. A feed-only commit does not trigger the Pages workflow.
- Deploy and verify new gallery code and versioned assets before publishing feed content that depends on a higher image limit. Publish the post/media update separately after the deployed client accepts it, so the runtime feed remains valid throughout rollout.
- Checkout actions do not persist credentials. Validation has `contents: read`; deployment alone receives `pages: write` and `id-token: write`.

## Verification

- `python3 scripts/check_public_bundle.py`
- `git diff --check`
- For gallery changes, use the existing localhost preview with representative image-only and mixed-media posts. Check desktop and narrow phone widths, declared image order, page overflow, captions, pointer/keyboard lightbox opening and closing, and browser errors before releasing. Confirm the deployed HTML asset tokens and CSS/JavaScript bytes match the validated revision before scheduling a dependent post.
- The verifier checks site paths and references, raw-feed configuration, canonical metadata, index order and uniqueness, post schemas, exact post/media ownership, MIME/file consistency, symlinks, the 100 MiB per-file and 5 GB aggregate size limits, credential signatures, private machine context and source-revision fragments, source maps, obsolete compiled assets, and forbidden publisher/admin markers.
- The feed workflow provides feed-only CI without creating or deploying a Pages artifact. Both workflows run the catalog unit tests and full verifier. The Pages workflow validates before deployment when the browser or deployment surface changes.
