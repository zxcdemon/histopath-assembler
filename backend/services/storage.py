"""Filesystem-backed storage for cases, fragments, transforms, and markers."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from threading import Lock
from typing import Any


class Storage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self._lock = Lock()

    # ---- paths ----

    def case_dir(self, case_id: str) -> Path:
        return self.root / "cases" / case_id

    def fragment_dir(self, case_id: str, fragment_id: str) -> Path:
        return self.case_dir(case_id) / "fragments" / fragment_id

    def _case_file(self, case_id: str) -> Path:
        return self.case_dir(case_id) / "case.json"

    # ---- cases ----

    def create_case(self, case_id: str, name: str) -> None:
        directory = self.case_dir(case_id)
        directory.mkdir(parents=True, exist_ok=True)

        self._write(
            case_id,
            {
                "id": case_id,
                "name": name,
                "fragments": [],
                "transforms": {},
                "markers": [],
                "controlPoints": [],
                "settings": {},
            },
        )

    def get_case(self, case_id: str) -> dict[str, Any] | None:
        path = self._case_file(case_id)

        if not path.exists():
            return None

        return json.loads(path.read_text())

    def _write(self, case_id: str, data: dict[str, Any]) -> None:
        with self._lock:
            self._case_file(case_id).write_text(json.dumps(data, indent=2))

    # ---- fragments ----

    def add_fragment(self, case_id: str, frag: dict[str, Any]) -> None:
        c = self.get_case(case_id) or {}
        c.setdefault("fragments", []).append(frag)
        self._write(case_id, c)

    def list_fragments(self, case_id: str) -> list[dict[str, Any]]:
        c = self.get_case(case_id) or {}
        return c.get("fragments", [])

    def get_fragment(self, case_id: str, fragment_id: str) -> dict[str, Any] | None:
        return next(
            (fragment for fragment in self.list_fragments(case_id) if fragment["id"] == fragment_id),
            None,
        )

    # ---- transforms / markers ----

    def set_transforms(self, case_id: str, transforms: dict[str, Any]) -> None:
        c = self.get_case(case_id) or {}
        c["transforms"] = transforms
        self._write(case_id, c)

    def set_markers(self, case_id: str, markers: list[dict[str, Any]]) -> None:
        c = self.get_case(case_id) or {}
        c["markers"] = markers
        self._write(case_id, c)

    # ---- snapshot ----

    def snapshot(self, case_id: str) -> dict[str, Any]:
        case = self.get_case(case_id) or {}

        return {"version": 1, "case": case}

    def load_snapshot(self, snap: dict[str, Any]) -> str:
        case = snap.get("case", {})
        case_id = case.get("id") or uuid.uuid4().hex[:12]
        case["id"] = case_id
        self.case_dir(case_id).mkdir(parents=True, exist_ok=True)
        self._write(case_id, case)
        return case_id
