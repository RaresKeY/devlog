# Small Loop Devlog Artifact Specs Map

`specs/` is committed project memory for current intent and implementation. Read the relevant spec before changing its owning behavior, contract, boundary, source area, or verification flow, and update it with the implementation.

## Spec Map

| Spec | Owning sources | Scope | Read when |
|---|---|---|---|
| [`deployment.md`](deployment.md) | `site/`, `scripts/check_public_bundle.py`, `.github/workflows/deploy-pages.yml`, `README.md`, `AGENTS.md` | Public-artifact boundary, Pages deployment, URL prefix, and verification | Changing the artifact, deployment workflow, public boundary, or verification |

## Maintenance

- Keep specs compact, evidence-based, and current.
- Update this map when a spec is added, moved, split, or removed.
- Keep plans, TODOs, work logs, and merge handoffs outside `specs/`.
- Label planned behavior and open decisions; do not present them as implemented facts.
