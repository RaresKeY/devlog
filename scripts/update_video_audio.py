#!/usr/bin/env python3
"""Record actual audio-stream presence for indexed public videos using ffprobe."""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    index = json.loads((ROOT / "feed/index.json").read_text())
    videos = changed = silent = 0
    for summary in index["posts"]:
        path = ROOT / "feed/posts" / f"{summary['id']}.json"
        post = json.loads(path.read_text())
        dirty = False
        for video in post["videos"]:
            media = ROOT / "feed/media" / post["id"] / video["fileName"]
            probe = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
                "stream=index", "-of", "json", str(media)], text=True))
            has_audio = bool(probe["streams"])
            videos += 1
            silent += not has_audio
            if video.get("hasAudio") is not has_audio:
                dirty = True
                changed += 1
                video["hasAudio"] = has_audio
                if args.check:
                    print(f"Audio metadata needs refresh: {post['id']}/{video['fileName']}")
        if dirty and args.write:
            path.write_text(json.dumps(post, indent=2, ensure_ascii=False) + "\n")
    print(f"Checked {videos} videos: {silent} without audio streams, {videos - silent} with audio.")
    if args.check and changed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
