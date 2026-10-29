from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import check_public_bundle as verifier


class VideoAudioTests(unittest.TestCase):
    def test_published_videos_declare_audio_stream_presence(self):
        root = Path(__file__).resolve().parents[1]
        index = json.loads((root / "feed/index.json").read_text())
        for summary in index["posts"]:
            post = json.loads((root / "feed/posts" / f"{summary['id']}.json").read_text())
            for video in post["videos"]:
                with self.subTest(post=post["id"], video=video["fileName"]):
                    self.assertIs(type(video.get("hasAudio")), bool,
                                  "Measure new videos with scripts/update_video_audio.py --write")

    def test_optional_audio_stream_flag_accepts_booleans_and_legacy_omission(self):
        for value in (True, False, "omitted"):
            self.assertEqual(self.validate(value), [])

    def test_rejects_ambiguous_audio_flags(self):
        for value in (None, 0, 1, "false", [], {}):
            with self.subTest(value=value):
                self.assertTrue(any("hasAudio must be a boolean" in error for error in self.validate(value)))

    def test_optional_loop_flag_accepts_booleans_and_legacy_omission(self):
        for value in (True, False, "omitted"):
            self.assertEqual(self.validate(value, "loop"), [])

    def test_rejects_ambiguous_loop_flags(self):
        for value in (None, 0, 1, "false", [], {}):
            with self.subTest(value=value):
                self.assertTrue(any("loop must be a boolean" in error
                                    for error in self.validate(value, "loop")))

    def validate(self, value, field="hasAudio"):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "sample").mkdir()
            (root / "sample/clip.mp4").write_bytes(bytes(4) + b"ftypisom" + bytes(20))
            item = {"id": "clip", "path": "../media/sample/clip.mp4", "fileName": "clip.mp4",
                    "caption": "Clip", "contentType": "video/mp4"}
            if value != "omitted":
                item[field] = value
            failures = []
            with patch.object(verifier, "MEDIA", root):
                verifier.validate_media_item(item, "sample", "video", set(), failures)
            return failures
