# Project Instructions

This repository is the public, artifact-only deployment mirror for the Small Loop Works devlog.

## Public Boundary

- Treat every committed file and every Git revision as public.
- Keep private source history, drafts, credentials, local paths, build caches, and scheduler state out of this repository.
- `site/` contains only the reviewed browser-facing bundle generated from the private canonical source.
- GitHub Pages must publish only `site/`, never the repository root.
- Replace `site/` atomically from one verified build; do not edit hashed assets by hand.

## Specs

- Read `specs/_readme.md` and `specs/deployment.md` before changing the public boundary, deployment workflow, or verifier.
- Update the owning spec in the same change when its contract changes.

## Verification

Run before every publication:

```bash
python scripts/check_public_bundle.py
git diff --check
```
