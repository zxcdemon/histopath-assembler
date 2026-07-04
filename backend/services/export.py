"""
Composition preview and export.

PNG preview is rendered with Pillow from downsampled source fragments. OME-TIFF
and BigTIFF are written with tifffile when the dependency is installed.

No synthetic tissue pixels are generated. Empty regions remain transparent in
PNG and white/empty in TIFF-derived viewers.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

from PIL import Image

try:
    import tifffile  # type: ignore

    _TIFFFILE_OK = True
except Exception:  # noqa: BLE001
    tifffile = None  # type: ignore
    _TIFFFILE_OK = False


def _load_frag_image(frag: dict[str, Any], max_side: int) -> Image.Image:
    path = Path(frag["path"])

    if frag.get("kind") == "wsi":
        try:
            import openslide  # type: ignore

            slide = openslide.OpenSlide(str(path))
            try:
                image = slide.get_thumbnail((max_side, max_side)).convert("RGBA")
            finally:
                slide.close()

            return image
        except Exception:  # noqa: BLE001
            pass

    with Image.open(path) as image:
        image = image.convert("RGBA")
        image.thumbnail((max_side, max_side))

        return image.copy()


def _world_width(fragment: dict[str, Any], transform: dict[str, Any]) -> float:
    return float(fragment.get("width", 1)) * float(transform.get("scale", 1.0))


def _world_height(fragment: dict[str, Any], transform: dict[str, Any]) -> float:
    return float(fragment.get("height", 1)) * float(transform.get("scale", 1.0))


def _canvas_bounds(fragments, transforms):
    xs, ys, xe, ye = [], [], [], []

    for fragment in fragments:
        transform = transforms.get(fragment["id"])

        if not transform:
            continue

        xs.append(float(transform["x"]))
        ys.append(float(transform["y"]))
        xe.append(float(transform["x"]) + _world_width(fragment, transform))
        ye.append(float(transform["y"]) + _world_height(fragment, transform))

    if not xs:
        return 0, 0, 1024, 1024

    return min(xs), min(ys), max(xe), max(ye)


def _render_composition(fragments, transforms, max_side: int) -> Image.Image:
    images = [_load_frag_image(f, max_side) for f in fragments]
    x0, y0, x1, y1 = _canvas_bounds(fragments, transforms)
    width = max(1, int(x1 - x0))
    height = max(1, int(y1 - y0))

    if max(width, height) > max_side:
        output_scale = max_side / max(width, height)
        width = int(width * output_scale)
        height = int(height * output_scale)
    else:
        output_scale = 1.0

    canvas = Image.new("RGBA", (width, height), (255, 255, 255, 0))

    for fragment, source_image in zip(fragments, images):
        transform = transforms.get(fragment["id"])

        if not transform:
            continue

        render_width = max(1, int(_world_width(fragment, transform) * output_scale))
        render_height = max(1, int(_world_height(fragment, transform) * output_scale))
        image = source_image.resize((render_width, render_height), Image.Resampling.LANCZOS)
        rotation = float(transform.get("rot", 0.0))

        if rotation:
            image = image.rotate(-rotation, resample=Image.BICUBIC, expand=True)

        px = int((float(transform["x"]) - x0) * output_scale)
        py = int((float(transform["y"]) - y0) * output_scale)
        canvas.alpha_composite(image, (px, py))

    return canvas


def export_composition(
    fragments,
    transforms,
    fmt: str = "png",
    max_side: int = 4096,
    metadata: dict[str, Any] | None = None,
) -> bytes:
    img = _render_composition(fragments, transforms, max_side=max_side)

    if fmt == "png":
        buf = io.BytesIO()
        img.save(buf, "PNG")
        return buf.getvalue()

    if fmt in {"ome-tiff", "bigtiff"}:
        if not _TIFFFILE_OK:
            raise NotImplementedError(
                "tifffile is not installed; cannot write OME-TIFF/BigTIFF."
            )

        import numpy as np

        arr = np.asarray(img.convert("RGB"))
        buf = io.BytesIO()
        description = json.dumps(metadata or {})
        tifffile.imwrite(
            buf,
            arr,
            photometric="rgb",
            bigtiff=(fmt == "bigtiff"),
            ome=(fmt == "ome-tiff"),
            metadata={"axes": "YXS", "Description": description},
            tile=(256, 256),
            compression="jpeg",
        )
        return buf.getvalue()

    raise NotImplementedError(f"Unknown export format: {fmt}")
