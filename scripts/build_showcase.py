#!/usr/bin/env python3
"""Build a curated image atlas and small, seamless video previews."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FPS = 24
LOOP_SECONDS = 6


@dataclass(frozen=True)
class Source:
    post_id: str
    filename: str
    kind: str
    path: Path
    width: int
    height: int
    sha256: str
    start: float = 0


@dataclass(frozen=True)
class Tile:
    source: int
    x: int
    y: int
    width: int
    height: int


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(root: Path) -> list[Source]:
    from PIL import Image
    result = []
    index = json.loads((root / "feed/index.json").read_text())
    indexed = {item["id"] for item in index["posts"]}
    selection = json.loads((root / "scripts/showcase_selection.json").read_text())
    if selection.get("schemaVersion") != 1 or not 1 <= len(selection.get("sources", [])) <= 32:
        raise ValueError("Choose between one and 32 public attachments")
    if sum(item.get("kind") == "video" for item in selection["sources"]) > 16:
        raise ValueError("Choose at most 16 video previews")
    seen = set()
    for item in selection["sources"]:
        post_id, filename, kind = (item[key] for key in ("postId", "fileName", "kind"))
        if (post_id not in indexed or kind not in {"image", "video"} or
                not re.fullmatch(r"[A-Za-z0-9._-]+", filename) or (post_id, filename) in seen):
            raise ValueError("Selection must identify unique indexed media")
        seen.add((post_id, filename))
        post = json.loads((root / "feed/posts" / f"{post_id}.json").read_text())
        if filename not in {media["fileName"] for media in post[kind + "s"]}:
            raise ValueError("Selected attachment is not declared by its post")
        path = root / "feed/media" / post_id / filename
        start = item.get("start", 0)
        if isinstance(start, bool) or not isinstance(start, (int, float)) or not math.isfinite(start) or start < 0:
            raise ValueError("Clip start must be finite nonnegative seconds")
        if kind == "image":
            with Image.open(path) as image:
                width, height = image.size
        else:
            probe = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                "stream=width,height:format=duration", "-of", "json", str(path)], text=True))
            width, height = (probe["streams"][0][key] for key in ("width", "height"))
            start = min(start, max(0, float(probe["format"]["duration"]) - LOOP_SECONDS - 1))
        result.append(Source(post_id, filename, kind, path, width, height, digest(path), start))
    return result


def pack(sources: list[Source], columns: int, cell_aspect: float, seed: int) -> tuple[list[Tile], int]:
    """Fill every cell, placing every attachment before using any repeats."""
    rng = random.Random(seed)
    order = list(range(len(sources)))
    rng.shuffle(order)
    occupied: set[tuple[int, int]] = set()
    tiles = []

    def free(x, y, width, height):
        return x + width <= columns and all((xx, yy) not in occupied for yy in range(y, y + height) for xx in range(x, x + width))

    def place(source, x, y, width, height):
        tiles.append(Tile(source, x, y, width, height))
        occupied.update((xx, yy) for yy in range(y, y + height) for xx in range(x, x + width))

    for index in order:
        source = sources[index]
        y = 0
        while all((x, y) in occupied for x in range(columns)):
            y += 1
        x = next(x for x in range(columns) if (x, y) not in occupied)
        aspect = source.width / source.height
        candidates = [(2, 1), (3, 2), (2, 2), (1, 2), (2, 3), (3, 1), (1, 1)]
        candidates = [size for size in candidates if free(x, y, *size)]
        # Match broad source orientation while retaining an irregular arrangement.
        candidates.sort(key=lambda size: abs(math.log((size[0] / size[1] * cell_aspect) / aspect)) + rng.random() * 0.7)
        width, height = candidates[0]
        place(index, x, y, width, height)

    rows = max(tile.y + tile.height for tile in tiles)
    for y in range(rows):
        for x in range(columns):
            if (x, y) not in occupied:
                place(rng.randrange(len(sources)), x, y, 1, 1)
    return tiles, rows


def tile_frames(source: Source, width: int, height: int):
    from PIL import Image, ImageOps
    if source.kind == "image":
        with Image.open(source.path) as image:
            return [ImageOps.fit(ImageOps.exif_transpose(image).convert("RGB"), (width, height), method=Image.Resampling.LANCZOS)]
    command = ["ffmpeg", "-v", "error", "-nostdin", "-threads", "2", "-stream_loop", "-1", "-ss", str(source.start),
               "-i", str(source.path), "-map", "0:v:0", "-an", "-vf",
               f"fps={FPS},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
               "-frames:v", str((LOOP_SECONDS + 1) * FPS), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    raw = subprocess.check_output(command)
    size = width * height * 3
    frames = [Image.frombytes("RGB", (width, height), raw[start:start + size]) for start in range(0, len(raw), size)]
    if len(frames) != (LOOP_SECONDS + 1) * FPS:
        raise ValueError("Video preview extraction did not produce the complete clip")
    # Preserve continuous motion at the loop boundary through a one-second blend.
    return frames[FPS:LOOP_SECONDS * FPS] + [
        Image.blend(frames[LOOP_SECONDS * FPS + i], frames[i], (i + 1) / (FPS + 1)) for i in range(FPS)]


def encode(frames, path: Path, width: int, height: int):
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{width}x{height}", "-r", str(FPS), "-i", "pipe:0", "-an", "-pix_fmt", "yuv420p",
               "-c:v", "libx264", "-preset", "slow", "-crf", "29", "-threads", "2", "-profile:v", "main", "-level:v", "3.1",
               "-g", str(FPS * 2), "-movflags", "+faststart", str(path)]
    with tempfile.TemporaryFile() as log:
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        try:
            for frame in frames:
                encoder.stdin.write(frame.tobytes())
            encoder.stdin.close()
            if encoder.wait() != 0:
                log.seek(0)
                raise RuntimeError(log.read().decode(errors="replace")[-4000:])
        except BaseException:
            encoder.kill()
            encoder.wait()
            raise
    return {"path": path.name, "bytes": path.stat().st_size, "sha256": digest(path), "width": width, "height": height}


def render(sources, output: Path, variant: str, *, compare_video: bool):
    from PIL import Image, ImageOps
    columns, cell_width, cell_height = (6, 128, 96) if variant == "landscape" else (4, 96, 96)
    tiles, rows = pack(sources, columns, cell_width / cell_height, 20261018 + columns)
    width, height = columns * cell_width, rows * cell_height
    prepared = {}
    clips = []
    for index, source in enumerate(sources):
        owned = [tile for tile in tiles if tile.source == index]
        w, h = max(tile.width for tile in owned) * cell_width, max(tile.height for tile in owned) * cell_height
        prepared[index] = tile_frames(source, w, h)
        if source.kind == "video":
            clip = encode(prepared[index], output / f"{variant}-{index:02}.mp4", w, h)
            clips.append({"source": index, **clip, "fps": FPS, "duration": LOOP_SECONDS})

    def board_frames():
        for frame_index in range(LOOP_SECONDS * FPS):
            board = Image.new("RGB", (width, height))
            for tile in tiles:
                images = prepared[tile.source]
                image = ImageOps.fit(images[frame_index % len(images)], (tile.width * cell_width, tile.height * cell_height))
                board.paste(image, (tile.x * cell_width, tile.y * cell_height))
            yield board

    atlas = next(board_frames())
    atlas_path = output / f"{variant}-atlas.webp"
    atlas.save(atlas_path, quality=78, method=6)
    poster = ImageOps.fit(atlas, (1024, 768) if variant == "landscape" else (576, 1024))
    poster_path = output / f"{variant}.webp"
    poster.save(poster_path, quality=76, method=6)
    if compare_video:
        encode(board_frames(), output / f"{variant}-board.mp4", width, height)

    def image_asset(path, image):
        return {"path": path.name, "bytes": path.stat().st_size, "sha256": digest(path), "width": image.width, "height": image.height}
    result = {"width": width, "height": height, "atlas": image_asset(atlas_path, atlas), "poster": image_asset(poster_path, poster), "clips": clips,
              "layout": {"columns": columns, "rows": rows, "cellWidth": cell_width, "cellHeight": cell_height,
                         "tiles": [{"source": tile.source, "x": tile.x, "y": tile.y, "width": tile.width, "height": tile.height} for tile in tiles]}}
    print(f"{variant}: atlas {result['atlas']['bytes']:,} bytes, {len(clips)} clips {sum(item['bytes'] for item in clips):,} bytes", flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "site/showcase")
    parser.add_argument("--compare-video", action="store_true", help="Add matched full-board videos for a private renderer comparison")
    args = parser.parse_args()
    output = args.output.resolve()
    if not output.is_relative_to(ROOT) or output.exists():
        raise ValueError("Choose a new output directory inside this project")
    sources = inventory(ROOT)
    if not sources:
        raise ValueError("There are no public image/video attachments")
    output.mkdir(parents=True)
    manifest = {"schemaVersion": 2, "preview": args.compare_video,
                "sources": [{"postId": item.post_id, "fileName": item.filename, "kind": item.kind, "sha256": item.sha256} for item in sources], "variants": {}}
    for variant in ("landscape", "portrait"):
        manifest["variants"][variant] = render(sources, output, variant, compare_video=args.compare_video)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
