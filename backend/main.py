"""
Histotopogram backend.

Real .mrxs handling via OpenSlide. Provides case/fragment storage, tile
serving, ink-marker detection, registration proposals, quality metrics,
preview and export.

Not intended to run inside Lovable Cloud (Cloudflare Workers has no native
libs). Deploy locally or on your own server via Docker.
"""
from __future__ import annotations

import io
import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any


from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from services.storage import Storage
from services.openslide_service import OpenSlideService, WSIUnavailable
from services.registration import (
    detect_ink_markers,
    propose_transforms,
    compute_metrics,
)
from services.export import export_composition

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "./data")).resolve()
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

storage = Storage(STORAGE_DIR)
wsi = OpenSlideService()

app = FastAPI(title="Histotopogram Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Schemas ----------

class CreateCaseIn(BaseModel):
    name: str | None = None


class Transform(BaseModel):
    x: float
    y: float
    rot: float = 0.0
    scale: float = 1.0


class SetTransformsIn(BaseModel):
    transforms: dict[str, Transform]


class Marker(BaseModel):
    id: str
    fragmentId: str
    color: str
    edge: str  # "top" | "right" | "bottom" | "left"
    x: float   # 0..1 within fragment
    y: float
    length: float = 0.0


class ControlPoint(BaseModel):
    id: str
    fragmentA: str
    fragmentB: str
    ax: float
    ay: float
    bx: float
    by: float


class RegisterIn(BaseModel):
    markers: list[Marker] = []
    controlPoints: list[ControlPoint] = []
    currentTransforms: dict[str, Transform] = {}


class PreviewIn(BaseModel):
    transforms: dict[str, Transform]
    maxSide: int = 2048


class ExportIn(BaseModel):
    transforms: dict[str, Transform]
    markers: list[Marker] = []
    controlPoints: list[ControlPoint] = []
    metrics: dict[str, Any] = {}
    format: str = "ome-tiff"  # "ome-tiff" | "bigtiff" | "png"


# ---------- Health ----------

@app.get("/health")
def health():
    return {
        "ok": True,
        "openslide": wsi.available,
        "version": app.version,
    }


# ---------- Cases ----------

@app.post("/cases")
def create_case(payload: CreateCaseIn):
    case_id = uuid.uuid4().hex[:12]
    storage.create_case(case_id, payload.name or f"Case {case_id}")
    return {"caseId": case_id, "name": payload.name or f"Case {case_id}"}


@app.get("/cases/{case_id}")
def get_case(case_id: str):
    case = storage.get_case(case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    return case


# ---------- Fragments ----------

@app.post("/cases/{case_id}/fragments")
async def upload_fragment(case_id: str, file: UploadFile = File(...)):
    if not storage.get_case(case_id):
        raise HTTPException(404, "Case not found")

    fragment_id = uuid.uuid4().hex[:12]
    dest = storage.fragment_dir(case_id, fragment_id)
    dest.mkdir(parents=True, exist_ok=True)
    file_path = dest / (file.filename or "upload.bin")

    # Stream to disk (WSIs are large).
    with file_path.open("wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    try:
        meta = wsi.probe(file_path)
    except WSIUnavailable as e:
        # Non-WSI file — still store as raw image if Pillow can open it.
        meta = wsi.probe_raster(file_path, reason=str(e))

    # Precompute thumbnail
    try:
        thumb_path = dest / "thumb.jpg"
        wsi.write_thumbnail(file_path, thumb_path, max_side=512)
        meta["thumbnail"] = f"/fragments/{case_id}/{fragment_id}/thumbnail"
    except Exception as e:  # noqa: BLE001
        meta["thumbnailError"] = str(e)

    frag = {
        "id": fragment_id,
        "caseId": case_id,
        "fileName": file.filename,
        "path": str(file_path),
        **meta,
    }
    storage.add_fragment(case_id, frag)
    return frag


@app.post("/cases/{case_id}/fragments/archive")
async def upload_fragment_archive(case_id: str, file: UploadFile = File(...)):
    """Accept a .zip containing a .mrxs file (plus its sidecar .dat directory).

    OpenSlide needs the .mrxs file and the sibling folder of raw .dat files
    to sit side by side. Users can zip both and upload as one archive.
    """
    if not storage.get_case(case_id):
        raise HTTPException(404, "Case not found")
    fragment_id = uuid.uuid4().hex[:12]
    dest = storage.fragment_dir(case_id, fragment_id)
    dest.mkdir(parents=True, exist_ok=True)

    # Save the archive itself to a temp location, then extract into `dest`.
    tmp_zip = dest / (file.filename or "upload.zip")
    with tmp_zip.open("wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    if not zipfile.is_zipfile(tmp_zip):
        shutil.rmtree(dest, ignore_errors=True)
        raise HTTPException(400, "Загруженный файл не является ZIP-архивом.")

    try:
        with zipfile.ZipFile(tmp_zip) as zf:
            # Guard against path traversal.
            for name in zf.namelist():
                p = Path(name)
                if p.is_absolute() or ".." in p.parts:
                    raise HTTPException(400, f"Небезопасный путь в архиве: {name}")
            zf.extractall(dest)
    finally:
        tmp_zip.unlink(missing_ok=True)

    # Find the .mrxs entry inside the extracted tree.
    mrxs_files = list(dest.rglob("*.mrxs"))
    if not mrxs_files:
        shutil.rmtree(dest, ignore_errors=True)
        raise HTTPException(
            400,
            "В ZIP-архиве не найден файл .mrxs. Загрузите архив, содержащий .mrxs и папку-сателлит.",
        )
    file_path = mrxs_files[0]

    try:
        meta = wsi.probe(file_path)
    except WSIUnavailable as e:
        raise HTTPException(415, f"Не удалось открыть .mrxs через OpenSlide: {e}")

    try:
        thumb_path = dest / "thumb.jpg"
        wsi.write_thumbnail(file_path, thumb_path, max_side=512)
        meta["thumbnail"] = f"/fragments/{case_id}/{fragment_id}/thumbnail"
    except Exception as e:  # noqa: BLE001
        meta["thumbnailError"] = str(e)

    frag = {
        "id": fragment_id,
        "caseId": case_id,
        "fileName": file.filename,
        "path": str(file_path),
        **meta,
    }
    storage.add_fragment(case_id, frag)
    return frag



@app.get("/cases/{case_id}/fragments")
def list_fragments(case_id: str):
    if not storage.get_case(case_id):
        raise HTTPException(404, "Case not found")
    return storage.list_fragments(case_id)


@app.get("/fragments/{case_id}/{fragment_id}/thumbnail")
def get_thumbnail(case_id: str, fragment_id: str):
    thumb = storage.fragment_dir(case_id, fragment_id) / "thumb.jpg"
    if not thumb.exists():
        raise HTTPException(404, "No thumbnail")
    return Response(thumb.read_bytes(), media_type="image/jpeg")


@app.get("/fragments/{case_id}/{fragment_id}/tile/{level}/{x}/{y}")
def get_tile(case_id: str, fragment_id: str, level: int, x: int, y: int):
    frag = storage.get_fragment(case_id, fragment_id)
    if not frag:
        raise HTTPException(404, "Fragment not found")
    try:
        buf = wsi.read_tile(Path(frag["path"]), level, x, y, tile_size=256)
    except WSIUnavailable as e:
        raise HTTPException(415, str(e))
    return Response(buf, media_type="image/jpeg")


# ---------- Transforms & Markers ----------

@app.post("/cases/{case_id}/transforms")
def set_transforms(case_id: str, payload: SetTransformsIn):
    if not storage.get_case(case_id):
        raise HTTPException(404, "Case not found")
    storage.set_transforms(case_id, {k: v.model_dump() for k, v in payload.transforms.items()})
    return {"ok": True}


@app.post("/cases/{case_id}/detect-ink")
def detect_ink(case_id: str):
    frags = storage.list_fragments(case_id)
    if not frags:
        raise HTTPException(400, "No fragments")
    markers = []
    for f in frags:
        try:
            markers.extend(detect_ink_markers(Path(f["path"]), f["id"]))
        except Exception as e:  # noqa: BLE001
            print(f"detect_ink failed for {f['id']}: {e}")
    storage.set_markers(case_id, [m for m in markers])
    return {"markers": markers}


@app.post("/cases/{case_id}/register")
def register(case_id: str, payload: RegisterIn):
    frags = storage.list_fragments(case_id)
    if len(frags) < 2:
        raise HTTPException(400, "Need at least 2 fragments")

    proposed = propose_transforms(
        fragments=frags,
        markers=[m.model_dump() for m in payload.markers],
        control_points=[cp.model_dump() for cp in payload.controlPoints],
        current=(
            {k: v.model_dump() for k, v in payload.currentTransforms.items()}
            if payload.currentTransforms
            else None
        ),
    )
    metrics = compute_metrics(frags, proposed, payload.markers, payload.controlPoints)
    return {"proposedTransforms": proposed, "metrics": metrics}


@app.post("/cases/{case_id}/preview")
def preview(case_id: str, payload: PreviewIn):
    frags = storage.list_fragments(case_id)
    if not frags:
        raise HTTPException(400, "No fragments")
    buf = export_composition(
        fragments=frags,
        transforms={k: v.model_dump() for k, v in payload.transforms.items()},
        fmt="png",
        max_side=payload.maxSide,
    )
    return StreamingResponse(io.BytesIO(buf), media_type="image/png")


@app.post("/cases/{case_id}/export")
def export_case(case_id: str, payload: ExportIn):
    frags = storage.list_fragments(case_id)
    if not frags:
        raise HTTPException(400, "No fragments")
    try:
        buf = export_composition(
            fragments=frags,
            transforms={k: v.model_dump() for k, v in payload.transforms.items()},
            fmt=payload.format,
            metadata={
                "caseId": case_id,
                "markers": [m.model_dump() for m in payload.markers],
                "controlPoints": [c.model_dump() for c in payload.controlPoints],
                "metrics": payload.metrics,
            },
        )
    except NotImplementedError as e:
        return JSONResponse(
            {"error": str(e), "hint": "Install pyvips or use format=png"},
            status_code=501,
        )
    media = {
        "png": "image/png",
        "ome-tiff": "image/tiff",
        "bigtiff": "image/tiff",
    }.get(payload.format, "application/octet-stream")
    filename = f"histotopogram_{case_id}.{ 'png' if payload.format == 'png' else 'ome.tif' }"
    return StreamingResponse(
        io.BytesIO(buf),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- Project save/load ----------

@app.get("/cases/{case_id}/project")
def export_project(case_id: str):
    case = storage.get_case(case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    return storage.snapshot(case_id)


@app.post("/projects/import")
def import_project(snapshot: dict[str, Any]):
    case_id = storage.load_snapshot(snapshot)
    return {"caseId": case_id}
