"""
Ink-marker detection and transform proposal.

This is a pragmatic first cut. It does NOT do full non-rigid registration; it
produces rigid layout proposals that align paired ink markers and explicit
control points between fragments.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# Reference ink colours (approx BGR/RGB centres). We match in HSV.
INK_COLORS = {
    "red": (355, 0.55, 0.55),
    "blue": (215, 0.60, 0.55),
    "green": (130, 0.50, 0.45),
    "yellow": (55, 0.65, 0.75),
    "black": (0, 0.00, 0.10),
}


def _edge_of(x: float, y: float, w: float, h: float) -> str:
    dx = min(x, w - x)
    dy = min(y, h - y)
    if dx < dy:
        return "left" if x < w - x else "right"
    return "top" if y < h - y else "bottom"


def detect_ink_markers(
    path: Path,
    fragment_id: str,
    max_side: int = 512,
) -> list[dict[str, Any]]:
    """Detect coloured ink strokes near the edges of a fragment."""
    with Image.open(path) as im:
        im = im.convert("RGB")
        im.thumbnail((max_side, max_side))
        arr = np.asarray(im).astype(np.float32) / 255.0

    h, w, _ = arr.shape
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = np.maximum(r, np.maximum(g, b))
    mn = np.minimum(r, np.minimum(g, b))
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)

    # Hue in degrees
    delta = mx - mn
    hue = np.zeros_like(mx)
    with np.errstate(invalid="ignore"):
        rmask = (mx == r) & (delta > 0)
        gmask = (mx == g) & (delta > 0)
        bmask = (mx == b) & (delta > 0)
        hue[rmask] = ((g[rmask] - b[rmask]) / delta[rmask]) % 6
        hue[gmask] = (b[gmask] - r[gmask]) / delta[gmask] + 2
        hue[bmask] = (r[bmask] - g[bmask]) / delta[bmask] + 4
    hue = hue * 60.0

    markers: list[dict[str, Any]] = []
    for name, (h0, s0, v0) in INK_COLORS.items():
        if name == "black":
            mask = (v < 0.25) & (s < 0.35)
        else:
            dh = np.minimum(np.abs(hue - h0), 360 - np.abs(hue - h0))
            mask = (dh < 20) & (s > max(0.25, s0 - 0.25)) & (v > 0.2)

        # Restrict to edge band (outer 12%)
        band = np.zeros_like(mask)
        bw = max(4, int(w * 0.12))
        bh = max(4, int(h * 0.12))
        band[:bh, :] = True
        band[-bh:, :] = True
        band[:, :bw] = True
        band[:, -bw:] = True
        mask = mask & band

        if mask.sum() < 30:
            continue

        ys, xs = np.where(mask)
        cx, cy = xs.mean() / w, ys.mean() / h
        length = float(math.sqrt(xs.var() + ys.var())) / max(w, h)
        markers.append(
            {
                "id": f"{fragment_id}:{name}",
                "fragmentId": fragment_id,
                "color": name,
                "edge": _edge_of(cx * w, cy * h, w, h),
                "x": float(cx),
                "y": float(cy),
                "length": length,
                "count": int(mask.sum()),
            }
        )

    return markers


# ---- Matching ----

_OPPOSITE = {"left": "right", "right": "left", "top": "bottom", "bottom": "top"}


def _score_pair(a: dict[str, Any], b: dict[str, Any]) -> float:
    """Compatibility score for two markers on different fragments."""
    if a["color"] != b["color"]:
        return 0.0
    if a["fragmentId"] == b["fragmentId"]:
        return 0.0
    # Edges must be opposite (a right-edge marker of A pairs with left-edge of B).
    if _OPPOSITE.get(a["edge"]) != b["edge"]:
        return 0.15  # weak — same colour but geometry off
    # Prefer strokes of similar length and both close to the border.
    length_penalty = abs(a.get("length", 0) - b.get("length", 0))
    return max(0.0, 1.0 - length_penalty * 2.5)


def _pair_markers(
    markers: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any], float]]:
    pairs: list[tuple[dict[str, Any], dict[str, Any], float]] = []
    used: set[str] = set()
    ranked: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
    for i, a in enumerate(markers):
        for b in markers[i + 1:]:
            s = _score_pair(a, b)
            if s > 0.4:
                ranked.append((s, a, b))
    ranked.sort(key=lambda t: -t[0])
    for s, a, b in ranked:
        if a["id"] in used or b["id"] in used:
            continue
        pairs.append((a, b, s))
        used.add(a["id"])
        used.add(b["id"])
    return pairs


def _default_transform(x: float = 0.0, y: float = 0.0) -> dict[str, Any]:
    return {"x": x, "y": y, "rot": 0.0, "scale": 1.0}


def _world_width(fragment: dict[str, Any], transform: dict[str, Any]) -> float:
    return float(fragment.get("width", 1000)) * float(transform.get("scale", 1.0))


def _world_height(fragment: dict[str, Any], transform: dict[str, Any]) -> float:
    return float(fragment.get("height", 1000)) * float(transform.get("scale", 1.0))


def _fragment_by_id(fragments: list[dict[str, Any]], fragment_id: str) -> dict[str, Any] | None:
    return next((fragment for fragment in fragments if fragment["id"] == fragment_id), None)


# ---- Transform proposal ----

def propose_transforms(
    fragments: list[dict[str, Any]],
    markers: list[dict[str, Any]],
    control_points: list[dict[str, Any]],
    current: dict[str, dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Keep the first fragment fixed and translate others to align points."""
    if not fragments:
        return {}

    out: dict[str, dict[str, Any]] = {}
    anchor = fragments[0]["id"]
    out[anchor] = current.get(anchor) if current else None
    if not out[anchor]:
        out[anchor] = _default_transform()

    # Default: tile horizontally using natural widths.
    x_cursor = float(out[anchor]["x"]) + _world_width(fragments[0], out[anchor])
    for f in fragments[1:]:
        existing = current.get(f["id"]) if current else None
        out[f["id"]] = dict(existing) if existing else _default_transform(x_cursor, 0.0)
        x_cursor += _world_width(f, out[f["id"]])

    # Refine with paired markers: translate B so its marker sits next to A's.
    pairs = _pair_markers(markers)
    for a, b, _ in pairs:
        fa = _fragment_by_id(fragments, a["fragmentId"])
        fb = _fragment_by_id(fragments, b["fragmentId"])
        if not fa or not fb:
            continue

        ta = out[a["fragmentId"]]
        tb = out[b["fragmentId"]]
        ax = float(ta["x"]) + float(a["x"]) * _world_width(fa, ta)
        ay = float(ta["y"]) + float(a["y"]) * _world_height(fa, ta)
        bxf = float(b["x"]) * _world_width(fb, tb)
        byf = float(b["y"]) * _world_height(fb, tb)
        out[b["fragmentId"]]["x"] = ax - bxf
        out[b["fragmentId"]]["y"] = ay - byf

    # Refine further with control points (they win over markers).
    for cp in control_points:
        fa = _fragment_by_id(fragments, cp["fragmentA"])
        fb = _fragment_by_id(fragments, cp["fragmentB"])
        if not fa or not fb or cp["fragmentA"] not in out or cp["fragmentB"] not in out:
            continue

        ta = out[cp["fragmentA"]]
        tb = out[cp["fragmentB"]]
        ax = float(ta["x"]) + float(cp["ax"]) * _world_width(fa, ta)
        ay = float(ta["y"]) + float(cp["ay"]) * _world_height(fa, ta)
        out[cp["fragmentB"]]["x"] = ax - float(cp["bx"]) * _world_width(fb, tb)
        out[cp["fragmentB"]]["y"] = ay - float(cp["by"]) * _world_height(fb, tb)

    return out


