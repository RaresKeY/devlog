# Project Instructions

This public repository is the single source of truth for the Small Loop Works devlog.

## Public Boundary

- Treat every committed file and every Git revision as public.
- Keep private source history, drafts, credentials, local paths, build caches, scheduler state, and publisher configuration out of this repository.
- `site/` is the maintainable static browser app published by GitHub Pages.
- `feed/index.json`, `feed/posts/`, and `feed/media/` are the canonical public feed and media. Direct, reviewed edits are expected.
- Do not add a dependency on a private source repository, a generated mirror, Firebase, or another publisher.
- GitHub Pages must publish only `site/`, never the repository root.

## Specs

- Read `specs/_readme.md` and `specs/deployment.md` before changing the app, feed contract, public boundary, deployment workflow, or verifier.
- Update the owning spec in the same turn as behavior, architecture, workflow, or verification changes.

## Publishing

- Keep `feed/index.json` newest-first and make every index entry agree with its `feed/posts/<id>.json` file.
- Store post media under `feed/media/<id>/` and reference it from the post with `../media/<id>/<filename>`.
- A feed-only push updates the runtime feed without rebuilding the Pages artifact. A `site/`, Pages-workflow, or verifier change must pass validation and deploy Pages.

## Verification

Run before every push:

```bash
python3 scripts/check_public_bundle.py
git diff --check
```
