"""Ink-marker detection and transform proposal.

This is a pragmatic first cut. It does NOT do full non-rigid registration;
it produces rigid translations + rotations that align paired ink markers
(and any control points) between fragments.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# Reference ink colours (approx BGR/RGB centres). We match in HSV.
INK_COLORS = {
    "red":    (355, 0.55, 0.55),
    "blue":   (215, 0.60, 0.55),
    "green":  (130, 0.50, 0.45),
    "yellow": (55,  0.65, 0.75),
    "black":  (0,   0.00, 0.10),
}


def _edge_of(x: float, y: float, w: float, h: float) -> str:
    dx = min(x, w - x)
    dy = min(y, h - y)
    if dx < dy:
        return "left" if x < w - x else "right"
    return "top" if y < h - y else "bottom"


def detect_ink_markers(path: Path, fragment_id: str, max_side: int = 512) -> list[dict[str, Any]]:
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
        markers.append({
            "id": f"{fragment_id}:{name}",
            "fragmentId": fragment_id,
            "color": name,
            "edge": _edge_of(cx * w, cy * h, w, h),
            "x": float(cx),
            "y": float(cy),
            "length": length,
            "count": int(mask.sum()),
        })

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


def _pair_markers(markers: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any], float]]:
    pairs: list[tuple[dict, dict, float]] = []
    used: set[str] = set()
    ranked = []
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


# ---- Transform proposal ----

def propose_transforms(
    fragments: list[dict[str, Any]],
    markers: list[dict[str, Any]],
    control_points: list[dict[str, Any]],
    current: dict[str, dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Very simple rigid layout: keep the first fragment fixed and translate
    others so that their matched markers/CPs align."""
    if not fragments:
        return {}

    out: dict[str, dict[str, Any]] = {}
    anchor = fragments[0]["id"]
    out[anchor] = current.get(anchor) if current else None
    if not out[anchor]:
        out[anchor] = {"x": 0.0, "y": 0.0, "rot": 0.0, "scale": 1.0}

    # Default: tile horizontally using natural widths.
    x_cursor = out[anchor]["x"] + fragments[0].get("width", 1000)
    for f in fragments[1:]:
        out[f["id"]] = {"x": x_cursor, "y": 0.0, "rot": 0.0, "scale": 1.0}
        x_cursor += f.get("width", 1000)

    # Refine with paired markers: translate B so its marker sits next to A's.
    pairs = _pair_markers(markers)
    for a, b, _ in pairs:
        fa = next((f for f in fragments if f["id"] == a["fragmentId"]), None)
        fb = next((f for f in fragments if f["id"] == b["fragmentId"]), None)
        if not fa or not fb:
            continue
        ax = out[a["fragmentId"]]["x"] + a["x"] * fa.get("width", 1000)
        ay = out[a["fragmentId"]]["y"] + a["y"] * fa.get("height", 1000)
        bxf = b["x"] * fb.get("width", 1000)
        byf = b["y"] * fb.get("height", 1000)
        out[b["fragmentId"]]["x"] = ax - bxf
        out[b["fragmentId"]]["y"] = ay - byf

    # Refine further with control points (they win over markers).
    for cp in control_points:
        fa = next((f for f in fragments if f["id"] == cp["fragmentA"]), None)
        fb = next((f for f in fragments if f["id"] == cp["fragmentB"]), None)
        if not fa or not fb or cp["fragmentA"] not in out or cp["fragmentB"] not in out:
            continue
        ax = out[cp["fragmentA"]]["x"] + cp["ax"] * fa.get("width", 1000)
        ay = out[cp["fragmentA"]]["y"] + cp["ay"] * fa.get("height", 1000)
        out[cp["fragmentB"]]["x"] = ax - cp["bx"] * fb.get("width", 1000)
        out[cp["fragmentB"]]["y"] = ay - cp["by"] * fb.get("height", 1000)

    return out


# ---- Metrics ----

def _bbox(f: dict[str, Any], t: dict[str, Any]) -> tuple[float, float, float, float]:
    w = f.get("width", 1000) * t.get("scale", 1)
    h = f.get("height", 1000) * t.get("scale", 1)
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
            small_area = min((ba[2] - ba[0]) * (ba[3] - ba[1]),
                             (bb[2] - bb[0]) * (bb[3] - bb[1]))
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
