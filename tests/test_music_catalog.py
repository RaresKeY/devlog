from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import check_public_bundle as verifier


class MusicCatalogTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.site = root / "site"
        self.posts = root / "feed" / "posts"
        (self.site / "music" / "btg").mkdir(parents=True)
        self.posts.mkdir(parents=True)
        (self.posts / "soundtrack.json").write_text("{}")
        self.audio = self.site / "music" / "btg" / "01-theme.opus"
        self.audio.write_bytes(b"OggS" + bytes(24) + b"OpusHead" + bytes(20))
        self.track = {
            "id": "btg-01-theme", "title": "Theme", "project": "Hallowmere",
            "album": "Beyond the Gate", "path": "btg/01-theme.opus",
            "duration": 59.179, "contentType": "audio/ogg; codecs=opus",
            "sourcePost": "soundtrack",
        }
        for name, value in (("SITE", self.site), ("POSTS", self.posts)):
            replacement = patch.object(verifier, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)

    def validate(self, tracks=None):
        catalog = {"schemaVersion": 1, "tracks": [self.track] if tracks is None else tracks}
        (self.site / "music" / "index.json").write_text(json.dumps(catalog))
        return verifier.validate_music()

    def test_explicit_track_owns_only_its_declared_opus_file(self):
        failures, owned = self.validate()
        self.assertEqual(failures, [])
        self.assertEqual(owned, {"music/btg/01-theme.opus"})

    def test_rejects_traversal_urls_and_other_audio_formats(self):
        for path in ("../secret.opus", "btg/../../secret.opus", "https://example.com/a.opus", "btg/song.mp3", "btg/a%2fb.opus"):
            with self.subTest(path=path):
                self.track["path"] = path
                failures, owned = self.validate()
                self.assertTrue(any("safe album/track.opus" in error for error in failures))
                self.assertEqual(owned, set())

    def test_rejects_duplicate_identity_and_paths(self):
        failures, _ = self.validate([self.track, copy.deepcopy(self.track)])
        self.assertTrue(any("duplicate track ID" in error for error in failures))
        self.assertTrue(any("duplicate track path" in error for error in failures))

    def test_requires_public_source_post(self):
        self.track["sourcePost"] = "missing"
        failures, _ = self.validate()
        self.assertTrue(any("existing public post" in error for error in failures))

    def test_rejects_nonfinite_nonpositive_and_boolean_durations(self):
        for duration in (float("nan"), float("inf"), 0, -1, True, "59"):
            with self.subTest(duration=duration):
                self.track["duration"] = duration
                failures, _ = self.validate()
                self.assertTrue(any("positive finite seconds" in error for error in failures))

    def test_requires_opus_signature_and_existing_bytes(self):
        self.audio.write_bytes(b"OggS" + bytes(64))
        failures, _ = self.validate()
        self.assertTrue(any("invalid Ogg Opus signature" in error for error in failures))
        self.audio.unlink()
        failures, _ = self.validate()
        self.assertTrue(any("missing Opus file" in error for error in failures))

    def test_rejects_unlisted_audio(self):
        self.validate()
        (self.site / "music" / "btg" / "unlisted.opus").write_bytes(self.audio.read_bytes())
        failures, _ = verifier.validate_site()
        self.assertIn("unexpected site file: music/btg/unlisted.opus", failures)

    def test_empty_catalog_is_valid_without_discovering_audio(self):
        failures, owned = self.validate([])
        self.assertEqual(failures, [])
        self.assertEqual(owned, set())

    def test_optional_shared_artwork_is_owned_once(self):
        self.track["artwork"] = "btg/cover.webp"
        cover = self.site / "music" / "btg" / "cover.webp"
        cover.write_bytes(b"RIFF" + bytes(4) + b"WEBP" + bytes(20))
        second = copy.deepcopy(self.track)
        second["id"] = "another-theme"
        second["path"] = "btg/another.opus"
        (self.site / "music" / second["path"]).write_bytes(self.audio.read_bytes())
        failures, owned = self.validate([self.track, second])
        self.assertEqual(failures, [])
        self.assertEqual(owned, {"music/btg/01-theme.opus", "music/btg/another.opus", "music/btg/cover.webp"})

    def test_rejects_unsafe_and_non_webp_artwork(self):
        for path in ("../cover.webp", "btg/../../cover.webp", "https://example.com/cover.webp", "btg/cover.png", "btg/a%2fb.webp", None):
            with self.subTest(path=path):
                self.track["artwork"] = path
                failures, owned = self.validate()
                self.assertTrue(any("safe album/artwork.webp" in error for error in failures))
                self.assertEqual(owned, {"music/btg/01-theme.opus"})

    def test_requires_existing_small_webp_artwork(self):
        self.track["artwork"] = "btg/cover.webp"
        failures, _ = self.validate()
        self.assertTrue(any("missing music artwork" in error for error in failures))
        cover = self.site / "music" / "btg" / "cover.webp"
        for data in (b"not a webp", b"RIFF" + bytes(4) + b"WEBP" + bytes(128 * 1024)):
            cover.write_bytes(data)
            failures, _ = self.validate()
            self.assertTrue(any("128 KiB or has an invalid WebP" in error for error in failures))


if __name__ == "__main__":
    unittest.main()
