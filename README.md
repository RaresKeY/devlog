# Small Loop Works Devlog

The public source of truth for the Small Loop Works devlog: a maintainable static browser app, deterministic JSON posts, and their public media.

- Site: <https://rareskey.github.io/devlog/>
- Runtime feed: <https://raw.githubusercontent.com/RaresKeY/devlog/main/feed/index.json>
- Repository: <https://github.com/RaresKeY/devlog>

## Layout

```text
site/                 GitHub Pages browser app
site/music/index.json explicit music catalog
site/music/<album>/   cataloged Ogg Opus tracks
site/showcase/        compiled background loops, posters and coverage manifest
feed/index.json       newest-first post index
feed/posts/<id>.json  one deterministic public post per file
feed/media/<id>/      media owned by that post
scripts/              public-boundary and feed verifier
specs/                current architecture and deployment contract
```

The Pages app fetches `feed/index.json` and each indexed post from this repository's raw `main` branch at runtime. Requests use `cache: no-store` plus a cache-busting query. A complete successful response is saved in browser storage as the last-known-good copy; if GitHub is temporarily unavailable, the app shows that copy with a visible stale-feed notice. With no valid saved copy, it shows an explicit error state.

## Publish a post

1. Add `feed/posts/<id>.json` and any files in `feed/media/<id>/`.
2. Add the matching metadata entry to `feed/index.json` in newest-first order.
3. For new or replaced videos, run `python3 scripts/update_video_audio.py --write` to record whether they contain audio, so silent clips leave music playing.
4. Run the full [verification commands](#verify), including the unit suite that requires video audio metadata, and review the diff.
5. Push the JSON/media commit. No Pages artifact deployment is needed.

Posts support up to five images and two videos. For four images and no videos, put the lead image first in `images`: it appears full-width above the other three square thumbnails, including on phones. Five images and no videos form two square images across the top and three square images below, in declared order, without cropping. That arrangement also stays in two rows on phones. Captions and click-to-enlarge remain available. One-to-three-image and mixed-media galleries retain their existing layouts. This uses the existing post schema.

Deploy a gallery-code change and verify the released asset versions before publishing a post that needs the new layout or image limit. A previous combined image can remain available through the post's optional `ctaLabel` and `ctaUrl`, using its existing immutable public image URL without adding a sixth gallery image.

Image `alt` text serves accessibility. Set an image's optional `caption` to `""` when it needs no visible explanation, or supply up to 240 characters for an explicit caption. Omitting `caption` preserves the older alt-text caption behavior. Suppressed captions also stay hidden in the full-image lightbox.

All content and complete Git history are public. Do not commit drafts, credentials, private source context, local paths, scheduler state, or publisher configuration.

## Presentation tokens

Post content uses the original Georgia stack through the active `--post-content-*-current` tokens in `site/styles.css`. These tokens affect post body copy only; the rest of the site's typography is independent. The former font trials and their runtime assets have been removed.

When publishing a CSS change, bump the `styles.css` query token in `site/index.html` so existing browsers do not retain GitHub Pages' cached stylesheet.

## Add music

The corner player only includes tracks explicitly listed in `site/music/index.json`. It does not extract sound from feed videos or infer music from tags. Add a stereo 48 kHz Ogg Opus file under `site/music/<album>/`, then add its catalog entry with a unique ID, title, project, album, relative path, duration in seconds, `audio/ogg; codecs=opus` content type and the originating public post ID in `sourcePost`. Keep chapter boundaries intact when splitting a soundtrack. Validate and deploy Pages to publish the updated library. See [the music contract](specs/music.md) for the schema and playback behavior.

The initial Beyond the Gate library contains all 12 soundtrack chapters at 192 kbps VBR. Playback is opt-in, audio downloads begin only when requested, and music pauses when a post video starts.

## Background showcase

The slowly drifting, gapless background includes a snapshot of all 108 posted image/video attachments. Each visitor downloads only one compiled silent two-minute loop, about 6.6 MB for desktop or 5.0 MB for phones, with a verified bounded persistent cache. It does not preload the original media collection. Reduced-motion and data-saving preferences use a static poster, and the header motion control can pause or explicitly enable playback. The background pauses in hidden tabs and coexists with the music player.

Refresh the snapshot with `python3 scripts/build_showcase.py --output .local/showcase-next`, review both loops and the coverage manifest, replace the reviewed generated files under `site/showcase/`, bump presentation tokens, and deploy Pages. New feed-only posts retain their existing immediate publication behavior; background refresh is a separate authoring step. See [the showcase contract](specs/showcase.md).

## Verify

```bash
python3 -m unittest discover -s tests -v
python3 scripts/check_public_bundle.py
git diff --check
```