# ---- Metrics ----

def _bbox(f: dict[str, Any], t: dict[str, Any]) -> tuple[float, float, float, float]:
    w = _world_width(f, t)
    h = _world_height(f, t)
    return t["x"], t["y"], t["x"] + w, t["y"] + h


def compute_metrics(
    fragments: list[dict[str, Any]],
    transforms: dict[str, dict[str, Any]],
    markers: list[Any],
    control_points: list[Any],
) -> dict[str, Any]:
    marker_dicts = [m.model_dump() if hasattr(m, "model_dump") else m for m in markers]
    cp_dicts = [c.model_dump() if hasattr(c, "model_dump") else c for c in control_points]

    pairs = _pair_markers(marker_dicts)
    match_count = len(pairs) + len(cp_dicts)

    errors: list[str] = []
    warnings: list[str] = []

    placed = [f for f in fragments if f["id"] in transforms]
    for f in fragments:
        if f["id"] not in transforms:
            errors.append(f"Fragment {f.get('fileName') or f['id']} has no transform")

    # Overlap detection by bounding box (mask-based would need tissue masks).
    boxes = [(f["id"], _bbox(f, transforms[f["id"]])) for f in placed]
    for i, (ida, ba) in enumerate(boxes):
        for idb, bb in boxes[i + 1:]:
            ox = max(0.0, min(ba[2], bb[2]) - max(ba[0], bb[0]))
            oy = max(0.0, min(ba[3], bb[3]) - max(ba[1], bb[1]))
            area = ox * oy
            if area <= 0:
                continue
            small_area = min(
                (ba[2] - ba[0]) * (ba[3] - ba[1]),
                (bb[2] - bb[0]) * (bb[3] - bb[1]),
            )
            ratio = area / max(small_area, 1)
            if ratio > 0.35:
                errors.append(f"Heavy overlap {ida} ↔ {idb} ({ratio:.0%})")
            elif ratio > 0.1:
                warnings.append(f"Overlap {ida} ↔ {idb} ({ratio:.0%})")

    score = 100
    score -= 8 * len(errors)
    score -= 3 * len(warnings)
    score += min(20, 4 * match_count)
    score = max(0, min(100, score))

    return {
        "score": score,
        "matchCount": match_count,
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "pairs": [{"a": a["id"], "b": b["id"], "score": s} for a, b, s in pairs],
    }
