#!/usr/bin/env python3
"""Validate the public devlog app, deterministic feed, media, and boundary."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
FEED = ROOT / "feed"
POSTS = FEED / "posts"
MEDIA = FEED / "media"
CANONICAL_URL = "https://rareskey.github.io/devlog/"
RAW_FEED_ROOT = "https://raw.githubusercontent.com/RaresKeY/devlog/main/feed/"
MAX_PUBLIC_BYTES = 128 * 1024 * 1024
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_BODY_BYTES = 100 * 1024

REQUIRED_SITE_FILES = {
    ".nojekyll",
    "app.js",
    "apple-touch-icon.png",
    "favicon-32.png",
    "favicon-512.png",
    "favicon.ico",
    "hero.webp",
    "index.html",
    "styles.css",
}
ALLOWED_SITE_SUFFIXES = {
    ".css",
    ".html",
    ".ico",
    ".js",
    ".png",
    ".webp",
}
ALLOWED_MEDIA_SUFFIXES = {".jpg", ".jpeg", ".mp4", ".png", ".webm", ".webp"}
TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".yml", ".yaml"}
VALID_STATUSES = {"wip", "feedback", "build", "milestone", "supporter"}
INDEX_KEYS = {"schemaVersion", "repository", "branch", "posts"}
INDEX_POST_KEYS = {"id", "path", "title", "project", "status", "createdAt"}
REQUIRED_POST_KEYS = {
    "schemaVersion",
    "id",
    "title",
    "project",
    "body",
    "status",
    "tags",
    "createdAt",
    "visibility",
    "images",
    "videos",
}
OPTIONAL_POST_KEYS = {"updatedAt", "ctaLabel", "ctaUrl"}
IMAGE_KEYS = {"id", "path", "alt", "fileName", "contentType"}
VIDEO_KEYS = {"id", "path", "caption", "fileName", "contentType"}
MIME_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".webm": "video/webm",
    ".webp": "image/webp",
}

CREDENTIAL_PATTERNS = {
    "AWS access key": re.compile(rb"(?:AKIA|ASIA)[0-9A-Z]{16}"),
    "Firebase API key": re.compile(rb"AIza[0-9A-Za-z_-]{30,}"),
    "GitHub token": re.compile(
        rb"(?:github_pat_[0-9A-Za-z_]{20,}|gh[pousr]_[0-9A-Za-z]{20,})"
    ),
    "OpenAI-style key": re.compile(rb"sk-[A-Za-z0-9_-]{20,}"),
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "credential URL": re.compile(rb"https?://[^/@\s]+:[^/@\s]+@"),
}
PRIVATE_CONTEXT_PATTERNS = {
    "local filesystem path": re.compile(rb"(?:/home|/Users)/[^/\s]+/"),
    "private tailnet hostname": re.compile(rb"[a-z0-9-]+\.ts\.net"),
    "legacy devlog hosting origin": re.compile(rb"small-loop-devlog\.web\.app"),
}
FORBIDDEN_MARKERS = {
    "Private local tools",
    "Save local update",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SMALL_LOOP_POST_KEY",
    "gitBackedUpdates",
    "small-loop-updates:local-posts",
}
FORBIDDEN_DOC_CLAIMS = {
    "artifact-only deployment mirror",
    "source: maintained privately",
    "generated from the private canonical source",
    "do not edit hashed assets by hand",
}
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SAFE_FILENAME = re.compile(r"^[A-Za-z0-9._-]+$")
BODY_MEDIA_REFERENCE = re.compile(r"\]\((\.\./media/[^)]+)\)")
SOURCE_REVISION = re.compile(r"(?<![0-9A-Fa-f])[0-9a-f]{7,40}(?![0-9A-Fa-f])")


class SiteParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonical_links: list[str] = []
        self.og_urls: list[str] = []
        self.local_references: list[str] = []
        self.external_runtime_assets: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        values = dict(attrs)
        if tag == "link" and "canonical" in (values.get("rel") or "").split():
            href = values.get("href")
            if href:
                self.canonical_links.append(href)
        if tag == "meta" and values.get("property") == "og:url":
            content = values.get("content")
            if content:
                self.og_urls.append(content)

        for attribute in ("href", "src"):
            reference = values.get(attribute)
            if not reference or reference.startswith(("#", "data:")):
                continue
            parsed = urlparse(reference)
            if parsed.scheme in {"http", "https", "mailto"}:
                if attribute == "src":
                    self.external_runtime_assets.append(reference)
                continue
            self.local_references.append(reference)


def load_json(path: Path) -> dict:
    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
        result: dict = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate key {key!r}")
            result[key] = value
        return result

    return json.loads(
        path.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicate_keys,
    )


def public_files() -> list[Path]:
    paths: list[Path] = []
    for root in (SITE, FEED):
        if root.is_dir():
            paths.extend(path for path in root.rglob("*") if path.is_file())
    for path in (ROOT / "AGENTS.md", ROOT / "README.md"):
        if path.is_file():
            paths.append(path)
    for root in (ROOT / "specs", ROOT / ".github" / "workflows"):
        if root.is_dir():
            paths.extend(path for path in root.rglob("*") if path.is_file())
    return paths


def relative_files(root: Path) -> set[str]:
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file()
    }


def validate_site() -> tuple[list[str], int]:
    failures: list[str] = []
    if not SITE.is_dir():
        return ["missing site/"], 0

    actual_files = relative_files(SITE)
    for path in sorted(REQUIRED_SITE_FILES - actual_files):
        failures.append(f"missing expected site file: {path}")
    for path in sorted(actual_files - REQUIRED_SITE_FILES):
        failures.append(f"unexpected site file: {path}")

    for relative_path in sorted(actual_files):
        path = SITE / relative_path
        if path.name != ".nojekyll" and path.suffix.lower() not in ALLOWED_SITE_SUFFIXES:
            failures.append(f"unexpected site file type: {relative_path}")
        if path.suffix == ".map":
            failures.append(f"source map is not allowed: site/{relative_path}")

    index_path = SITE / "index.html"
    if index_path.is_file():
        parser = SiteParser()
        parser.feed(index_path.read_text(encoding="utf-8"))
        failures.extend(
            f"index.html: external runtime asset is not allowed: {reference}"
            for reference in parser.external_runtime_assets
        )
        for reference in parser.local_references:
            clean = reference.split("#", 1)[0].split("?", 1)[0]
            if clean.startswith("/"):
                failures.append(f"index.html: local reference must be relative: {reference}")
                continue
            target = (index_path.parent / clean).resolve()
            if not target.is_relative_to(SITE):
                failures.append(f"index.html: reference escapes site/: {reference}")
            elif not target.is_file():
                failures.append(f"index.html: missing local target: {reference}")
        if parser.canonical_links != [CANONICAL_URL]:
            failures.append(
                f"index.html: expected canonical {CANONICAL_URL!r}, "
                f"found {parser.canonical_links!r}"
            )
        if parser.og_urls != [CANONICAL_URL]:
            failures.append(
                f"index.html: expected og:url {CANONICAL_URL!r}, found {parser.og_urls!r}"
            )

    app_path = SITE / "app.js"
    if app_path.is_file():
        app = app_path.read_text(encoding="utf-8")
        required_runtime_markers = {
            RAW_FEED_ROOT,
            'cache: "no-store"',
            'localStorage.setItem(CACHE_KEY',
            'localStorage.getItem(CACHE_KEY',
            "Live GitHub feed unavailable",
        }
        for marker in sorted(required_runtime_markers):
            if marker not in app:
                failures.append(f"app.js: required runtime behavior is missing: {marker}")
        if "innerHTML" in app:
            failures.append("app.js: public post content must not use innerHTML")

    return failures, len(actual_files)


def parse_date(value: object, label: str, failures: list[str]) -> datetime | None:
    if not isinstance(value, str):
        failures.append(f"{label}: expected an ISO timestamp")
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        failures.append(f"{label}: invalid ISO timestamp {value!r}")
        return None


def has_expected_signature(path: Path) -> bool:
    data = path.read_bytes()[:16]
    suffix = path.suffix.lower()
    if suffix == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix in {".jpg", ".jpeg"}:
        return data.startswith(b"\xff\xd8\xff")
    if suffix == ".webp":
        return data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if suffix == ".mp4":
        return data[4:8] == b"ftyp"
    if suffix == ".webm":
        return data.startswith(b"\x1aE\xdf\xa3")
    return False


def validate_media_item(
    item: object,
    post_id: str,
    kind: str,
    expected_media: set[str],
    failures: list[str],
) -> None:
    label = f"feed/posts/{post_id}.json: {kind}"
    if not isinstance(item, dict):
        failures.append(f"{label} entry must be an object")
        return
    expected_keys = IMAGE_KEYS if kind == "image" else VIDEO_KEYS
    if set(item) != expected_keys:
        failures.append(f"{label} keys do not match the schema: {sorted(item)}")
        return
    filename = item.get("fileName")
    if not isinstance(filename, str) or not SAFE_FILENAME.fullmatch(filename):
        failures.append(f"{label} has an unsafe filename: {filename!r}")
        return
    expected_path = f"../media/{post_id}/{filename}"
    if item.get("path") != expected_path:
        failures.append(f"{label} expected path {expected_path!r}, found {item.get('path')!r}")
    if not isinstance(item.get("id"), str) or not item["id"].strip():
        failures.append(f"{label} has no ID")
    text_key = "alt" if kind == "image" else "caption"
    if not isinstance(item.get(text_key), str) or not item[text_key].strip():
        failures.append(f"{label} has no {text_key}")

    relative_media = f"{post_id}/{filename}"
    path = MEDIA / relative_media
    expected_media.add(relative_media)
    if not path.is_file():
        failures.append(f"{label} is missing media/{relative_media}")
        return
    expected_mime = MIME_BY_SUFFIX.get(path.suffix.lower())
    if item.get("contentType") != expected_mime:
        failures.append(
            f"{label} expected contentType {expected_mime!r}, "
            f"found {item.get('contentType')!r}"
        )
    if not has_expected_signature(path):
        failures.append(f"feed/media/{relative_media}: content signature does not match suffix")


def validate_post(
    path: Path,
    summary: dict,
    expected_media: set[str],
    failures: list[str],
) -> None:
    relative = path.relative_to(ROOT).as_posix()
    try:
        post = load_json(path)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        failures.append(f"{relative}: invalid deterministic JSON: {error}")
        return
    if not isinstance(post, dict):
        failures.append(f"{relative}: post must be an object")
        return
    allowed_keys = REQUIRED_POST_KEYS | OPTIONAL_POST_KEYS
    if not REQUIRED_POST_KEYS.issubset(post) or not set(post).issubset(allowed_keys):
        failures.append(f"{relative}: keys do not match the post schema: {sorted(post)}")

    post_id = summary["id"]
    if post.get("schemaVersion") != 1:
        failures.append(f"{relative}: schemaVersion must be 1")
    if post.get("id") != post_id or path.name != f"{post_id}.json":
        failures.append(f"{relative}: post ID, filename, and index ID must match")
    for key in ("id", "title", "project", "status", "createdAt"):
        if post.get(key) != summary.get(key):
            failures.append(f"{relative}: {key} does not match feed/index.json")
    if post.get("visibility") != "public":
        failures.append(f"{relative}: visibility must be public")
    if post.get("status") not in VALID_STATUSES:
        failures.append(f"{relative}: invalid status {post.get('status')!r}")
    if not isinstance(post.get("title"), str) or not post["title"].strip():
        failures.append(f"{relative}: title must be non-empty")
    if not isinstance(post.get("project"), str) or not post["project"].strip():
        failures.append(f"{relative}: project must be non-empty")
    if not isinstance(post.get("body"), str) or not post["body"].strip():
        failures.append(f"{relative}: body must be non-empty")
    elif len(post["body"].encode("utf-8")) > MAX_BODY_BYTES:
        failures.append(f"{relative}: body exceeds {MAX_BODY_BYTES} bytes")
    tags = post.get("tags")
    if not isinstance(tags, list) or not all(isinstance(tag, str) and tag for tag in tags):
        failures.append(f"{relative}: tags must be non-empty strings")
    elif len(tags) != len(set(tags)):
        failures.append(f"{relative}: tags must be unique")
    parse_date(post.get("createdAt"), f"{relative}: createdAt", failures)
    if "updatedAt" in post:
        parse_date(post["updatedAt"], f"{relative}: updatedAt", failures)

    has_cta_label = isinstance(post.get("ctaLabel"), str) and bool(post["ctaLabel"].strip())
    has_cta_url = isinstance(post.get("ctaUrl"), str) and bool(post["ctaUrl"].strip())
    if has_cta_label != has_cta_url:
        failures.append(f"{relative}: ctaLabel and ctaUrl must be supplied together")
    if has_cta_url and urlparse(post["ctaUrl"]).scheme not in {"http", "https"}:
        failures.append(f"{relative}: ctaUrl must be HTTP(S)")

    images = post.get("images")
    videos = post.get("videos")
    if not isinstance(images, list) or len(images) > 4:
        failures.append(f"{relative}: images must be an array of at most 4 entries")
        images = []
    if not isinstance(videos, list) or len(videos) > 2:
        failures.append(f"{relative}: videos must be an array of at most 2 entries")
        videos = []
    for item in images:
        validate_media_item(item, post_id, "image", expected_media, failures)
    for item in videos:
        validate_media_item(item, post_id, "video", expected_media, failures)

    body = post.get("body")
    if isinstance(body, str):
        contains_revision = any(
            any(character.isdigit() for character in match.group())
            for match in SOURCE_REVISION.finditer(body)
        )
        if contains_revision:
            failures.append(f"{relative}: body contains a source-revision fragment")
        declared_paths = {
            item.get("path")
            for item in images + videos
            if isinstance(item, dict) and isinstance(item.get("path"), str)
        }
        for reference in BODY_MEDIA_REFERENCE.findall(body):
            if reference not in declared_paths:
                failures.append(f"{relative}: body references undeclared media {reference}")


def validate_feed() -> tuple[list[str], int, int]:
    failures: list[str] = []
    if not FEED.is_dir() or not POSTS.is_dir() or not MEDIA.is_dir():
        return ["feed/, feed/posts/, and feed/media/ must exist"], 0, 0
    index_path = FEED / "index.json"
    if not index_path.is_file():
        return ["missing feed/index.json"], 0, 0

    try:
        index = load_json(index_path)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        return [f"feed/index.json: invalid deterministic JSON: {error}"], 0, 0
    if not isinstance(index, dict):
        return ["feed/index.json: index must be an object"], 0, 0
    if set(index) != INDEX_KEYS:
        failures.append(f"feed/index.json: keys do not match schema: {sorted(index)}")
    if index.get("schemaVersion") != 1:
        failures.append("feed/index.json: schemaVersion must be 1")
    if index.get("repository") != "RaresKeY/devlog" or index.get("branch") != "main":
        failures.append("feed/index.json: repository and branch must identify public main")

    summaries = index.get("posts")
    if not isinstance(summaries, list) or not summaries:
        return failures + ["feed/index.json: posts must be a non-empty array"], 0, 0

    expected_posts: set[str] = set()
    expected_media: set[str] = set()
    ids: set[str] = set()
    previous_date: datetime | None = None
    for position, summary in enumerate(summaries):
        label = f"feed/index.json: posts[{position}]"
        if not isinstance(summary, dict) or set(summary) != INDEX_POST_KEYS:
            failures.append(f"{label}: keys do not match the index-post schema")
            continue
        post_id = summary.get("id")
        if not isinstance(post_id, str) or not SLUG.fullmatch(post_id):
            failures.append(f"{label}: invalid ID {post_id!r}")
            continue
        if post_id in ids:
            failures.append(f"{label}: duplicate ID {post_id}")
        ids.add(post_id)
        expected_path = f"posts/{post_id}.json"
        if summary.get("path") != expected_path:
            failures.append(f"{label}: expected path {expected_path!r}")
        if not isinstance(summary.get("title"), str) or not summary["title"].strip():
            failures.append(f"{label}: title must be non-empty")
        if not isinstance(summary.get("project"), str) or not summary["project"].strip():
            failures.append(f"{label}: project must be non-empty")
        if summary.get("status") not in VALID_STATUSES:
            failures.append(f"{label}: invalid status {summary.get('status')!r}")
        created_at = parse_date(summary.get("createdAt"), f"{label}: createdAt", failures)
        if created_at is not None and previous_date is not None and created_at > previous_date:
            failures.append(f"{label}: index must be newest-first")
        if created_at is not None:
            previous_date = created_at

        expected_posts.add(f"{post_id}.json")
        post_path = POSTS / f"{post_id}.json"
        if not post_path.is_file():
            failures.append(f"{label}: missing {expected_path}")
        else:
            validate_post(post_path, summary, expected_media, failures)

    actual_posts = relative_files(POSTS)
    for path in sorted(actual_posts - expected_posts):
        failures.append(f"orphan post file is not indexed: feed/posts/{path}")
    for path in sorted(expected_posts - actual_posts):
        failures.append(f"indexed post file is missing: feed/posts/{path}")

    actual_media = relative_files(MEDIA)
    for path in sorted(actual_media - expected_media):
        failures.append(f"orphan media file is not declared by a post: feed/media/{path}")
    for path in sorted(expected_media - actual_media):
        failures.append(f"declared media file is missing: feed/media/{path}")
    for path in sorted(actual_media):
        media_path = MEDIA / path
        if media_path.suffix.lower() not in ALLOWED_MEDIA_SUFFIXES:
            failures.append(f"unexpected media file type: feed/media/{path}")

    feed_files = relative_files(FEED)
    expected_feed_files = {"index.json"} | {
        f"posts/{path}" for path in expected_posts
    } | {f"media/{path}" for path in expected_media}
    for path in sorted(feed_files - expected_feed_files):
        failures.append(f"unexpected feed file: feed/{path}")
    return failures, len(summaries), len(actual_media)


def validate_workflows() -> list[str]:
    failures: list[str] = []
    deploy_path = ROOT / ".github" / "workflows" / "deploy-pages.yml"
    feed_path = ROOT / ".github" / "workflows" / "validate-feed.yml"
    if not deploy_path.is_file() or not feed_path.is_file():
        return ["both Pages and feed-validation workflows are required"]
    deploy = deploy_path.read_text(encoding="utf-8")
    feed = feed_path.read_text(encoding="utf-8")
    for marker in ("- site/**", "- scripts/check_public_bundle.py", "path: site"):
        if marker not in deploy:
            failures.append(f"deploy-pages.yml: required marker is missing: {marker}")
    if "- feed/**" in deploy:
        failures.append("deploy-pages.yml: feed-only changes must not trigger Pages")
    if "- feed/**" not in feed or "python3 scripts/check_public_bundle.py" not in feed:
        failures.append("validate-feed.yml: feed-only validation contract is missing")
    for path, text in ((deploy_path, deploy), (feed_path, feed)):
        for match in re.finditer(r"uses:\s+[^@\s]+@([^\s#]+)", text):
            if not re.fullmatch(r"[0-9a-f]{40}", match.group(1)):
                failures.append(
                    f"{path.name}: action is not pinned to a full commit: {match.group(0)}"
                )
    return failures


def validate_public_boundary(paths: list[Path]) -> list[str]:
    failures: list[str] = []
    for path in paths:
        relative = path.relative_to(ROOT).as_posix()
        if path.is_symlink():
            failures.append(f"symlink is not allowed: {relative}")
            continue
        data = path.read_bytes()
        if len(data) > MAX_FILE_BYTES:
            failures.append(f"{relative}: file exceeds {MAX_FILE_BYTES} bytes")
        for label, pattern in CREDENTIAL_PATTERNS.items():
            if pattern.search(data):
                failures.append(f"{relative}: contains {label} signature")
        for label, pattern in PRIVATE_CONTEXT_PATTERNS.items():
            if pattern.search(data):
                failures.append(f"{relative}: contains {label}")
        if path.suffix.lower() in TEXT_SUFFIXES:
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                failures.append(f"{relative}: text file is not UTF-8")
                continue
            for marker in FORBIDDEN_MARKERS:
                if marker in text:
                    failures.append(f"{relative}: contains forbidden public marker {marker!r}")
            if relative in {"AGENTS.md", "README.md", "specs/deployment.md"}:
                lowered = text.lower()
                for claim in FORBIDDEN_DOC_CLAIMS:
                    if claim in lowered:
                        failures.append(f"{relative}: contains obsolete claim {claim!r}")
    total_size = sum(path.stat().st_size for path in paths)
    if total_size > MAX_PUBLIC_BYTES:
        failures.append(f"public content is {total_size} bytes; limit is {MAX_PUBLIC_BYTES}")
    return failures


def main() -> int:
    failures: list[str] = []
    site_failures, site_count = validate_site()
    feed_failures, post_count, media_count = validate_feed()
    failures.extend(site_failures)
    failures.extend(feed_failures)
    failures.extend(validate_workflows())

    paths = public_files()
    failures.extend(validate_public_boundary(paths))

    if failures:
        print("Public source check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    total_size = sum(path.stat().st_size for path in paths)
    print("Public source check passed.")
    print(f"- Site files: {site_count}")
    print(f"- Feed posts: {post_count}")
    print(f"- Feed media: {media_count}")
    print(f"- Public content size: {total_size} bytes")
    print("- Feed order, post metadata, and media ownership: valid")
    print("- Raw GitHub runtime feed and last-known-good fallback: configured")
    print("- Feed-only commits: validated without Pages artifact deployment")
    print("- Symlinks, credential signatures, private context, and obsolete markers: 0")
    print(f"- Canonical URL: {CANONICAL_URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
