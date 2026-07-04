import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";


import {
  Menu,
  Upload,
  MapPin,
  LayoutGrid,
  Crosshair,
  Eye,
  Settings,
  HelpCircle,
  Undo2,
  Redo2,
  Folder,
  ChevronDown,
  Copy,
  Minus,
  Plus,
  Maximize2,
  Move,
  Info,
  RotateCcw,
  FlipHorizontal,
  ChevronUp,
  EyeOff,
  SlidersHorizontal,
  Brush,
  Eraser,
  Trash2,
  Download,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { FRAGMENTS, FragmentImage, type Fragment } from "@/components/HistologyCanvas";
import { ImportDialog } from "@/components/ImportDialog";

import { MascotAssistant } from "@/components/MascotAssistant";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import histologyAsset from "@/assets/histology.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Виртуальная гистотопограмма" },
      {
        name: "description",
        content:
          "Рабочее место патологоанатома: сборка виртуальной гистотопограммы из реальных гистологических фрагментов.",
      },
      { property: "og:title", content: "Виртуальная гистотопограмма" },
      {
        property: "og:description",
        content:
          "Сборка виртуальной гистотопограммы из реальных гистологических фрагментов с ассистентом.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});


const INK_MARKERS = [
  { color: "oklch(0.20 0.02 260)", label: "Чёрный", count: 4, edge: "top" as const },
  { color: "oklch(0.60 0.22 27)", label: "Красный", count: 4, edge: "right" as const },
  { color: "oklch(0.58 0.20 260)", label: "Синий", count: 4, edge: "bottom" as const },
  { color: "oklch(0.62 0.18 145)", label: "Зелёный", count: 4, edge: "left" as const },
];

type Placement = { x: number; y: number; w: number; rot: number; flip?: boolean };
type InkLevels = Record<string, number>;
type InkVisibility = Record<string, boolean>;
export type InkMarker = (typeof INK_MARKERS)[number];

// Painted ink markers (brush strokes) — real inking tool.
export type MarkerPoint = { x: number; y: number };
export type MarkerStroke = {
  id: string;
  fragmentId: string;
  color: string;
  size: number; // in % of fragment box
  points: MarkerPoint[];
  createdAt: number;
};
export type MarkerTool = "brush" | "eraser";
const MARKER_PALETTE = [
  "#111827", "#ef4444", "#3b82f6", "#22c55e",
  "#eab308", "#a855f7", "#f97316", "#06b6d4",
];
const CASE_ID = "2025-05-20_Печень_Биопсия";
const MARKERS_STORAGE_KEY = `htg-markers:${CASE_ID}`;

// ============= Image registration =============
export type ControlPoint = {
  id: string;
  fragmentId: string;
  x: number; // 0-100 % of fragment box
  y: number;
  pairId: number;
};
export type RegQuality = "good" | "check" | "bad";
const CP_PALETTE = [
  "#ef4444", "#3b82f6", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
  "#14b8a6", "#8b5cf6",
];
const cpColor = (pairId: number) => CP_PALETTE[(pairId - 1) % CP_PALETTE.length];

// Convert a control point in fragment-local % to canvas % using its placement.
function cpToCanvas(cp: { x: number; y: number }, p: Placement) {
  const heightPct = p.w * (2 / 3); // fragments have aspect 3:2
  const cx = p.x + p.w / 2;
  const cy = p.y + heightPct / 2;
  const ox = ((cp.x - 50) / 100) * p.w * (p.flip ? -1 : 1);
  const oy = ((cp.y - 50) / 100) * heightPct;
  const rad = (p.rot * Math.PI) / 180;
  return {
    x: cx + ox * Math.cos(rad) - oy * Math.sin(rad),
    y: cy + ox * Math.sin(rad) + oy * Math.cos(rad),
  };
}

// 2-D similarity transform S→T (scale, rotation, translation) via closed-form.
function computeSimilarity(
  src: { x: number; y: number }[],
  dst: { x: number; y: number }[],
) {
  const n = Math.min(src.length, dst.length);
  if (n < 1) return null;
  const sμ = { x: 0, y: 0 }, tμ = { x: 0, y: 0 };
  for (let i = 0; i < n; i++) { sμ.x += src[i].x; sμ.y += src[i].y; tμ.x += dst[i].x; tμ.y += dst[i].y; }
  sμ.x /= n; sμ.y /= n; tμ.x /= n; tμ.y /= n;
  let a = 0, b = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i].x - sμ.x, sy = src[i].y - sμ.y;
    const tx = dst[i].x - tμ.x, ty = dst[i].y - tμ.y;
    a += sx * tx + sy * ty;
    b += sx * ty - sy * tx;
    d += sx * sx + sy * sy;
  }
  if (d < 1e-9 || n === 1) {
    return { scale: 1, angleRad: 0, tx: tμ.x - sμ.x, ty: tμ.y - sμ.y };
  }
  const scale = Math.sqrt(a * a + b * b) / d;
  const angleRad = Math.atan2(b, a);
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
  return {
    scale,
    angleRad,
    tx: tμ.x - scale * (cos * sμ.x - sin * sμ.y),
    ty: tμ.y - scale * (sin * sμ.x + cos * sμ.y),
  };
}

const inkKey = (fid: string, label: string) => `${fid}|${label}`;

