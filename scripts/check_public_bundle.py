#!/usr/bin/env python3
"""Validate the exact public devlog artifact published by GitHub Pages."""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SITE_PREFIX = "/devlog/"
CANONICAL_URL = "https://rareskey.github.io/devlog/"
MAX_BUNDLE_BYTES = 128 * 1024 * 1024
MAX_FILE_BYTES = 32 * 1024 * 1024

REQUIRED_FILES = {
    ".nojekyll",
    "apple-touch-icon.png",
    "favicon-32.png",
    "favicon-512.png",
    "favicon.ico",
    "index.html",
}
ALLOWED_TOP_LEVEL = REQUIRED_FILES | {"assets"}
ALLOWED_SUFFIXES = {
    ".css",
    ".html",
    ".ico",
    ".jpg",
    ".js",
    ".mp4",
    ".png",
    ".webm",
    ".webp",
}
TEXT_SUFFIXES = {".css", ".html", ".js"}

CREDENTIAL_PATTERNS = {
    "AWS access key": re.compile(rb"(?:AKIA|ASIA)[0-9A-Z]{16}"),
    "Firebase API key": re.compile(rb"AIza[0-9A-Za-z_-]{30,}"),
    "GitHub token": re.compile(
        rb"(?:github_pat_[0-9A-Za-z_]{20,}|gh[pousr]_[0-9A-Za-z]{20,})"
    ),
    "OpenAI-style key": re.compile(rb"sk-[A-Za-z0-9_-]{20,}"),
    "private key": re.compile(
        rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
    ),
    "credential URL": re.compile(rb"https?://[^/@\s]+:[^/@\s]+@"),
}
PRIVATE_CONTEXT_PATTERNS = {
    "local filesystem path": re.compile(rb"(?:/home|/Users)/[^/\s]+/"),
    "private tailnet hostname": re.compile(rb"[a-z0-9-]+\.ts\.net"),
    "Firebase Hosting origin": re.compile(rb"small-loop-devlog\.web\.app"),
}
FORBIDDEN_PUBLIC_MARKERS = {
    "Private local tools",
    "Save local update",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SMALL_LOOP_POST_KEY",
}
ASSET_REFERENCE = re.compile(r"/devlog/(assets/[A-Za-z0-9._-]+)")


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


def relative_files() -> set[str]:
    return {
        path.relative_to(SITE).as_posix()
        for path in SITE.rglob("*")
        if path.is_file()
    }


def resolve_reference(page: Path, reference: str) -> Path | None:
    clean_reference = reference.split("#", 1)[0].split("?", 1)[0]
    if clean_reference.startswith(SITE_PREFIX):
        return (SITE / clean_reference.removeprefix(SITE_PREFIX)).resolve()
    if clean_reference.startswith("/"):
        return None
    return (page.parent / clean_reference).resolve()


def validate_html(path: Path) -> list[str]:
    parser = SiteParser()
    parser.feed(path.read_text(encoding="utf-8"))
    failures = [
        f"{path.name}: external runtime asset is not allowed: {reference}"
        for reference in parser.external_runtime_assets
    ]

    for reference in parser.local_references:
        target = resolve_reference(path, reference)
        if target is None:
            failures.append(f"{path.name}: reference has wrong site prefix: {reference}")
        elif not target.is_relative_to(SITE):
            failures.append(f"{path.name}: reference escapes site/: {reference}")
        elif not target.is_file():
            failures.append(f"{path.name}: missing local target: {reference}")

    if parser.canonical_links != [CANONICAL_URL]:
        failures.append(
            f"index.html: expected canonical {CANONICAL_URL!r}, "
            f"found {parser.canonical_links!r}"
        )
    if parser.og_urls != [CANONICAL_URL]:
        failures.append(
            f"index.html: expected og:url {CANONICAL_URL!r}, "
            f"found {parser.og_urls!r}"
        )
    return failures


def main() -> int:
    failures: list[str] = []
    if not SITE.is_dir():
        print("Public bundle check failed: missing site/")
        return 1

    symlinks = [
        path.relative_to(ROOT).as_posix()
        for path in SITE.rglob("*")
        if path.is_symlink()
    ]
    failures.extend(f"symlink is not allowed: {path}" for path in symlinks)

    actual_files = relative_files()
    for path in sorted(REQUIRED_FILES - actual_files):
        failures.append(f"missing expected public file: {path}")

    for relative_path in sorted(actual_files):
        path = SITE / relative_path
        parts = Path(relative_path).parts
        if parts[0] not in ALLOWED_TOP_LEVEL:
            failures.append(f"unexpected public path: {relative_path}")
        if len(parts) > 1 and parts[0] != "assets":
            failures.append(f"unexpected nested public path: {relative_path}")
        if path.name != ".nojekyll" and path.suffix.lower() not in ALLOWED_SUFFIXES:
            failures.append(f"unexpected public file type: {relative_path}")
        if path.suffix == ".map":
            failures.append(f"source map is not allowed: {relative_path}")
        if path.stat().st_size > MAX_FILE_BYTES:
            failures.append(
                f"{relative_path}: file is {path.stat().st_size} bytes; "
                f"limit is {MAX_FILE_BYTES}"
            )

    bundle_size = sum(
        path.stat().st_size for path in SITE.rglob("*") if path.is_file()
    )
    if bundle_size > MAX_BUNDLE_BYTES:
        failures.append(
            f"bundle is {bundle_size} bytes; limit is {MAX_BUNDLE_BYTES}"
        )

    combined_text = ""
    for relative_path in sorted(actual_files):
        path = SITE / relative_path
        data = path.read_bytes()
        for label, pattern in CREDENTIAL_PATTERNS.items():
            if pattern.search(data):
                failures.append(f"{relative_path}: contains {label} signature")
        for label, pattern in PRIVATE_CONTEXT_PATTERNS.items():
            if pattern.search(data):
                failures.append(f"{relative_path}: contains {label}")
        if path.suffix.lower() in TEXT_SUFFIXES:
            combined_text += data.decode("utf-8") + "\n"

    for marker in sorted(FORBIDDEN_PUBLIC_MARKERS):
        if marker in combined_text:
            failures.append(f"public bundle contains forbidden marker: {marker}")
    if "Published from Git" not in combined_text:
        failures.append("public Git-backed feed marker is missing")

    for asset_path in sorted(set(ASSET_REFERENCE.findall(combined_text))):
        if not (SITE / asset_path).is_file():
            failures.append(f"compiled bundle references missing asset: {asset_path}")

    index_path = SITE / "index.html"
    if index_path.is_file():
        failures.extend(validate_html(index_path))

    if failures:
        print("Public bundle check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Public bundle check passed.")
    print(f"- Files: {len(actual_files)}")
    print(f"- Size: {bundle_size} bytes")
    print("- Symlinks: 0")
    print("- External runtime assets: 0")
    print("- Local references: resolved beneath /devlog/")
    print("- Credential, private-context, Firebase, and admin markers: 0")
    print(f"- Canonical URL: {CANONICAL_URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
