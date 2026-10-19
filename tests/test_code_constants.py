"""Hexadecimal code literals must not be mistaken for private commit IDs."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "public_bundle", Path(__file__).resolve().parents[1] / "scripts/check_public_bundle.py"
)
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class CodeConstantTests(unittest.TestCase):
    def test_explicit_hex_literals_are_not_source_revisions(self):
        for text in ("-0x3d70a3d7", "0x51eb851U", "0xa3d70a3", "0Xabcdef01ULL"):
            with self.subTest(text=text):
                self.assertIsNone(bundle.SOURCE_REVISION.search(text))

    def test_bare_commit_fragments_still_match(self):
        for text in ("revision abcdef012345", "`1234abc`", "sha: 0abcdef", "0xnothex abc1234"):
            with self.subTest(text=text):
                self.assertIsNotNone(bundle.SOURCE_REVISION.search(text))
