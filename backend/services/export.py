"""Composition preview & export.

- PNG preview: composited from downsampled fragment images (Pillow).
- OME-TIFF / BigTIFF export: uses `tifffile` when possible, falls back to
  NotImplementedError so the frontend can surface a clear message.

We NEVER synthesise pixels for gaps between fragments; empty regions
remain transparent / white.
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
    p = Path(frag["path"])
    if frag.get("kind") == "wsi":
        try:
            import openslide  # type: ignore
            s = openslide.OpenSlide(str(p))
            try:
                im = s.get_thumbnail((max_side, max_side)).convert("RGBA")
            finally:
                s.close()
            return im
        except Exception:  # noqa: BLE001
            pass
    with Image.open(p) as im:
        im = im.convert("RGBA")
        im.thumbnail((max_side, max_side))
        return im.copy()


def _canvas_bounds(fragments, transforms, images):
    xs, ys, xe, ye = [], [], [], []
    for f, im in zip(fragments, images):
        t = transforms.get(f["id"])
        if not t:
            continue
        w = f.get("width") or im.width
        h = f.get("height") or im.height
        # If image was downscaled, keep ratio in world coords via scale in transform.
        scale = t.get("scale", 1) * (im.width / max(1, w))
        xs.append(t["x"])
        ys.append(t["y"])
        xe.append(t["x"] + im.width * scale)
        ye.append(t["y"] + im.height * scale)
    if not xs:
        return 0, 0, 1024, 1024
    return min(xs), min(ys), max(xe), max(ye)


def _render_composition(fragments, transforms, max_side: int) -> Image.Image:
    images = [_load_frag_image(f, max_side) for f in fragments]
    x0, y0, x1, y1 = _canvas_bounds(fragments, transforms, images)
    W = max(1, int(x1 - x0))
    H = max(1, int(y1 - y0))
    if max(W, H) > max_side:
        s = max_side / max(W, H)
        W = int(W * s)
        H = int(H * s)
    else:
        s = 1.0

    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    for f, im in zip(fragments, images):
        t = transforms.get(f["id"])
        if not t:
            continue
        rot = t.get("rot", 0)
        if rot:
            im = im.rotate(-rot, resample=Image.BICUBIC, expand=True)
        px = int((t["x"] - x0) * s)
        py = int((t["y"] - y0) * s)
        canvas.alpha_composite(im, (px, py))
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