function Workspace() {
  const [selectedId, setSelectedId] = useState<string>("F-03");
  const [mode, setMode] = useState<"auto" | "semi" | "manual">("auto");
  const [inkOn, setInkOn] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [navOpen, setNavOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [section, setSection] = useState<string>("layout");
  const [importOpen, setImportOpen] = useState(false);
  const [fragments, setFragments] = useState<Fragment[]>(() => FRAGMENTS.map((f) => ({ ...f })));
  const [placements, setPlacements] = useState<Record<string, Placement>>(() =>
    Object.fromEntries(fragments.map((f) => [f.id, { ...f.place }])),
  );
  const [inkLevels, setInkLevels] = useState<InkLevels>(() => {
    const init: InkLevels = {};
    fragments.forEach((f) =>
      INK_MARKERS.forEach((m) => (init[inkKey(f.id, m.label)] = 66)),
    );
    return init;
  });
  const [inkVisible, setInkVisible] = useState<InkVisibility>(() => {
    const init: InkVisibility = {};
    fragments.forEach((f) =>
      INK_MARKERS.forEach((m) => (init[inkKey(f.id, m.label)] = true)),
    );
    return init;
  });

  // Undo/redo history for placements.
  const [history, setHistory] = useState<{ past: Record<string, Placement>[]; future: Record<string, Placement>[] }>({
    past: [],
    future: [],
  });
  const commitHistory = useCallback(() => {
    setHistory((h) => ({ past: [...h.past, placements], future: [] }));
  }, [placements]);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      setPlacements(prev);
      return { past: h.past.slice(0, -1), future: [placements, ...h.future] };
    });
  }, [placements]);
  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const next = h.future[0];
      setPlacements(next);
      return { past: [...h.past, placements], future: h.future.slice(1) };
    });
  }, [placements]);

  const updatePlacement = (id: string, patch: Partial<Placement>) =>
    setPlacements((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const resetPlacement = (id: string) => {
    const src = fragments.find((f) => f.id === id);
    if (src) {
      commitHistory();
      setPlacements((prev) => ({ ...prev, [id]: { ...src.place } }));
      toast("Трансформации сброшены", { description: `Фрагмент ${id}` });
    }
  };

  const setInkLevel = (fid: string, label: string, value: number) =>
    setInkLevels((prev) => ({ ...prev, [inkKey(fid, label)]: value }));

  const toggleInkVisible = (fid: string, label: string) =>
    setInkVisible((prev) => ({ ...prev, [inkKey(fid, label)]: !prev[inkKey(fid, label)] }));

  // ============= Painted markers (brush) =============
  const [strokes, setStrokes] = useState<MarkerStroke[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(MARKERS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as MarkerStroke[]) : [];
    } catch {
      return [];
    }
  });
  const [strokePast, setStrokePast] = useState<MarkerStroke[][]>([]);
  const [brushColor, setBrushColor] = useState<string>(MARKER_PALETTE[1]);
  const [brushSize, setBrushSize] = useState<number>(3);
  const [brushTool, setBrushTool] = useState<MarkerTool>("brush");
  const paintMode = section === "markers";

  useEffect(() => {
    try {
      localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(strokes));
    } catch {
      /* quota / disabled */
    }
  }, [strokes]);

  const snapshotStrokes = useCallback(() => {
    setStrokePast((h) => [...h.slice(-49), strokes]);
  }, [strokes]);
  const undoStroke = useCallback(() => {
    setStrokePast((h) => {
      if (!h.length) return h;
      setStrokes(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);
  const clearFragmentStrokes = useCallback(
    (fid: string) => {
      snapshotStrokes();
      setStrokes((s) => s.filter((x) => x.fragmentId !== fid));
      toast("Маркеры фрагмента удалены", { description: fid });
    },
    [snapshotStrokes],
  );
  const addStroke = useCallback((s: MarkerStroke) => {
    setStrokes((prev) => [...prev, s]);
  }, []);
  const updateStrokePoints = useCallback((id: string, points: MarkerPoint[]) => {
    setStrokes((prev) => prev.map((s) => (s.id === id ? { ...s, points: [...points] } : s)));
  }, []);
  const eraseNear = useCallback((fid: string, x: number, y: number, radius: number) => {
    setStrokes((prev) =>
      prev.filter((st) => {
        if (st.fragmentId !== fid) return true;
        return !st.points.some((p) => Math.hypot(p.x - x, p.y - y) < radius);
      }),
    );
  }, []);

  // Matches between fragments: shared marker colors → possible neighbours.
  const matches = useMemo(() => {
    const byFrag = new Map<string, Set<string>>();
    strokes.forEach((s) => {
      if (!byFrag.has(s.fragmentId)) byFrag.set(s.fragmentId, new Set());
      byFrag.get(s.fragmentId)!.add(s.color);
    });
    const ids = [...byFrag.keys()];
    const pairs: { a: string; b: string; colors: string[] }[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byFrag.get(ids[i])!;
        const b = byFrag.get(ids[j])!;
        const common = [...a].filter((c) => b.has(c));
        if (common.length) pairs.push({ a: ids[i], b: ids[j], colors: common });
      }
    }
    return pairs;
  }, [strokes]);
  const matchedColorsByFragment = useMemo(() => {
    const m = new Map<string, Set<string>>();
    matches.forEach(({ a, b, colors }) => {
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      colors.forEach((c) => {
        m.get(a)!.add(c);
        m.get(b)!.add(c);
      });
    });
    return m;
  }, [matches]);

  const exportMarkers = useCallback(() => {
    const payload = {
      caseId: CASE_ID,
      exportedAt: new Date().toISOString(),
      fragments: fragments.map((f) => ({
        id: f.id,
        label: f.label,
        placement: placements[f.id],
        strokes: strokes
          .filter((s) => s.fragmentId === f.id)
          .map((s) => ({ id: s.id, color: s.color, size: s.size, points: s.points })),
        neighbours: matches
          .filter((m) => m.a === f.id || m.b === f.id)
          .map((m) => ({
            fragmentId: m.a === f.id ? m.b : m.a,
            sharedColors: m.colors,
          })),
      })),
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${CASE_ID}-markers.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Маркеры экспортированы", { description: `${payload.fragments.length} фрагмент(ов)` });
    } catch {
      toast("Не удалось экспортировать маркеры");
    }
  }, [fragments, placements, strokes, matches]);

  // ============= Registration state =============
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
  const [regPair, setRegPair] = useState<[string, string] | null>(null);
  const [pendingPlacements, setPendingPlacements] = useState<Record<string, Placement> | null>(null);
  const [regQuality, setRegQuality] = useState<RegQuality | null>(null);
  const [regResidual, setRegResidual] = useState<number | null>(null);
  const registrationMode = section === "registration";

  const addControlPoint = useCallback(
    (fid: string, x: number, y: number) => {
      if (!regPair || (fid !== regPair[0] && fid !== regPair[1])) return;
      const [A, B] = regPair;
      const other = fid === A ? B : A;
      setControlPoints((prev) => {
        const pairCPs = prev.filter((cp) => cp.fragmentId === A || cp.fragmentId === B);
        const pairIds = [...new Set(pairCPs.map((cp) => cp.pairId))].sort((a, b) => a - b);
        let pid: number | undefined;
        for (const p of pairIds) {
          const hasThis = pairCPs.some((cp) => cp.pairId === p && cp.fragmentId === fid);
          const hasOther = pairCPs.some((cp) => cp.pairId === p && cp.fragmentId === other);
          if (!hasThis && hasOther) { pid = p; break; }
        }
        if (pid === undefined) pid = (pairIds.length ? pairIds[pairIds.length - 1] : 0) + 1;
        return [
          ...prev,
          {
            id: `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            fragmentId: fid,
            x, y, pairId: pid,
          },
        ];
      });
    },
    [regPair],
  );

  const removeControlPoint = useCallback((id: string) => {
    setControlPoints((prev) => prev.filter((cp) => cp.id !== id));
  }, []);

  const resetRegistration = useCallback(() => {
    setControlPoints([]);
    setPendingPlacements(null);
    setRegQuality(null);
    setRegResidual(null);
    toast("Регистрация сброшена");
  }, []);

  // Auto: use marker matches to snap fragments to their first matched neighbour.
  const runAutoRegistration = useCallback(() => {
    if (!matches.length) {
      setPendingPlacements(null);
      setRegQuality("bad");
      setRegResidual(null);
      toast("Нет совпадений маркеров", { description: "Нанесите одинаковые цвета на края соседних фрагментов." });
      return;
    }
    const next: Record<string, Placement> = { ...placements };
    const moved = new Set<string>();
    const sorted = [...matches].sort((a, b) => b.colors.length - a.colors.length);
    for (const m of sorted) {
      const anchor = moved.has(m.a) ? m.a : moved.has(m.b) ? m.b : m.a;
      const target = anchor === m.a ? m.b : m.a;
      if (moved.has(target)) continue;
      const commonColor = m.colors[0];
      const strokesA = strokes.filter((s) => s.fragmentId === anchor && s.color === commonColor);
      const strokesB = strokes.filter((s) => s.fragmentId === target && s.color === commonColor);
      if (!strokesA.length || !strokesB.length) continue;
      const centroid = (list: MarkerStroke[], pl: Placement) => {
        let sx = 0, sy = 0, n = 0;
        list.forEach((st) => st.points.forEach((pt) => {
          const c = cpToCanvas(pt, pl);
          sx += c.x; sy += c.y; n++;
        }));
        return { x: sx / n, y: sy / n };
      };
      const ca = centroid(strokesA, next[anchor]);
      const cb = centroid(strokesB, next[target]);
      const cur = next[target];
      next[target] = { ...cur, x: cur.x + (ca.x - cb.x), y: cur.y + (ca.y - cb.y) };
      moved.add(anchor);
      moved.add(target);
    }
    setPendingPlacements(next);
    const q: RegQuality = matches.length >= 3 ? "good" : matches.length === 2 ? "check" : "bad";
    setRegQuality(q);
    setRegResidual(null);
    toast("Автосовмещение выполнено", { description: `Пар: ${matches.length}` });
  }, [matches, strokes, placements]);

  const runSemiRegistration = useCallback(() => {
    if (!regPair) { toast("Выберите пару фрагментов"); return; }
    const [A, B] = regPair;
    const pairIds = [...new Set(controlPoints.filter((cp) => cp.fragmentId === A || cp.fragmentId === B).map((cp) => cp.pairId))];
    const src: { x: number; y: number }[] = [];
    const dst: { x: number; y: number }[] = [];
    const plA = placements[A];
    const plB = placements[B];
    for (const pid of pairIds) {
      const cA = controlPoints.find((cp) => cp.fragmentId === A && cp.pairId === pid);
      const cB = controlPoints.find((cp) => cp.fragmentId === B && cp.pairId === pid);
      if (!cA || !cB) continue;
      dst.push(cpToCanvas(cA, plA));
      src.push(cpToCanvas(cB, plB));
    }
    if (src.length < 1) { toast("Нужна хотя бы одна пара контрольных точек"); return; }
    const sim = computeSimilarity(src, dst);
    if (!sim) return;
    const heightPct = plB.w * (2 / 3);
    const cx = plB.x + plB.w / 2;
    const cy = plB.y + heightPct / 2;
    const cos = Math.cos(sim.angleRad), sin = Math.sin(sim.angleRad);
    const newCx = sim.scale * (cos * cx - sin * cy) + sim.tx;
    const newCy = sim.scale * (sin * cx + cos * cy) + sim.ty;
    const newW = plB.w * sim.scale;
    const newH = newW * (2 / 3);
    const newPlace: Placement = {
      x: newCx - newW / 2,
      y: newCy - newH / 2,
      w: newW,
      rot: plB.rot + (sim.angleRad * 180) / Math.PI,
      flip: plB.flip,
    };
    let sum = 0;
    for (let i = 0; i < src.length; i++) {
      const x = sim.scale * (cos * src[i].x - sin * src[i].y) + sim.tx;
      const y = sim.scale * (sin * src[i].x + cos * src[i].y) + sim.ty;
      sum += (x - dst[i].x) ** 2 + (y - dst[i].y) ** 2;
    }
    const rms = Math.sqrt(sum / src.length);
    setRegResidual(rms);
    const q: RegQuality =
      src.length >= 3 && rms < 1.5 ? "good" : rms < 3.5 ? "check" : "bad";
    setRegQuality(q);
    setPendingPlacements({ ...placements, [B]: newPlace });
    toast("Полуавтосовмещение рассчитано", { description: `RMS ${rms.toFixed(2)}%` });
  }, [regPair, controlPoints, placements]);

  const runRegistration = useCallback(() => {
    if (mode === "auto") runAutoRegistration();
    else if (mode === "semi") runSemiRegistration();
    else toast("Ручной режим", { description: "Двигайте, поворачивайте и масштабируйте фрагменты напрямую." });
  }, [mode, runAutoRegistration, runSemiRegistration]);

  const applyPending = useCallback(() => {
    if (!pendingPlacements) return;
    commitHistory();
    setPlacements(pendingPlacements);
    setPendingPlacements(null);
    setRegQuality(null);
    setRegResidual(null);
    toast("Трансформации применены");
  }, [pendingPlacements, commitHistory]);

  const rejectPending = useCallback(() => {
    setPendingPlacements(null);
    setRegQuality(null);
    setRegResidual(null);
    toast("Результат отклонён");
  }, []);

  const importFragments = (newFragments: Fragment[]) => {
    setFragments((prev) => [...prev, ...newFragments]);
    setPlacements((prev) => {
      const next = { ...prev };
      newFragments.forEach((f) => (next[f.id] = { ...f.place }));
      return next;
    });
    setInkLevels((prev) => {
      const next = { ...prev };
      newFragments.forEach((f) =>
        INK_MARKERS.forEach((m) => (next[inkKey(f.id, m.label)] = 66)),
      );
      return next;
    });
    setInkVisible((prev) => {
      const next = { ...prev };
      newFragments.forEach((f) =>
        INK_MARKERS.forEach((m) => (next[inkKey(f.id, m.label)] = true)),
      );
      return next;
    });
    if (newFragments[0]) setSelectedId(newFragments[0].id);
    toast(`Импортировано: ${newFragments.length}`, {
      description: "Файлы добавлены на канву.",
    });
  };

  const selected = useMemo(
    () => fragments.find((f) => f.id === selectedId) ?? fragments[0],
    [selectedId, fragments],
  );


  // Keyboard shortcuts: arrows nudge, R rotate, F flip, Esc deselect, Ctrl+Z/Y undo/redo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (paintMode) {
          if (e.shiftKey) return;
          undoStroke();
        } else if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (paintMode) return; // in painting mode, arrows/R/F don't nudge
      if (!selected) return;
      const step = e.shiftKey ? 5 : 1;
      const p = placements[selected.id];
      if (!p) return;
      if (e.key === "ArrowLeft") { commitHistory(); updatePlacement(selected.id, { x: p.x - step }); e.preventDefault(); }
      else if (e.key === "ArrowRight") { commitHistory(); updatePlacement(selected.id, { x: p.x + step }); e.preventDefault(); }
      else if (e.key === "ArrowUp") { commitHistory(); updatePlacement(selected.id, { y: p.y - step }); e.preventDefault(); }
      else if (e.key === "ArrowDown") { commitHistory(); updatePlacement(selected.id, { y: p.y + step }); e.preventDefault(); }
      else if (e.key.toLowerCase() === "r") { commitHistory(); updatePlacement(selected.id, { rot: p.rot + (e.shiftKey ? -15 : 15) }); }
      else if (e.key.toLowerCase() === "f") { commitHistory(); updatePlacement(selected.id, { flip: !p.flip }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, placements, commitHistory, undo, redo, paintMode, undoStroke]);

  const handleSection = (id: string) => {
    setSection(id);
    setNavOpen(false);
    if (id === "import") {
      setImportOpen(true);
      return;
    }
    const labels: Record<string, string> = {
      import: "Импорт", markers: "Маркеры", layout: "Макет",
      registration: "Регистрация", preview: "Просмотр",
      settings: "Настройки", help: "Помощь",
    };
    if (id !== "layout") toast(`Раздел «${labels[id]}»`, { description: "Открыт выбранный раздел." });
  };



  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar
        onOpenNav={() => setNavOpen(true)}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
      />
      <div className="flex-1 flex min-h-0">
        {/* Desktop nav */}
        <NavRail active={section} onSelect={handleSection} />
        {/* Mobile nav */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            side="left"
            className="p-0 w-[104px] sm:max-w-[104px] border-r-0 [&>button.absolute]:hidden"
          >
            <SheetTitle className="sr-only">Навигация</SheetTitle>
            <NavRail mobile active={section} onSelect={handleSection} onClose={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 flex flex-col min-w-0 relative">
          <Canvas
            fragments={fragments}
            selectedId={selected.id}
            onSelect={setSelectedId}
            zoom={zoom}
            setZoom={setZoom}
            placements={placements}
            updatePlacement={updatePlacement}
            commitHistory={commitHistory}
            inkOn={inkOn}
            inkLevels={inkLevels}
            inkVisible={inkVisible}
            paintMode={paintMode}
            strokes={strokes}
            brushColor={brushColor}
            brushSize={brushSize}
            brushTool={brushTool}
            addStroke={addStroke}
            updateStrokePoints={updateStrokePoints}
            eraseNear={eraseNear}
            snapshotStrokes={snapshotStrokes}
            matchedColorsByFragment={matchedColorsByFragment}
            registrationMode={registrationMode}
            regMode={mode}
            regPair={regPair}
            controlPoints={controlPoints}
            addControlPoint={addControlPoint}
            removeControlPoint={removeControlPoint}
            pendingPlacements={pendingPlacements}
          />


          {bottomOpen ? (
            <BottomBar
              fragments={fragments}
              selectedId={selected.id}
              onSelect={setSelectedId}
              onCollapse={() => setBottomOpen(false)}
            />
          ) : (
            <button
              onClick={() => setBottomOpen(true)}
              className="mx-3 mb-3 self-start rounded-lg bg-panel border border-border shadow-panel px-3 py-1.5 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Фрагменты ({fragments.length})
            </button>
          )}

        </main>

        {/* Desktop right panel */}
        <aside className="hidden lg:block w-[300px] border-l border-border bg-panel overflow-y-auto">
          {paintMode && (
            <MarkerTools
              fragment={selected}
              strokes={strokes}
              matches={matches}
              brushColor={brushColor}
              setBrushColor={setBrushColor}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              brushTool={brushTool}
              setBrushTool={setBrushTool}
              onUndo={undoStroke}
              canUndo={strokePast.length > 0}
              onClear={() => clearFragmentStrokes(selected.id)}
              onExport={exportMarkers}
            />
          )}
          {registrationMode && (
            <RegistrationPanel
              fragments={fragments}
              controlPoints={controlPoints}
              regPair={regPair}
              setRegPair={setRegPair}
              onRemoveControlPoint={removeControlPoint}
              mode={mode}
              setMode={setMode}
              onRun={runRegistration}
              onApply={applyPending}
              onReject={rejectPending}
              onReset={resetRegistration}
              hasPending={!!pendingPlacements}
              quality={regQuality}
              residual={regResidual}
              matches={matches}
            />
          )}
          <FragmentParams
            fragment={selected}
            placement={placements[selected.id]}
            updatePlacement={updatePlacement}
            resetPlacement={resetPlacement}
            inkLevels={inkLevels}
            setInkLevel={setInkLevel}
            inkVisible={inkVisible}
            toggleInkVisible={toggleInkVisible}
            mode={mode}
            setMode={setMode}
            inkOn={inkOn}
            setInkOn={setInkOn}
          />
        </aside>
        {/* Mobile params drawer */}
        <Sheet open={paramsOpen} onOpenChange={setParamsOpen}>
          <SheetContent side="right" className="p-0 w-[320px] max-w-[90vw] overflow-y-auto">
            <SheetTitle className="sr-only">Параметры фрагмента</SheetTitle>
            {paintMode && (
              <MarkerTools
                fragment={selected}
                strokes={strokes}
                matches={matches}
                brushColor={brushColor}
                setBrushColor={setBrushColor}
                brushSize={brushSize}
                setBrushSize={setBrushSize}
                brushTool={brushTool}
                setBrushTool={setBrushTool}
                onUndo={undoStroke}
                canUndo={strokePast.length > 0}
                onClear={() => clearFragmentStrokes(selected.id)}
                onExport={exportMarkers}
              />
            )}
            {registrationMode && (
              <RegistrationPanel
                fragments={fragments}
                controlPoints={controlPoints}
                regPair={regPair}
                setRegPair={setRegPair}
                onRemoveControlPoint={removeControlPoint}
                mode={mode}
                setMode={setMode}
                onRun={runRegistration}
                onApply={applyPending}
                onReject={rejectPending}
                onReset={resetRegistration}
                hasPending={!!pendingPlacements}
                quality={regQuality}
                residual={regResidual}
                matches={matches}
              />
            )}
            <FragmentParams
              fragment={selected}
              placement={placements[selected.id]}
              updatePlacement={updatePlacement}
              resetPlacement={resetPlacement}
              inkLevels={inkLevels}
              setInkLevel={setInkLevel}
              inkVisible={inkVisible}
              toggleInkVisible={toggleInkVisible}
              mode={mode}
              setMode={setMode}
              inkOn={inkOn}
              setInkOn={setInkOn}
            />
          </SheetContent>
        </Sheet>

      </div>


      {/* Mobile params trigger */}
      <button
        onClick={() => setParamsOpen(true)}
        className="lg:hidden fixed top-[68px] right-3 z-30 h-9 w-9 rounded-lg bg-panel border border-border shadow-panel flex items-center justify-center"
        aria-label="Параметры фрагмента"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      <MascotAssistant />
      <ImportDialog
        open={importOpen}
        onOpenChange={(o) => { setImportOpen(o); if (!o) setSection("layout"); }}
        existingIds={fragments.map((f) => f.id)}
        onImport={importFragments}
      />
      <Toaster position="top-center" />

    </div>
  );
}

function TopBar({
  onOpenNav,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  onOpenNav: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <header className="h-14 shrink-0 border-b border-border bg-panel flex items-center gap-2 px-3 md:px-4">
      <button
        onClick={onOpenNav}
        className="lg:hidden h-9 w-9 rounded-md hover:bg-secondary flex items-center justify-center"
        aria-label="Меню"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden md:flex items-center gap-2 px-3.5 h-10 min-w-[320px] rounded-lg border border-border bg-background text-sm whitespace-nowrap">
        <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Кейс:</span>
        <span className="font-medium">2025-05-20_Печень_Биопсия</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <IconBtn aria-label="Отменить" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn aria-label="Повторить" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconBtn>
        <Button
          className="ml-2 h-9 px-4"
          onClick={() => toast("Сшивка запущена", { description: "Результат появится в разделе «Просмотр»." })}
        >
          Сделать
        </Button>
      </div>
    </header>
  );
}


function IconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="h-9 w-9 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function NavRail({
  mobile = false,
  active = "layout",
  onSelect,
  onClose,
}: {
  mobile?: boolean;
  active?: string;
  onSelect?: (id: string) => void;
  onClose?: () => void;
}) {
  const items = [
    { id: "import", icon: Upload, label: "Импорт" },
    { id: "markers", icon: MapPin, label: "Маркеры" },
    { id: "layout", icon: LayoutGrid, label: "Макет" },
    { id: "registration", icon: Crosshair, label: "Регистрация" },
    { id: "preview", icon: Eye, label: "Просмотр" },
  ];
  const bottomItems = [
    { id: "settings", icon: Settings, label: "Настройки" },
    { id: "help", icon: HelpCircle, label: "Помощь" },
  ];
  const btnCls = (id: string) =>
    `flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-[11px] font-medium transition-colors ${
      active === id
        ? "bg-accent text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;
  return (
    <nav
      className={`${mobile ? "flex w-full" : "hidden lg:flex w-[88px]"} shrink-0 border-r border-border bg-panel flex-col items-stretch py-3`}
    >
      {mobile && (
        <button
          onClick={onClose}
          aria-label="Свернуть меню"
          className="mx-2 mb-2 flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
          <span>Меню</span>
        </button>
      )}
      <div className="flex flex-col gap-1 px-2">
        {items.map((it) => (
          <button key={it.id} onClick={() => onSelect?.(it.id)} className={btnCls(it.id)}>
            <it.icon className="h-5 w-5" />
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-1 px-2">
        {bottomItems.map((it) => (
          <button key={it.id} onClick={() => onSelect?.(it.id)} className={btnCls(it.id)}>
            <it.icon className="h-5 w-5" />
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Canvas({
  fragments,
  selectedId,
  onSelect,
  zoom,
  setZoom,
  placements,
  updatePlacement,
  commitHistory,
  inkOn,
  inkLevels,
  inkVisible,
  paintMode,
  strokes,
  brushColor,
  brushSize,
  brushTool,
  addStroke,
  updateStrokePoints,
  eraseNear,
  snapshotStrokes,
  matchedColorsByFragment,
  registrationMode,
  regMode,
  regPair,
  controlPoints,
  addControlPoint,
  removeControlPoint,
  pendingPlacements,
}: {
  fragments: Fragment[];
  selectedId: string;
  onSelect: (id: string) => void;
  zoom: number;
  setZoom: (n: number) => void;
  placements: Record<string, Placement>;
  updatePlacement: (id: string, patch: Partial<Placement>) => void;
  commitHistory: () => void;
  inkOn: boolean;
  inkLevels: InkLevels;
  inkVisible: InkVisibility;
  paintMode: boolean;
  strokes: MarkerStroke[];
  brushColor: string;
  brushSize: number;
  brushTool: MarkerTool;
  addStroke: (s: MarkerStroke) => void;
  updateStrokePoints: (id: string, points: MarkerPoint[]) => void;
  eraseNear: (fid: string, x: number, y: number, radius: number) => void;
  snapshotStrokes: () => void;
  matchedColorsByFragment: Map<string, Set<string>>;
  registrationMode: boolean;
  regMode: "auto" | "semi" | "manual";
  regPair: [string, string] | null;
  controlPoints: ControlPoint[];
  addControlPoint: (fid: string, x: number, y: number) => void;
  removeControlPoint: (id: string) => void;
  pendingPlacements: Record<string, Placement> | null;
}) {

  const layerRef = useRef<HTMLDivElement | null>(null);

  const startDrag = (id: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(id);
    const layer = layerRef.current;
    if (!layer) return;
    commitHistory();

    const rect = layer.getBoundingClientRect();
    const start = placements[id];
    const startPx = { x: e.clientX, y: e.clientY };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startPx.x) / rect.width) * 100;
      const dy = ((ev.clientY - startPx.y) / rect.height) * 100;
      updatePlacement(id, {
        x: Math.max(-5, Math.min(95, start.x + dx)),
        y: Math.max(-5, Math.min(95, start.y + dy)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (id: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const layer = layerRef.current;
    if (!layer) return;
    commitHistory();

    const rect = layer.getBoundingClientRect();
    const start = placements[id];
    const startPx = { x: e.clientX, y: e.clientY };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startPx.x) / rect.width) * 100;
      const dy = ((ev.clientY - startPx.y) / rect.height) * 100;
      const delta = (dx + dy) / 2;
      updatePlacement(id, { w: Math.max(6, Math.min(80, start.w + delta)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRotate = (id: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).closest("[data-fragment]") as HTMLElement | null;
    if (!el) return;
    commitHistory();
    const box = el.getBoundingClientRect();

    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const angle =
        (Math.atan2(ev.clientY - center.y, ev.clientX - center.x) * 180) / Math.PI + 90;
      updatePlacement(id, { rot: Math.round(angle * 10) / 10 });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };


  const startPaint = (id: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(id);
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const target = e.currentTarget as HTMLElement;
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const toLocal = (cx: number, cy: number) => ({
      x: Math.max(0, Math.min(100, ((cx - box.left) / box.width) * 100)),
      y: Math.max(0, Math.min(100, ((cy - box.top) / box.height) * 100)),
    });
    if (brushTool === "eraser") {
      snapshotStrokes();
      const radius = Math.max(1.5, brushSize * 1.4);
      const p0 = toLocal(e.clientX, e.clientY);
      eraseNear(id, p0.x, p0.y, radius);
      const move = (ev: PointerEvent) => {
        const p = toLocal(ev.clientX, ev.clientY);
        eraseNear(id, p.x, p.y, radius);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    snapshotStrokes();
    const strokeId = `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const first = toLocal(e.clientX, e.clientY);
    const points: MarkerPoint[] = [first, { x: first.x + 0.01, y: first.y + 0.01 }];
    addStroke({
      id: strokeId,
      fragmentId: id,
      color: brushColor,
      size: brushSize,
      points: [...points],
      createdAt: Date.now(),
    });
    const move = (ev: PointerEvent) => {
      const p = toLocal(ev.clientX, ev.clientY);
      const last = points[points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.4) return;
      points.push(p);
      updateStrokePoints(strokeId, points);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="relative flex-1 min-h-0 bg-canvas overflow-hidden">
      {/* Guides */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-border/80" />
        <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-border/80" />
      </div>

      {paintMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-panel border border-border shadow-panel px-3 py-1 text-[11px] font-medium text-muted-foreground flex items-center gap-2 pointer-events-none">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brushColor }} />
          Режим маркеров: {brushTool === "brush" ? "кисть" : "ластик"} · {brushSize}px
        </div>
      )}
      {registrationMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-panel border border-border shadow-panel px-3 py-1 text-[11px] font-medium text-muted-foreground flex items-center gap-2 pointer-events-none max-w-[92vw]">
          <Crosshair className="h-3 w-3 text-primary" />
          {regMode === "manual"
            ? "Ручной режим: тяните фрагмент, используйте маркеры трансформации."
            : regMode === "semi"
              ? regPair
                ? `Полуавто: ставьте точки на ${regPair[0]} и ${regPair[1]} поочерёдно.`
                : "Полуавто: выберите пару фрагментов в правой панели."
              : "Авто: нажмите «Выполнить регистрацию» для расчёта."}
        </div>
      )}

      {/* Fragments layer */}
      <div
        ref={layerRef}
        className="absolute inset-6 md:inset-10 transition-transform"
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}
      >

        {fragments.map((f) => {
          const isSel = f.id === selectedId;
          const p = (pendingPlacements ?? placements)[f.id];
          const matchedColors = matchedColorsByFragment.get(f.id);
          const fragStrokes = strokes.filter((s) => s.fragmentId === f.id);
          const fragCPs = controlPoints.filter((cp) => cp.fragmentId === f.id);
          const isInPair = regPair?.includes(f.id) ?? false;
          const cpAddMode = registrationMode && regMode === "semi" && isInPair;
          const isPreview = !!pendingPlacements && placements[f.id] !== p;
          const onFragmentPointerDown = paintMode
            ? startPaint(f.id)
            : cpAddMode
              ? (e: ReactPointerEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSelect(f.id);
                  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const lx = Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100));
                  const ly = Math.max(0, Math.min(100, ((e.clientY - box.top) / box.height) * 100));
                  addControlPoint(f.id, lx, ly);
                }
              : startDrag(f.id);
          return (
            <div
              key={f.id}
              data-fragment={f.id}
              onPointerDown={onFragmentPointerDown}
              className={`absolute group touch-none select-none ${paintMode ? (brushTool === "eraser" ? "cursor-cell" : "cursor-crosshair") : cpAddMode ? "cursor-crosshair" : "cursor-move"}`}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.w}%`,
                transform: `rotate(${p.rot}deg)`,
                transformOrigin: "center",
              }}
              aria-label={`Фрагмент ${f.label}`}
            >
              <div className="relative">
                <div
                  className="aspect-[3/2] rounded-sm shadow-panel overflow-hidden relative"
                  style={{
                    outline: isPreview
                      ? "2px dashed color-mix(in oklch, var(--primary) 80%, transparent)"
                      : isInPair && registrationMode
                        ? "2px solid color-mix(in oklch, var(--primary) 70%, transparent)"
                        : isSel ? "2px solid var(--primary)" : "none",
                    outlineOffset: isSel || isPreview || isInPair ? 2 : 0,
                  }}
                >
                  <FragmentImage
                    fragment={f}
                    className="w-full h-full pointer-events-none"
                    style={{ transform: p.flip ? "scaleX(-1)" : undefined }}
                  />
                  {inkOn &&
                    INK_MARKERS.map((m) => {
                      const key = inkKey(f.id, m.label);
                      if (!inkVisible[key]) return null;
                      const level = inkLevels[key] ?? 0;
                      if (level <= 0) return null;
                      const thickness = 3 + (level / 100) * 12; // 3–15% of side
                      const opacity = 0.35 + (level / 100) * 0.5;
                      const side: React.CSSProperties = { position: "absolute", backgroundColor: m.color, opacity, pointerEvents: "none" };
                      if (m.edge === "top") Object.assign(side, { top: 0, left: 0, right: 0, height: `${thickness}%` });
                      if (m.edge === "bottom") Object.assign(side, { bottom: 0, left: 0, right: 0, height: `${thickness}%` });
                      if (m.edge === "left") Object.assign(side, { top: 0, bottom: 0, left: 0, width: `${thickness}%` });
                      if (m.edge === "right") Object.assign(side, { top: 0, bottom: 0, right: 0, width: `${thickness}%` });
                      return <span key={m.label} style={side} />;
                    })}

                  {/* Painted marker strokes */}
                  {fragStrokes.length > 0 && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {fragStrokes.map((s) => {
                        const isMatch = matchedColors?.has(s.color);
                        const pts = s.points.map((pt) => `${pt.x},${pt.y}`).join(" ");
                        return (
                          <g key={s.id}>
                            {isMatch && (
                              <polyline
                                points={pts}
                                stroke={s.color}
                                strokeWidth={s.size + 3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                                opacity={0.35}
                              />
                            )}
                            <polyline
                              points={pts}
                              stroke={s.color}
                              strokeWidth={s.size}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                              vectorEffect="non-scaling-stroke"
                            />
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>

                  {/* Control points overlay */}
                  {registrationMode && fragCPs.length > 0 && (
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{ pointerEvents: "none" }}
                    >
                      {fragCPs.map((cp) => {
                        const color = cpColor(cp.pairId);
                        const flipTx = p.flip ? `translate(${cp.x},${cp.y}) scale(-1,1) translate(${-cp.x},${-cp.y})` : "";
                        return (
                          <g key={cp.id} transform={flipTx}>
                            <circle cx={cp.x} cy={cp.y} r={2.2} fill={color} stroke="#fff" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                            <text
                              x={cp.x}
                              y={cp.y + 0.8}
                              fill="#fff"
                              fontSize={2.4}
                              fontWeight={700}
                              textAnchor="middle"
                              style={{ paintOrder: "stroke", stroke: color, strokeWidth: 0.2 } as React.CSSProperties}
                            >
                              {cp.pairId}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>

                {isSel && !paintMode && !registrationMode && (
                  <SelectionHandles
                    onResize={startResize(f.id)}
                    onRotate={startRotate(f.id)}
                    onFlip={(e) => {
                      e.stopPropagation();
                      updatePlacement(f.id, { flip: !p.flip });
                    }}
                  />
                )}

                <span className="absolute -bottom-5 left-0 text-[10px] px-1.5 py-0.5 rounded bg-panel/90 border border-border text-muted-foreground pointer-events-none flex items-center gap-1">
                  {f.label}
                  {matchedColors && matchedColors.size > 0 && (
                    <span className="inline-flex items-center gap-0.5 ml-1 text-primary" title="Есть совпадения по маркерам">
                      <Link2 className="h-2.5 w-2.5" />
                      {matchedColors.size}
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
        {/* alignment cross marks */}
        {[
          [25, 40], [75, 40], [50, 55], [20, 78], [80, 78],
        ].map(([x, y], i) => (
          <span
            key={i}
            className="absolute text-muted-foreground/50 text-xs select-none pointer-events-none"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            +
          </span>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="absolute left-3 bottom-3 md:left-4 md:bottom-4 flex items-center gap-1 rounded-lg bg-panel border border-border shadow-panel px-1.5 py-1">
        <IconBtn onClick={() => setZoom(Math.max(10, zoom - 5))} aria-label="Уменьшить">
          <Minus className="h-4 w-4" />
        </IconBtn>
        <span className="text-xs font-medium w-10 text-center tabular-nums">{zoom}%</span>
        <IconBtn onClick={() => setZoom(Math.min(400, zoom + 5))} aria-label="Увеличить">
          <Plus className="h-4 w-4" />
        </IconBtn>
        <div className="w-px h-5 bg-border mx-1" />
        <IconBtn onClick={() => setZoom(100)} aria-label="По размеру"><Maximize2 className="h-4 w-4" /></IconBtn>
        <IconBtn aria-label="Панорама"><Move className="h-4 w-4" /></IconBtn>

      </div>
    </div>
  );
}

function SelectionHandles({
  onResize,
  onRotate,
  onFlip,
}: {

  onResize: (e: ReactPointerEvent) => void;
  onRotate: (e: ReactPointerEvent) => void;
  onFlip: (e: ReactPointerEvent) => void;
}) {
  const handle = "absolute w-2.5 h-2.5 bg-panel border border-primary rounded-[2px]";
  return (
    <>
      <span className={`${handle} -top-1 -left-1`} />
      <span className={`${handle} -top-1 left-1/2 -translate-x-1/2`} />
      <span className={`${handle} -top-1 -right-1`} />
      <span className={`${handle} top-1/2 -left-1 -translate-y-1/2`} />
      <span
        onPointerDown={onResize}
        className={`${handle} top-1/2 -right-1 -translate-y-1/2 cursor-ew-resize`}
      />
      <span className={`${handle} -bottom-1 -left-1`} />
      <span className={`${handle} -bottom-1 left-1/2 -translate-x-1/2`} />
      <span
        onPointerDown={onResize}
        className={`${handle} -bottom-1 -right-1 cursor-nwse-resize`}
        style={{ width: 14, height: 14 }}
      />
      <span
        onPointerDown={onRotate}
        title="Повернуть"
        className="absolute -top-7 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full border border-primary bg-panel cursor-grab flex items-center justify-center"
      >
        <RotateCcw className="h-2.5 w-2.5 text-primary" />
      </span>
      <button
        type="button"
        onPointerDown={onFlip}
        title="Отразить по горизонтали"
        className="absolute -top-7 left-[calc(50%+18px)] -translate-x-1/2 h-4 w-4 rounded-full border border-primary bg-panel flex items-center justify-center hover:bg-accent"
      >
        <FlipHorizontal className="h-2.5 w-2.5 text-primary" />
      </button>
    </>
  );
}



function BottomBar({
  fragments,
  selectedId,
  onSelect,
  onCollapse,
}: {
  fragments: Fragment[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="shrink-0 bg-panel border-t border-border px-3 md:px-4 py-3">
      <div className="flex items-start gap-3 md:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold">Фрагменты ({fragments.length})</h2>
            <button
              onClick={onCollapse}
              className="h-6 w-6 rounded hover:bg-secondary text-muted-foreground flex items-center justify-center"
              aria-label="Свернуть"
            >
              <ChevronUp className="h-4 w-4 rotate-180" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {fragments.map((f) => {

              const isSel = f.id === selectedId;
              return (
                <button
                  key={f.id}
                  onClick={() => onSelect(f.id)}
                  className={`snap-start shrink-0 w-28 md:w-32 rounded-lg bg-background overflow-hidden transition-shadow ${
                    isSel ? "ring-2 ring-primary/25" : "hover:ring-1 hover:ring-primary/20"
                  }`}
                >
                  <div className="aspect-[3/2] bg-white">
                    <FragmentImage fragment={f} className="w-full h-full" />
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {f.label}
                    </span>
                    <span className="text-muted-foreground">⋮</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="hidden md:flex shrink-0 items-center gap-3 border-l border-border pl-4 self-stretch">
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke="var(--primary)" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(68 / 100) * 97.4} 100`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
              68%
            </span>
          </div>
          <div className="text-xs">
            <div className="font-semibold text-sm mb-0.5">Сборка</div>
            <div className="text-muted-foreground">Совпадений: 124</div>
            <div className="text-muted-foreground">Ошибок: 2</div>
            <button className="mt-1 text-primary hover:underline">Подробности</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentParams({
  fragment,
  placement,
  updatePlacement,
  resetPlacement,
  inkLevels,
  setInkLevel,
  inkVisible,
  toggleInkVisible,
  mode,
  setMode,
  inkOn,
  setInkOn,
}: {
  fragment: Fragment;
  placement: Placement;
  updatePlacement: (id: string, patch: Partial<Placement>) => void;
  resetPlacement: (id: string) => void;
  inkLevels: InkLevels;
  setInkLevel: (fid: string, label: string, value: number) => void;
  inkVisible: InkVisibility;
  toggleInkVisible: (fid: string, label: string) => void;
  mode: "auto" | "semi" | "manual";
  setMode: (m: "auto" | "semi" | "manual") => void;
  inkOn: boolean;
  setInkOn: (b: boolean) => void;
}) {

  // Convert placement (% of canvas) to a pseudo-micrometer value for display.
  const pctToMkm = (v: number) => Math.round(v * 100);
  const mkmToPct = (v: number) => v / 100;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(fragment.id);
      toast("ID скопирован", { description: fragment.id });
    } catch {
      toast("Не удалось скопировать");
    }
  };

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-base font-semibold">Фрагмент</h3>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>ID: {fragment.id}</span>
          <button
            onClick={copyId}
            className="h-6 w-6 rounded hover:bg-secondary flex items-center justify-center"
            aria-label="Скопировать ID"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        <ParamRow
          label="Сдвиг X"
          value={pctToMkm(placement.x)}
          unit="мкм"
          onChange={(v) => updatePlacement(fragment.id, { x: mkmToPct(v) })}
        />
        <ParamRow
          label="Сдвиг Y"
          value={pctToMkm(placement.y)}
          unit="мкм"
          onChange={(v) => updatePlacement(fragment.id, { y: mkmToPct(v) })}
        />
        <ParamRow
          label="Поворот"
          value={Math.round(placement.rot * 10) / 10}
          unit="°"
          step={0.5}
          onChange={(v) => updatePlacement(fragment.id, { rot: v })}
        />
        <ParamRow
          label="Масштаб"
          value={Math.round(placement.w * 10) / 10}
          unit="%"
          onChange={(v) =>
            updatePlacement(fragment.id, { w: Math.max(6, Math.min(80, v)) })
          }
        />
      </div>

      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Маркеры туши</span>
          <Switch checked={inkOn} onCheckedChange={setInkOn} />
        </div>
        <ul className={`space-y-2.5 ${inkOn ? "" : "opacity-50 pointer-events-none"}`}>
          {INK_MARKERS.map((m) => {
            const pct = inkLevels[inkKey(fragment.id, m.label)] ?? 66;
            return (
              <li key={m.label} className="flex items-center gap-2.5">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                <div className="relative flex-1 h-4 flex items-center">
                  <div className="relative flex-1 h-1.5 rounded-full bg-secondary pointer-events-none">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: m.color,
                        opacity: 0.55,
                      }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-panel border-2 shadow-sm"
                      style={{ left: `${pct}%`, borderColor: m.color }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) =>
                      setInkLevel(fragment.id, m.label, Number(e.target.value))
                    }
                    aria-label={`Маркер туши ${m.label}`}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => toggleInkVisible(fragment.id, m.label)}
                  aria-label={inkVisible[inkKey(fragment.id, m.label)] ? "Скрыть" : "Показать"}
                  className="h-6 w-6 rounded hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                >
                  {inkVisible[inkKey(fragment.id, m.label)] ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <span className="text-xs w-8 text-right tabular-nums">{pct}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="flex items-center gap-1 mb-2">
          <span className="text-sm font-medium">Режим</span>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1 text-xs font-medium">
          {[
            { id: "auto", label: "Авто" },
            { id: "semi", label: "Полуавто" },
            { id: "manual", label: "Ручной" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as "auto" | "semi" | "manual")}
              className={`py-1.5 rounded-md transition-colors ${
                mode === m.id
                  ? "bg-panel shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full h-9 gap-2"
        onClick={() => resetPlacement(fragment.id)}
      >
        <RotateCcw className="h-4 w-4" /> Сбросить трансформации
      </Button>

      <button className="w-full flex items-center justify-between text-sm py-2 border-t border-border pt-3">
        <span className="text-muted-foreground">Дополнительно</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function ParamRow({
  label,
  value,
  unit,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step?: number;
  onChange?: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground w-16">{label}</label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange?.(v);
        }}
        className="h-8 text-sm flex-1"
      />
      <span className="text-xs text-muted-foreground w-8">{unit}</span>
    </div>
  );
}

function MarkerTools({
  fragment,
  strokes,
  matches,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  brushTool,
  setBrushTool,
  onUndo,
  canUndo,
  onClear,
  onExport,
}: {
  fragment: Fragment;
  strokes: MarkerStroke[];
  matches: { a: string; b: string; colors: string[] }[];
  brushColor: string;
  setBrushColor: (c: string) => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  brushTool: MarkerTool;
  setBrushTool: (t: MarkerTool) => void;
  onUndo: () => void;
  canUndo: boolean;
  onClear: () => void;
  onExport: () => void;
}) {
  const fragStrokes = strokes.filter((s) => s.fragmentId === fragment.id);
  const relatedMatches = matches.filter((m) => m.a === fragment.id || m.b === fragment.id);
  return (
    <div className="p-4 space-y-4 border-b border-border bg-accent/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Маркеры туши</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Нанесите цветную тушь на любой участок края фрагмента.
          </p>
        </div>
        <MapPin className="h-5 w-5 text-primary" />
      </div>

      {/* Tool switch */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 text-xs font-medium">
        <button
          onClick={() => setBrushTool("brush")}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
            brushTool === "brush" ? "bg-panel shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Brush className="h-3.5 w-3.5" /> Кисть
        </button>
        <button
          onClick={() => setBrushTool("eraser")}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
            brushTool === "eraser" ? "bg-panel shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eraser className="h-3.5 w-3.5" /> Ластик
        </button>
      </div>

      {/* Palette */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Цвет</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {MARKER_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => { setBrushColor(c); setBrushTool("brush"); }}
              aria-label={`Цвет ${c}`}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${
                brushColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="h-6 w-6 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer overflow-hidden relative" title="Свой цвет">
            <Plus className="h-3 w-3 text-muted-foreground" />
            <input
              type="color"
              value={brushColor}
              onChange={(e) => { setBrushColor(e.target.value); setBrushTool("brush"); }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Brush size */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Размер кисти</span>
          <span className="tabular-nums text-foreground">{brushSize}px</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label="Размер кисти"
        />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs px-2"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo2 className="h-3.5 w-3.5" /> Отменить
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs px-2"
          onClick={onClear}
          disabled={fragStrokes.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" /> Очистить
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs px-2"
          onClick={onExport}
        >
          <Download className="h-3.5 w-3.5" /> Экспорт
        </Button>
      </div>

      {/* Stats */}
      <div className="rounded-lg border border-border bg-panel p-2.5 text-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Штрихов на фрагменте</span>
          <span className="font-medium tabular-nums">{fragStrokes.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Всего маркеров в кейсе</span>
          <span className="font-medium tabular-nums">{strokes.length}</span>
        </div>
        <div className="pt-1 border-t border-border">
          <div className="flex items-center gap-1 text-muted-foreground mb-1">
            <Link2 className="h-3 w-3 text-primary" />
            Возможные соседи ({relatedMatches.length})
          </div>
          {relatedMatches.length === 0 ? (
            <div className="text-muted-foreground/70 text-[11px]">
              Пометьте одинаковым цветом края соседних фрагментов, чтобы система предложила стыковку.
            </div>
          ) : (
            <ul className="space-y-1">
              {relatedMatches.map((m, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="font-medium">{m.a === fragment.id ? m.b : m.a}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {m.colors.map((c) => (
                      <span
                        key={c}
                        className="h-2.5 w-2.5 rounded-full border border-border"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


