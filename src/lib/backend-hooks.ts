import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  backend,
  type AssemblyMetrics,
  type BackendControlPoint,
  type BackendMarker,
  type BackendTransform,
} from "@/lib/backend-api";
import type { Fragment } from "@/components/HistologyCanvas";

/**
 * Shared backend state for the Workspace.
 *
 * Owns availability, active caseId and long-op flags. All operations are
 * best-effort: if the backend is offline they no-op and return a helpful
 * message so callers can toast it.
 */
export function useBackend(fragments: Fragment[]) {
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [isRegistering, setRegistering] = useState(false);
  const [isExporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    backend.isAvailable().then((ok) => {
      if (cancelled) return;
      setBackendAvailable(ok);
      if (!ok && backend.isConfigured()) {
        setBackendError("Backend недоступен. .mrxs и OME-TIFF работать не будут.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive caseId from first fragment that came from the backend.
  const backendCaseId = useMemo(
    () => fragments.find((f) => f.remoteCaseId)?.remoteCaseId ?? null,
    [fragments],
  );

  const backendFragments = useMemo(
    () => fragments.filter((f) => f.remoteId),
    [fragments],
  );

  const requireCaseId = useCallback((): string | null => {
    if (!backendCaseId) {
      toast.error("Нет активного backend case", {
        description: "Загрузите фрагменты через backend (кнопка «Импорт»).",
      });
      return null;
    }
    return backendCaseId;
  }, [backendCaseId]);

  return {
    backendAvailable,
    backendConfigured: backend.isConfigured(),
    backendCaseId,
    backendFragments,
    backendError,
    isUploading,
    isRegistering,
    isExporting,
    setUploading,
    setRegistering,
    setExporting,
    requireCaseId,
  };
}

// ---------- Conversion helpers ----------

/**
 * Convert frontend brush strokes to backend markers. Best-effort: for each
 * (fragmentId, color) pair, take the centroid of all painted points and
 * classify it by nearest edge. Points are expected in 0..1 fragment-local
 * coordinates.
 */
export function strokesToMarkers(
  strokes: Array<{ fragmentId: string; color: string; points: Array<{ x: number; y: number }> }>,
): BackendMarker[] {
  const buckets = new Map<string, { fragmentId: string; color: string; sx: number; sy: number; n: number; spread: number }>();
  for (const s of strokes) {
    const key = `${s.fragmentId}:${s.color}`;
    let b = buckets.get(key);
    if (!b) {
      b = { fragmentId: s.fragmentId, color: s.color, sx: 0, sy: 0, n: 0, spread: 0 };
      buckets.set(key, b);
    }
    for (const p of s.points) {
      b.sx += p.x;
      b.sy += p.y;
      b.n += 1;
    }
    // rough length in normalised units
    for (let i = 1; i < s.points.length; i++) {
      const dx = s.points[i].x - s.points[i - 1].x;
      const dy = s.points[i].y - s.points[i - 1].y;
      b.spread += Math.hypot(dx, dy);
    }
  }
  const out: BackendMarker[] = [];
  for (const b of buckets.values()) {
    if (!b.n) continue;
    const x = b.sx / b.n;
    const y = b.sy / b.n;
    const dLeft = x;
    const dRight = 1 - x;
    const dTop = y;
    const dBottom = 1 - y;
    const min = Math.min(dLeft, dRight, dTop, dBottom);
    const edge: BackendMarker["edge"] =
      min === dLeft ? "left" : min === dRight ? "right" : min === dTop ? "top" : "bottom";
    out.push({
      id: `${b.fragmentId}:${b.color}`,
      fragmentId: b.fragmentId,
      color: b.color,
      edge,
      x,
      y,
      length: b.spread,
    });
  }
  return out;
}

export function placementsToTransforms(
  placements: Record<string, { x: number; y: number; rot: number; w?: number }>,
  fragments: Fragment[],
): Record<string, BackendTransform> {
  const out: Record<string, BackendTransform> = {};
  for (const f of fragments) {
    if (!f.remoteId) continue;
    const p = placements[f.id];
    if (!p) continue;
    out[f.remoteId] = {
      x: p.x,
      y: p.y,
      rot: p.rot ?? 0,
      scale: (p.w ?? 100) / 100,
    };
  }
  return out;
}

/** Reverse of placementsToTransforms. Uses `w` from current placements as base. */
export function transformsToPlacements<P extends { x: number; y: number; rot: number; w: number }>(
  transforms: Record<string, BackendTransform>,
  current: Record<string, P>,
  fragments: Fragment[],
): Record<string, P> {
  const byRemote = new Map<string, Fragment>();
  for (const f of fragments) if (f.remoteId) byRemote.set(f.remoteId, f);
  const next = { ...current };
  for (const [remoteId, t] of Object.entries(transforms)) {
    const frag = byRemote.get(remoteId);
    if (!frag) continue;
    const cur = current[frag.id];
    if (!cur) continue;
    next[frag.id] = {
      ...cur,
      x: t.x,
      y: t.y,
      rot: t.rot,
      w: (cur.w ?? 100) * (t.scale || 1),
    };
  }
  return next;
}

export type UseBackend = ReturnType<typeof useBackend>;
export type { AssemblyMetrics, BackendMarker, BackendControlPoint };
