/**
 * Client for the external Python/FastAPI backend (see backend/ folder).
 *
 * The backend URL is configured via VITE_BACKEND_URL (e.g. http://localhost:8000).
 * If it's unset or unreachable, `isAvailable()` resolves false and the UI should
 * show the "Модуль .mrxs недоступен. Запустите backend-сервис." message.
 */

const BASE = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

export type BackendTransform = { x: number; y: number; rot: number; scale: number };

export type BackendFragment = {
  id: string;
  caseId: string;
  fileName?: string;
  kind: "wsi" | "raster";
  width: number;
  height: number;
  levels: number;
  levelDimensions: [number, number][];
  levelDownsamples: number[];
  mppX?: number | null;
  mppY?: number | null;
  thumbnail?: string;
};

export type BackendMarker = {
  id: string;
  fragmentId: string;
  color: string;
  edge: "top" | "right" | "bottom" | "left";
  x: number;
  y: number;
  length: number;
};

export type BackendControlPoint = {
  id: string;
  fragmentA: string;
  fragmentB: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

export type AssemblyMetrics = {
  score: number;
  matchCount: number;
  errorCount: number;
  warningCount: number;
  errors: string[];
  warnings: string[];
  pairs: { a: string; b: string; score: number }[];
};

function url(path: string): string {
  if (!BASE) throw new Error("VITE_BACKEND_URL is not configured");
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function assetUrl(path?: string): string | undefined {
  if (!BASE || !path) return undefined;
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Backend ${res.status}: ${await res.text()}`);
  return res.json();
}

let _availability: Promise<boolean> | null = null;
export function isAvailable(): Promise<boolean> {
  if (_availability) return _availability;
  _availability = (async () => {
    if (!BASE) return false;
    try {
      const r = await fetch(url("/health"), { method: "GET" });
      return r.ok;
    } catch {
      return false;
    }
  })();
  // Re-check after 30s so restarting backend gets detected.
  setTimeout(() => (_availability = null), 30_000);
  return _availability;
}

export const backend = {
  isConfigured: () => Boolean(BASE),
  isAvailable,
  assetUrl,

  createCase: (name?: string) =>
    jsonFetch<{ caseId: string; name: string }>("/cases", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  uploadFragment: async (caseId: string, file: File): Promise<BackendFragment> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(url(`/cases/${caseId}/fragments`), { method: "POST", body: fd });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  uploadFragmentArchive: async (caseId: string, file: File): Promise<BackendFragment> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(url(`/cases/${caseId}/fragments/archive`), { method: "POST", body: fd });
    if (!res.ok) {
      let msg = `Upload failed: ${res.status}`;
      try {
        const j = await res.json();
        if (j?.detail) msg = String(j.detail);
      } catch {
        msg += ` ${await res.text()}`;
      }
      throw new Error(msg);
    }
    return res.json();
  },

  listFragments: (caseId: string) =>
    jsonFetch<BackendFragment[]>(`/cases/${caseId}/fragments`),

  tileUrl: (caseId: string, fragmentId: string, level: number, x: number, y: number) =>
    url(`/fragments/${caseId}/${fragmentId}/tile/${level}/${x}/${y}`),

  detectInk: (caseId: string) =>
    jsonFetch<{ markers: BackendMarker[] }>(`/cases/${caseId}/detect-ink`, { method: "POST" }),

  register: (
    caseId: string,
    body: {
      markers?: BackendMarker[];
      controlPoints?: BackendControlPoint[];
      currentTransforms?: Record<string, BackendTransform>;
    },
  ) =>
    jsonFetch<{
      proposedTransforms: Record<string, BackendTransform>;
      metrics: AssemblyMetrics;
    }>(`/cases/${caseId}/register`, { method: "POST", body: JSON.stringify(body) }),

  setTransforms: (caseId: string, transforms: Record<string, BackendTransform>) =>
    jsonFetch<{ ok: boolean }>(`/cases/${caseId}/transforms`, {
      method: "POST",
      body: JSON.stringify({ transforms }),
    }),

  previewUrl: (caseId: string) => url(`/cases/${caseId}/preview`),

  exportBlob: async (
    caseId: string,
    payload: {
      transforms: Record<string, BackendTransform>;
      markers?: BackendMarker[];
      controlPoints?: BackendControlPoint[];
      metrics?: AssemblyMetrics;
      format?: "ome-tiff" | "bigtiff" | "png";
    },
  ): Promise<Blob> => {
    const res = await fetch(url(`/cases/${caseId}/export`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status} ${await res.text()}`);
    return res.blob();
  },

  exportProject: (caseId: string) =>
    jsonFetch<{ version: number; case: unknown }>(`/cases/${caseId}/project`),

  importProject: (snapshot: unknown) =>
    jsonFetch<{ caseId: string }>(`/projects/import`, {
      method: "POST",
      body: JSON.stringify(snapshot),
    }),
};
