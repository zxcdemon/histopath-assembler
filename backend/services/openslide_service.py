"""OpenSlide-backed WSI reader with Pillow fallback for raster images."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from PIL import Image

try:
    import openslide  # type: ignore

    _OPENSLIDE_OK = True
    _OPENSLIDE_ERR: str | None = None
except Exception as e:  # noqa: BLE001
    openslide = None  # type: ignore
    _OPENSLIDE_OK = False
    _OPENSLIDE_ERR = str(e)


class WSIUnavailable(RuntimeError):
    """Raised when a file cannot be handled by OpenSlide."""


class OpenSlideService:
    available: bool = _OPENSLIDE_OK
    reason: str | None = _OPENSLIDE_ERR

    # ---- probing ----

    def probe(self, path: Path) -> dict[str, Any]:
        if not _OPENSLIDE_OK:
            raise WSIUnavailable(f"OpenSlide not available: {_OPENSLIDE_ERR}")

        supported_extensions = {
            ".mrxs",
            ".svs",
            ".ndpi",
            ".vms",
            ".vmu",
            ".scn",
            ".tif",
            ".tiff",
            ".bif",
        }

        if path.suffix.lower() not in supported_extensions:
            raise WSIUnavailable(f"Unsupported WSI extension: {path.suffix}")

        slide = openslide.OpenSlide(str(path))

        try:
            w, h = slide.dimensions
            mpp_x = slide.properties.get(openslide.PROPERTY_NAME_MPP_X)
            mpp_y = slide.properties.get(openslide.PROPERTY_NAME_MPP_Y)
            return {
                "kind": "wsi",
                "format": slide.detect_format(str(path)) or path.suffix.lstrip("."),
                "width": w,
                "height": h,
                "levels": slide.level_count,
                "levelDimensions": [list(d) for d in slide.level_dimensions],
                "levelDownsamples": list(slide.level_downsamples),
                "mppX": float(mpp_x) if mpp_x else None,
                "mppY": float(mpp_y) if mpp_y else None,
            }
        finally:
            slide.close()

    def probe_raster(self, path: Path, reason: str = "") -> dict[str, Any]:
        with Image.open(path) as im:
            return {
                "kind": "raster",
                "format": (im.format or path.suffix.lstrip(".")).lower(),
                "width": im.width,
                "height": im.height,
                "levels": 1,
                "levelDimensions": [[im.width, im.height]],
                "levelDownsamples": [1.0],
                "mppX": None,
                "mppY": None,
                "fallbackReason": reason or None,
            }

    # ---- thumbnails ----

    def write_thumbnail(self, src: Path, dst: Path, max_side: int = 512) -> None:
        if _OPENSLIDE_OK and src.suffix.lower() in {".mrxs", ".svs", ".ndpi"}:
            slide = openslide.OpenSlide(str(src))

            try:
                thumb = slide.get_thumbnail((max_side, max_side))
            finally:
                slide.close()
        else:
            with Image.open(src) as im:
                im.thumbnail((max_side, max_side))
                thumb = im.convert("RGB")

        thumb.convert("RGB").save(dst, "JPEG", quality=85)

    # ---- tiles ----

    def read_tile(self, path: Path, level: int, x: int, y: int, tile_size: int = 256) -> bytes:
        if _OPENSLIDE_OK and path.suffix.lower() in {".mrxs", ".svs", ".ndpi"}:
            slide = openslide.OpenSlide(str(path))

            try:
                if level < 0 or level >= slide.level_count:
                    raise WSIUnavailable(f"Invalid level {level}")

                downsample = slide.level_downsamples[level]
                loc = (int(x * tile_size * downsample), int(y * tile_size * downsample))
                tile = slide.read_region(loc, level, (tile_size, tile_size)).convert("RGB")
            finally:
                slide.close()
        else:
            # Raster fallback — synthesize a tile from a downscaled version.
            with Image.open(path) as im:
                im = im.convert("RGB")
                # Level 0 is native, higher levels are 2^level downsamples.
                factor = 2 ** level
                if factor > 1:
                    im = im.resize((max(1, im.width // factor), max(1, im.height // factor)))
                px = x * tile_size
                py = y * tile_size
                tile = im.crop((px, py, px + tile_size, py + tile_size))

        buf = io.BytesIO()
        tile.save(buf, "JPEG", quality=85)

        return buf.getvalue()
