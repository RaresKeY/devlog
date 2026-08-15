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
- Post media lives at `feed/media/<id>/<filename>` and is referenced as `../media/<id>/<filename>` from the post JSON.
- `site/` contains only the HTML, CSS, JavaScript, local presentation assets, icons, and `.nojekyll` needed by Pages.
- Private history, drafts, credentials, local paths, build caches, scheduler state, and publisher or cloud configuration are forbidden.

### Runtime feed

- `site/app.js` fetches `https://raw.githubusercontent.com/RaresKeY/devlog/main/feed/index.json` and every indexed post directly from the same raw branch.
- Fetches use `cache: no-store` and a per-load cache-busting query so JSON/media-only pushes can appear without a Pages artifact deployment.
- The app renders only after the complete index and post set validates. It stores that complete set as a last-known-good browser copy.
- A live-fetch failure uses the saved copy when valid and displays a stale-feed notice. Without a valid copy, the app displays an error state; it never silently presents an empty feed.
- User-authored text is rendered through DOM text nodes and a small allow-listed Markdown renderer. Post JSON is never injected as HTML.

### Presentation tokens

- The hero keeps the current page composition, image size, and natural aspect ratio. A restrained purple blueprint-grid backdrop and compact workbench label give the transparent image visual support without restoring the oversized orange card.
- Links inside post content use a distinct underlined, highlighted treatment with visible hover and keyboard-focus states; navigation and other link styles are unchanged.
- Post body copy uses self-hosted JetBrains Mono 2.304 at prose-oriented size, leading, weight, and tracking. The regular, italic, and bold WOFF2 files and OFL license live in `site/fonts/`; no third-party font request is made at runtime.
- The preceding Charter treatment is preserved in the `-previous` font, size, line-height, and letter-spacing tokens. Point the four active `--post-content-*` tokens at those values to revert the whole trial without changing other typography; the original Georgia stack remains named separately.
- `site/index.html` versions the stylesheet URL with a query token. CSS releases bump that token so GitHub Pages' ten-minute asset cache cannot leave an already-open browser on the previous presentation.

### Workflows

- GitHub Pages uses Actions mode and publishes only `site/` through the `github-pages` environment.
- `.github/workflows/deploy-pages.yml` runs for `site/**`, the verifier, or its own workflow changes, plus manual dispatch. It validates before uploading the Pages artifact.
- `.github/workflows/validate-feed.yml` runs for `feed/**` pushes and pull requests. A feed-only commit does not trigger the Pages workflow.
- Checkout actions do not persist credentials. Validation has `contents: read`; deployment alone receives `pages: write` and `id-token: write`.

## Verification

- `python3 scripts/check_public_bundle.py`
- `git diff --check`
- The verifier checks site paths and references, exact self-hosted font files, WOFF2 signatures and the OFL marker, raw-feed configuration, canonical metadata, index order and uniqueness, post schemas, exact post/media ownership, MIME/file consistency, symlinks, size limits, credential signatures, private machine context and source-revision fragments, source maps, obsolete compiled assets, and forbidden publisher/admin markers.
- The feed workflow provides feed-only CI without creating or deploying a Pages artifact. The Pages workflow repeats the full verifier before deployment when the browser or deployment surface changes.
