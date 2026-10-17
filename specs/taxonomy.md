# Projects and Tags

## Status

The public backposts use consistent project names and topic tags. The browser groups historical aliases into a single project option, including when a saved feed still contains older names.

## Source Sync

This spec owns project/tag metadata in `feed/index.json` and `feed/posts/`, project identity and search in `site/projects.js` and `site/app.js`, and `tests/projects_test.js`. The [deployment contract](deployment.md) owns the public schema and feed loading.

## Behavior

### Project identity

Use the actual project or published game title, with consistent capitalization. Keep post IDs, dates, titles, bodies and media references stable when correcting taxonomy. Each index project must exactly match its post.

The browser's identity key normalizes Unicode compatibility forms, case, surrounding whitespace and spaces/hyphens/underscores. Known historical names map to one canonical title. The same identity controls dropdown grouping and filtering; selecting a project includes all its historical aliases. Labels, original names and repository-style slugs remain searchable. Unknown future projects remain available without registering an alias first.

| Canonical project | Historical names or scope |
|---|---|
| Code Review Simulator | `code-review-simulator`, CRS, Godot Asset Authoring. The editor authoring plugin belongs here, as do the detailed residential building backposts. |
| Conventional Space Fleet | Slug, title and capitalization variants share one project. |
| Incremental Framework | Pebble Run and Upgrade Loop are the run screen and upgrade/tech-tree work in this project. |
| Plug & Prosper | `plug-charge`, Plug and Prosper. |
| Who Put Sugar in the Sky? | Odd Spark, `odd-spark`. |
| White Approach | `fog-mountain`. |
| Horizon Charge II: Sunward | `horizon-charge-ii`, `horizon-charge-2`. It remains distinct from Horizon Charge. |
| 3D Art | `3d-work`. A mixed showcase spanning fleet assets and TRELLIS models stays here; focused work uses its actual project. |
| Unnamed Card Game | `unnamed-game`. No confirmed owning project or later title is established for this backpost, so it remains separate from The Hollow Signal. |

Other existing projects retain their established titles: AIA Tennis, Asset Showcase Studio, Charge Grid, Charge Knights, Hallowmere, Hold the Line, Jev, Material Atlas, Rogue Diner Coop, Supper Guard, The Hollow Signal, Wheat Sway Lab and World State Simulator.

### Topic tags

Tags describe the work shown in that post. Use a short selection of lowercase, hyphen-separated topics. Do not repeat the project name, the status, the publication channel or the fact that this is a devlog. A version number belongs in the post text rather than a standalone tag. Engine, tool and language tags should reflect actual implementation or capture evidence.

The curated vocabulary currently consists of:

- Art and assets: `3d-art`, `animation`, `asset-pipeline`, `effects`, `environments`, `hardware`, `materials`, `pixel-art`, `procedural`, `rigging`, `spacecraft`, `worldbuilding`.
- Design and gameplay: `cooking`, `couch-coop`, `deckbuilder`, `game-design`, `gameplay`, `interaction`, `physics`, `puzzle`, `simulation`, `tech-tree`, `tennis`, `tower-defense`, `ui`.
- Tools and engineering: `ai`, `ai-workflow`, `blender`, `browser-automation`, `browser-game`, `cpp`, `godot`, `material-maker`, `performance`, `tooling`, `trellis2`.
- Audio and milestones: `audio`, `game-jam`, `music`, `postmortem`, `prototyping`, `release`, `soundtrack`.

Use `ui` for HUDs, icons and diegetic desktops; `spacecraft` for spaceship/fleet variants; `materials` for finish and weathering work; `prototyping` for prototype work. `audio` describes game sound work, while `music` and `soundtrack` identify explicit music posts. Add a new topic when the work warrants it rather than inventing another spelling of an existing one. Tags remain compatible with the existing schema and full-text search.

## Verification

- `deno test tests/projects_test.js` covers mixed historical feeds, shared filter identity, actual-title aliases, legacy search terms, distinct projects and unregistered future projects.
- `python3 scripts/check_public_bundle.py` verifies exact index/post agreement and existing schema, media and public-boundary rules.
- For a backpost correction, compare parsed JSON before/after and confirm only project/tag metadata changed. Check the complete feed in a browser: unique dropdown labels, counts matching all posts in a selected project, project plus status/search combinations, and narrow-screen layout.
