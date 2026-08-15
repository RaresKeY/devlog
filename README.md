# Small Loop Works Devlog

The public source of truth for the Small Loop Works devlog: a maintainable static browser app, deterministic JSON posts, and their public media.

- Site: <https://rareskey.github.io/devlog/>
- Runtime feed: <https://raw.githubusercontent.com/RaresKeY/devlog/main/feed/index.json>
- Repository: <https://github.com/RaresKeY/devlog>

## Layout

```text
site/                 GitHub Pages browser app
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
3. Run the verifier and review the diff.
4. Push the JSON/media commit. No Pages artifact deployment is needed.

All content and complete Git history are public. Do not commit drafts, credentials, private source context, local paths, scheduler state, or publisher configuration.

## Presentation tokens

Post content is currently trialling the self-hosted JetBrains Mono stack in `site/styles.css`. The preceding Charter treatment remains available through the `-previous` tokens, and the original Georgia stack remains named as `--post-content-font-original`.

To restore the complete Charter treatment after reviewing the trial, point `--post-content-font`, `--post-content-size`, `--post-content-line-height`, and `--post-content-letter-spacing` at their matching `-previous` tokens. These tokens change post body copy only; the rest of the site's typography is independent. The bundled JetBrains Mono files are version 2.304 and retain their OFL license in `site/fonts/OFL.txt`.

When publishing a CSS change, bump the `styles.css` query token in `site/index.html` so existing browsers do not retain GitHub Pages' cached stylesheet.

## Verify

```bash
python3 scripts/check_public_bundle.py
git diff --check
```
