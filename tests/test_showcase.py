from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import build_showcase
from scripts import check_public_bundle as verifier


class PackingTests(unittest.TestCase):
    def test_responsive_poster_paths_are_checked(self):
        parser = verifier.SiteParser()
        parser.feed('<source srcset="./showcase/portrait.webp 1x, ./showcase/portrait-large.webp 2x">')
        self.assertEqual(parser.local_references, ["./showcase/portrait.webp", "./showcase/portrait-large.webp"])

    def test_external_responsive_poster_is_not_treated_as_a_local_link(self):
        parser = verifier.SiteParser()
        parser.feed('<source srcset="https://example.com/image.webp">')
        self.assertEqual(parser.external_runtime_assets, ["https://example.com/image.webp"])

    def test_irregular_grid_is_gapless_and_contains_every_source(self):
        sources = [build_showcase.Source("post", f"{i}.png", "image", Path("unused"), width, height, "0" * 64)
                   for i, (width, height) in enumerate([(1920, 1080), (900, 1400), (800, 800), (2400, 700)] * 27)]
        for columns, aspect in ((8, 4 / 3), (6, 1), (1, 1)):
            with self.subTest(columns=columns):
                tiles, rows = build_showcase.pack(sources, columns, aspect, 14)
                cells = {}
                for tile in tiles:
                    self.assertGreaterEqual(tile.x, 0)
                    self.assertLessEqual(tile.x + tile.width, columns)
                    for y in range(tile.y, tile.y + tile.height):
                        for x in range(tile.x, tile.x + tile.width):
                            cells[x, y] = cells.get((x, y), 0) + 1
                self.assertEqual(set(cells), {(x, y) for y in range(rows) for x in range(columns)})
                self.assertEqual(set(cells.values()), {1})
                self.assertEqual({tile.source for tile in tiles}, set(range(len(sources))))
                self.assertEqual((tiles, rows), build_showcase.pack(sources, columns, aspect, 14))


class ShowcaseManifestTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.site = root / "site"
        self.media = root / "feed/media"
        folder = self.site / "showcase"
        folder.mkdir(parents=True)
        (self.media / "sample").mkdir(parents=True)
        (self.media / "sample/image.png").write_bytes(b"public image")
        (self.media / "sample/clip.mp4").write_bytes(b"public video")
        self.manifest = {"schemaVersion": 2, "preview": False, "sources": [
            {"postId": "sample", "fileName": filename, "kind": kind, "sha256": "0" * 64}
            for filename, kind in (("image.png", "image"), ("clip.mp4", "video"))], "variants": {}}
        for name, width, height, columns, cell_width in (("landscape", 1024, 768, 8, 128), ("portrait", 576, 1024, 6, 96)):
            video = folder / f"{name}-01.mp4"
            video.write_bytes(bytes(4) + b"ftypisom" + bytes(20))
            (folder / f"{name}.webp").write_bytes(b"RIFF" + bytes(4) + b"WEBP" + bytes(20))
            (folder / f"{name}-atlas.webp").write_bytes(b"RIFF" + bytes(4) + b"WEBP" + bytes(20))
            def image_asset(filename, w, h):
                path = folder / filename
                return {"path": filename, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "width": w, "height": h}
            self.manifest["variants"][name] = {
                "width": width, "height": 192,
                "atlas": image_asset(f"{name}-atlas.webp", width, 192),
                "poster": image_asset(f"{name}.webp", width, height),
                "clips": [{"source": 1, "path": video.name, "width": cell_width, "height": 96, "fps": 24, "duration": 6,
                    "bytes": video.stat().st_size, "sha256": hashlib.sha256(video.read_bytes()).hexdigest()}],
                "layout": {"columns": columns, "rows": 2, "cellWidth": cell_width, "cellHeight": 96,
                    "tiles": [{"source": x % 2, "x": x, "y": y, "width": 1, "height": 1} for y in range(2) for x in range(columns)]}}
        for name, value in (("SITE", self.site), ("MEDIA", self.media)):
            replacement = patch.object(verifier, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)

    def validate(self):
        (self.site / "showcase/manifest.json").write_text(json.dumps(self.manifest))
        return verifier.validate_showcase()

    def test_accepts_complete_verified_variants_and_exact_asset_ownership(self):
        failures, files = self.validate()
        self.assertEqual(failures, [])
        self.assertEqual(files, {f"showcase/{name}{suffix}" for name in ("landscape", "portrait") for suffix in ("-01.mp4", ".webp", "-atlas.webp")})

    def test_rejects_incomplete_preview_builds(self):
        self.manifest["preview"] = True
        self.assertTrue(any("production manifest" in item for item in self.validate()[0]))

    def test_rejects_remote_and_traversal_video_paths(self):
        for path in ("../private.mp4", "https://example.com/video.mp4", "portrait.mp4"):
            with self.subTest(path=path):
                self.manifest["variants"]["landscape"]["clips"][0]["path"] = path
                self.assertTrue(any("unsafe asset path" in item for item in self.validate()[0]))

    def test_rejects_oversized_declared_video_without_allocating_large_fixture(self):
        self.manifest["variants"]["landscape"]["clips"][0]["bytes"] = 256 * 1024 + 1
        self.assertTrue(any("byte limit" in item for item in self.validate()[0]))

    def test_rejects_changed_video_bytes(self):
        path = self.site / "showcase/landscape-01.mp4"
        data = path.read_bytes()
        path.write_bytes(data[:-1] + b"x")
        self.assertTrue(any("asset identity" in item for item in self.validate()[0]))

    def test_rejects_missing_preview_for_selected_video(self):
        self.manifest["variants"]["landscape"]["clips"] = []
        self.assertTrue(any("preview is missing" in item for item in self.validate()[0]))

    def test_rejects_atlas_dimension_drift(self):
        self.manifest["variants"]["landscape"]["atlas"]["width"] = 256
        self.assertTrue(any("dimensions do not match" in item for item in self.validate()[0]))

    def test_rejects_grid_gaps_and_overlaps(self):
        tiles = self.manifest["variants"]["landscape"]["layout"]["tiles"]
        tiles.pop()
        self.assertTrue(any("gaps in grid" in item for item in self.validate()[0]))
        tiles.append(copy.deepcopy(tiles[0]))
        self.assertTrue(any("overlapping tiles" in item for item in self.validate()[0]))

    def test_rejects_source_that_never_appears(self):
        for tile in self.manifest["variants"]["portrait"]["layout"]["tiles"]:
            tile["source"] = 0
        self.assertTrue(any("never appears" in item for item in self.validate()[0]))

    def test_rejects_invalid_source_indexes(self):
        self.manifest["variants"]["portrait"]["layout"]["tiles"][0]["source"] = 999
        self.assertTrue(any("invalid tile" in item for item in self.validate()[0]))

    def test_snapshot_does_not_block_later_source_byte_updates(self):
        (self.media / "sample/image.png").write_bytes(b"a later publicly reviewed replacement")
        self.assertEqual(self.validate()[0], [])

    def test_rejects_missing_or_duplicate_source_identity(self):
        self.manifest["sources"][0]["fileName"] = "missing.png"
        self.assertTrue(any("source media is missing" in item for item in self.validate()[0]))
        self.manifest["sources"][0] = copy.deepcopy(self.manifest["sources"][1])
        self.assertTrue(any("duplicate source" in item for item in self.validate()[0]))


if __name__ == "__main__":
    unittest.main()
