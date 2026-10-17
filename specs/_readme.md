# Small Loop Devlog Specs Map

`specs/` is committed project memory for current intent and implementation. Read the relevant spec before changing its owning behavior, contract, boundary, source area, or verification flow, and update it with the implementation.

## Spec Style

Specs describe current behavior rather than work history. Each spec names its owning files and includes `Status`, `Source Sync`, `Behavior`, and `Verification` sections. Planned behavior and open decisions must be labelled instead of presented as implemented fact.

## Spec Map

| Spec | Owning sources | Scope | Read when |
|---|---|---|---|
| [`deployment.md`](deployment.md) | `site/`, `feed/`, `scripts/check_public_bundle.py`, `.github/workflows/`, `README.md`, `AGENTS.md` | Static app, runtime feed, public boundary, Pages deployment, and verification | Changing the browser app, feed schema/content, deployment workflows, public boundary, or verification |
| [`music.md`](music.md) | `site/music.js`, `site/music/`, player markup/styles, catalog verification and tests | Explicit music library, Opus assets and compact player | Adding music or changing playback, catalog rules or player behavior |
| [`showcase.md`](showcase.md) | Background builder/assets/controller, visible-video preloading and showcase tests | Gapless compiled mosaic, responsive playback, bounded cache and lifecycle | Refreshing background media or changing its delivery, motion, caching or foreground interaction |

## Source Sync

- Update the owning spec in the same change as behavior, architecture, workflow, or verification.
- Keep every spec's source list aligned with the files it actually describes.
- Update this map when a spec is added, moved, split, or removed.
- Keep plans, TODOs, work logs, and merge handoffs outside `specs/`.
