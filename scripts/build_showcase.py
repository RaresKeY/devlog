#!/usr/bin/env python3
"""Build a silent, gapless scrolling showcase from public feed attachments."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FPS = 12
CLIP_FPS = 6
LOOP_SECONDS = 120


@dataclass(frozen=True)
class Source:
    post_id: str
    filename: str
    kind: str
    path: Path
    width: int
    height: int
    sha256: str


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
    for summary in index["posts"]:
        post = json.loads((root / "feed" / summary["path"]).read_text())
        for kind, entries in (("image", post["images"]), ("video", post["videos"])):
            for media in entries:
                path = root / "feed/media" / post["id"] / media["fileName"]
                if kind == "image":
                    with Image.open(path) as image:
                        width, height = image.size
                else:
                    probe = json.loads(subprocess.check_output([
                        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height", "-of", "json", str(path)], text=True))
                    width, height = (probe["streams"][0][key] for key in ("width", "height"))
                result.append(Source(post["id"], media["fileName"], kind, path, width, height, digest(path)))
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
    command = ["ffmpeg", "-v", "error", "-nostdin", "-threads", "2", "-stream_loop", "-1", "-ss", "1",
               "-i", str(source.path), "-map", "0:v:0", "-an", "-vf",
               f"fps={CLIP_FPS},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
               "-frames:v", "30", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    raw = subprocess.check_output(command)
    size = width * height * 3
    frames = [Image.frombytes("RGB", (width, height), raw[start:start + size]) for start in range(0, len(raw), size)]
    if len(frames) != 30:
        raise ValueError("Video preview extraction did not produce the complete clip")
    # A one-second crossfade produces a four-second cyclic clip with no hard cut.
    return frames[6:24] + [Image.blend(frames[24 + i], frames[i], (i + 1) / 7) for i in range(6)]


def render(sources, output: Path, variant: str, *, preview_seconds: int | None, av1: bool):
    from PIL import Image
    width, height, columns, cell_width, cell_height = ((1024, 768, 8, 128, 96) if variant == "landscape" else (576, 1024, 6, 96, 96))
    tiles, rows = pack(sources, columns, cell_width / cell_height, 20261018 + width)
    board_height = rows * cell_height
    frames = []
    for i, tile in enumerate(tiles):
        frames.append(tile_frames(sources[tile.source], tile.width * cell_width, tile.height * cell_height))
        if i % 20 == 0:
            print(f"{variant}: prepared {i + 1}/{len(tiles)} tiles", flush=True)
    seconds = preview_seconds or LOOP_SECONDS
    count = seconds * FPS
    paths = [("h264", output / f"{variant}.mp4")]
    if av1:
        paths.append(("av1", output / f"{variant}-av1.mp4"))
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{width}x{height}", "-r", str(FPS), "-i", "pipe:0"]
    for codec, path in paths:
        command += ["-map", "0:v:0", "-an", "-pix_fmt", "yuv420p"]
        if codec == "h264":
            command += ["-c:v", "libx264", "-preset", "slow", "-crf", "29", "-threads", "6", "-profile:v", "main", "-level:v", "3.1"]
        else:
            command += ["-c:v", "libsvtav1", "-preset", "8", "-crf", "40", "-svtav1-params", "lp=6", "-tag:v", "av01"]
        command += ["-g", str(FPS * 4), "-movflags", "+faststart", str(path)]
    with tempfile.TemporaryFile() as log:
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        try:
            for frame_index in range(count):
                offset = (frame_index * board_height) // (LOOP_SECONDS * FPS)
                canvas = Image.new("RGB", (width, height))
                for tile, images in zip(tiles, frames):
                    top = (tile.y * cell_height - offset) % board_height
                    image = images[(frame_index * CLIP_FPS // FPS + tile.source * 5) % len(images)]
                    for y in range(top - board_height, height, board_height):
                        if y < height and y + image.height > 0:
                            canvas.paste(image, (tile.x * cell_width, y))
                if frame_index == 0:
                    canvas.save(output / f"{variant}.webp", quality=78, method=6)
                encoder.stdin.write(canvas.tobytes())
                if frame_index % (FPS * 10) == 0:
                    print(f"{variant}: rendered {frame_index // FPS}/{seconds} seconds", flush=True)
            encoder.stdin.close()
            if encoder.wait() != 0:
                log.seek(0)
                raise RuntimeError(log.read().decode(errors="replace")[-4000:])
        except BaseException:
            encoder.kill()
            encoder.wait()
            raise
    result = {"width": width, "height": height, "fps": FPS, "duration": seconds, "poster": f"{variant}.webp", "encodings": [],
              "layout": {"columns": columns, "rows": rows, "cellWidth": cell_width, "cellHeight": cell_height,
                         "tiles": [{"source": tile.source, "x": tile.x, "y": tile.y, "width": tile.width, "height": tile.height} for tile in tiles]}}
    for codec, path in paths:
        result["encodings"].append({"codec": codec, "path": path.name, "bytes": path.stat().st_size, "sha256": digest(path)})
    print(f"{variant}: " + ", ".join(f'{item["codec"]} {item["bytes"]:,} bytes' for item in result["encodings"]), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "site/showcase")
    parser.add_argument("--preview-seconds", type=int)
    parser.add_argument("--av1", action="store_true")
    parser.add_argument("--variant", choices=("landscape", "portrait", "both"), default="both")
    args = parser.parse_args()
    if args.preview_seconds is not None and not 1 <= args.preview_seconds <= LOOP_SECONDS:
        parser.error("Preview length must be from 1 to 120 seconds")
    if args.preview_seconds is None and (args.av1 or args.variant != "both"):
        parser.error("Production builds require both H.264 variants; codec comparisons are preview-only")
    output = args.output.resolve()
    if not output.is_relative_to(ROOT) or output.exists():
        raise ValueError("Choose a new output directory inside this project")
    sources = inventory(ROOT)
    if not sources:
        raise ValueError("There are no public image/video attachments")
    output.mkdir(parents=True)
    manifest = {"schemaVersion": 1, "preview": args.preview_seconds is not None,
                "sources": [{"postId": item.post_id, "fileName": item.filename, "kind": item.kind, "sha256": item.sha256} for item in sources], "variants": {}}
    for variant in (("landscape", "portrait") if args.variant == "both" else (args.variant,)):
        manifest["variants"][variant] = render(sources, output, variant, preview_seconds=args.preview_seconds, av1=args.av1)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
