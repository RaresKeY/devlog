# Small Loop Works Devlog

Public deployment mirror for the Small Loop Works devlog.

- GitHub Pages: <https://rareskey.github.io/devlog/>
- Artifact: `site/`
- Source: maintained privately; source code, drafts, credentials, and scheduler state are not published here

Pushes to `main` validate the exact public bundle and deploy only `site/` through GitHub Pages. The repository contains compiled static files and the public metadata required to verify and deploy them.

## Verify

```bash
python scripts/check_public_bundle.py
git diff --check
```
