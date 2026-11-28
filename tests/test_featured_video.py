import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import check_public_bundle as verifier


class FeaturedVideoTests(unittest.TestCase):
    def validate(self, image_count, video_count, **layout):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            media = root / "media" / "sample"
            media.mkdir(parents=True)
            summary = dict(id="sample", title="Sample", project="Test", status="wip",
                           createdAt="2026-11-28T00:00:00Z")
            post = dict(summary, schemaVersion=1, visibility="public", tags=[],
                        images=[], videos=[], body="Gallery layout.", **layout)
            for i in range(image_count):
                name = f"still-{i}.jpg"
                (media / name).write_bytes(b"\xff\xd8\xff")
                post["images"].append(dict(id=f"still-{i}", fileName=name,
                                           path=f"../media/sample/{name}",
                                           contentType="image/jpeg", alt="Door"))
            for i in range(video_count):
                name = f"video-{i}.mp4"
                (media / name).write_bytes(bytes(4) + b"ftypisom")
                post["videos"].append(dict(id=f"video-{i}", fileName=name,
                                           path=f"../media/sample/{name}",
                                           contentType="video/mp4", caption="Door motion"))
            path = root / "sample.json"
            path.write_text(json.dumps(post))
            failures = []
            with patch.multiple(verifier, ROOT=root, MEDIA=media.parent):
                verifier.validate_post(path, summary, set(), failures)
            return "\n".join(failures)

    def test_video_lead_allows_six_images(self):
        self.assertEqual(self.validate(6, 1, featuredVideo=True), "")
        self.assertIn("at most 6", self.validate(7, 1, featuredVideo=True))

    def test_default_keeps_five_image_limit(self):
        self.assertEqual(self.validate(5, 1), "")
        self.assertIn("at most 5", self.validate(6, 1))
        self.assertIn("at most 5", self.validate(6, 1, featuredVideo=False))

    def test_featured_video_requires_one_video_and_a_boolean_flag(self):
        for video_count in (0, 2):
            with self.subTest(video_count=video_count):
                self.assertIn("requires exactly one video", self.validate(3, video_count, featuredVideo=True))
        for value in ("true", 1, None):
            with self.subTest(value=value):
                self.assertIn("must be a boolean", self.validate(3, 1, featuredVideo=value))
