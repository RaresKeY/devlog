# Public Devlog Deployment Contract

## Status

The reviewed static devlog bundle is staged under `site/`. GitHub Pages is configured in Actions mode and `.github/workflows/deploy-pages.yml` validates and publishes only that directory to `https://rareskey.github.io/devlog/` on pushes to `main` or manual dispatch.

The current artifact was rebuilt on 2026-08-09 from private canonical source commit `be461f2` with `VITE_ENABLE_ADMIN=false` and Vite base `/devlog/`; it includes the Charge Knights Act II progress entry and its three authored showcase images. The build ran manually against the frozen Raspberry Pi dependency cache. Automated Raspberry Pi publication to this repository is not implemented yet.

## Public Boundary

- The repository and its complete Git history are public.
- `site/` contains only compiled HTML, CSS, JavaScript, hashed media, icons, and `.nojekyll`.
- Private TypeScript source, Git history, drafts, credentials, build caches, local paths, and scheduler state remain outside this repository.
- Repository documentation, specs, validation code, and workflow metadata are public but excluded from the deployed Pages artifact.
- Every authored update included in a build is public and retrievable from the static bundle.

## Deployment

- GitHub Pages uses `build_type=workflow`.
- The workflow checks out without persisted credentials, validates the bundle, configures Pages, uploads only `site/`, and deploys through the `github-pages` environment.
- The build job receives only `contents: read`; the deploy job receives only `pages: write` and `id-token: write`.
- Official GitHub actions are pinned to reviewed commit SHAs.
- The public URL prefix is `/devlog/`; all local runtime references must resolve beneath it.

## Verification

- `python scripts/check_public_bundle.py`
- `git diff --check`
- The verifier rejects symlinks, unexpected paths and file types, bundles above 128 MiB, missing local references, external runtime assets, incorrect canonical metadata, credential signatures, private machine context, Firebase origin references, source maps, and public admin markers.

## Planned Publisher Migration

The Raspberry Pi scheduler may later replace `site/` from an exact pinned private-source commit and push the resulting artifact at the scheduled instant. That change requires a repository-specific write credential, atomic replacement and push behavior, a clean scheduler-owned checkout, and updated publisher verification before live activation.
