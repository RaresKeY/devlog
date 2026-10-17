// Cover the viewport after rotation, then repeat complete boards without a seam.
export function fitPlane(width, height, board) {
  const angle = -8;
  const radians = Math.abs(angle) * Math.PI / 180;
  const planeWidth = Math.ceil(width * Math.cos(radians) + height * Math.sin(radians)) + 4;
  const planeHeight = Math.ceil(width * Math.sin(radians) + height * Math.cos(radians)) + 4;
  const boardHeight = Math.ceil(board.height * planeWidth / board.width);
  return { angle, width: planeWidth, height: planeHeight, boardHeight,
    copies: Math.ceil(planeHeight / boardHeight) + 1,
    duration: boardHeight / (width <= 640 ? 9 : 12) * 1000 };
}

export function validateManifest(data) {
  if (data?.schemaVersion !== 2 || data.preview !== false || !Array.isArray(data.sources) ||
      data.sources.length < 1 || data.sources.length > 32 || !data.variants) throw new Error("Invalid showcase manifest");
  let total = 0;
  for (const name of ["landscape", "portrait"]) {
    const variant = data.variants[name];
    const layout = variant?.layout;
    if (!variant || !Number.isInteger(variant.width) || variant.width < 128 || variant.width > 1024 ||
        !Number.isInteger(variant.height) || variant.height < 128 || variant.height > 4096 ||
        !layout || !Number.isInteger(layout.columns) || layout.columns < 1 || layout.columns > 8 ||
        !Number.isInteger(layout.rows) || layout.rows < 1 || layout.rows > 48 ||
        ![layout.cellWidth, layout.cellHeight].every((n) => Number.isInteger(n) && n >= 32 && n <= 256) ||
        layout.columns * layout.cellWidth !== variant.width || layout.rows * layout.cellHeight !== variant.height ||
        !Array.isArray(layout.tiles) || layout.tiles.length > 128 || !Array.isArray(variant.clips) || variant.clips.length > 16) {
      throw new Error("Invalid showcase layout");
    }
    const cells = new Set();
    const shown = new Set();
    for (const tile of layout.tiles) {
      if (![tile.source, tile.x, tile.y, tile.width, tile.height].every(Number.isInteger) ||
          tile.source < 0 || tile.source >= data.sources.length || tile.x < 0 || tile.y < 0 ||
          tile.width < 1 || tile.width > 3 || tile.height < 1 || tile.height > 3 ||
          tile.x + tile.width > layout.columns || tile.y + tile.height > layout.rows) throw new Error("Invalid showcase tile");
      shown.add(tile.source);
      for (let y = tile.y; y < tile.y + tile.height; y++) for (let x = tile.x; x < tile.x + tile.width; x++) {
        const key = y * layout.columns + x;
        if (cells.has(key)) throw new Error("Overlapping showcase tiles");
        cells.add(key);
      }
    }
    if (cells.size !== layout.columns * layout.rows || shown.size !== data.sources.length) throw new Error("Incomplete showcase");
    const paths = new Set();
    let bytes = 0;
    const checkAsset = (asset, pattern, limit, maxDimension) => {
      if (!asset || !pattern.test(asset.path) || paths.has(asset.path) ||
          !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > limit ||
          !/^[0-9a-f]{64}$/.test(asset.sha256) ||
          ![asset.width, asset.height].every((n) => Number.isInteger(n) && n > 0 && n <= maxDimension)) throw new Error("Invalid showcase asset");
      paths.add(asset.path);
      bytes += asset.bytes;
    };
    checkAsset(variant.atlas, new RegExp(`^${name}-atlas\\.webp$`), 512 * 1024, 4096);
    checkAsset(variant.poster, new RegExp(`^${name}\\.webp$`), 256 * 1024, 2048);
    if (variant.atlas.width !== variant.width || variant.atlas.height !== variant.height) throw new Error("Invalid atlas dimensions");
    const clips = new Set();
    for (const clip of variant.clips) {
      checkAsset(clip, new RegExp(`^${name}-[0-9]{2}\\.mp4$`), 256 * 1024, 512);
      if (!Number.isInteger(clip.source) || clip.source < 0 || clip.source >= data.sources.length ||
          data.sources[clip.source].kind !== "video" || clips.has(clip.source) || clip.fps !== 24 || clip.duration !== 6) throw new Error("Invalid showcase preview");
      if (clip.path !== `${name}-${String(clip.source).padStart(2, "0")}.mp4`) throw new Error("Invalid preview ownership");
      clips.add(clip.source);
    }
    if (data.sources.some((source, i) => !["image", "video"].includes(source.kind) || (source.kind === "video" && !clips.has(i))) || bytes > 3 * 1024 * 1024) throw new Error("Showcase exceeds its budget");
    total += bytes;
  }
  if (total > 6 * 1024 * 1024) throw new Error("Showcase cache exceeds its budget");
  return data;
}
