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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { FRAGMENTS, FragmentImage, type Fragment } from "@/components/HistologyCanvas";
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
  const [placements, setPlacements] = useState<Record<string, Placement>>(() =>
    Object.fromEntries(FRAGMENTS.map((f) => [f.id, { ...f.place }])),
  );
  const [inkLevels, setInkLevels] = useState<InkLevels>(() => {
    const init: InkLevels = {};
    FRAGMENTS.forEach((f) =>
      INK_MARKERS.forEach((m) => (init[inkKey(f.id, m.label)] = 66)),
    );
    return init;
  });
  const [inkVisible, setInkVisible] = useState<InkVisibility>(() => {
    const init: InkVisibility = {};
    FRAGMENTS.forEach((f) =>
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
    const src = FRAGMENTS.find((f) => f.id === id);
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

  const selected = useMemo(
    () => FRAGMENTS.find((f) => f.id === selectedId) ?? FRAGMENTS[0],
    [selectedId],
  );

  // Keyboard shortcuts: arrows nudge, R rotate, F flip, Esc deselect, Ctrl+Z/Y undo/redo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
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
  }, [selected, placements, commitHistory, undo, redo]);

  const handleSection = (id: string) => {
    setSection(id);
    setNavOpen(false);
    const labels: Record<string, string> = {
      import: "Импорт", markers: "Маркеры", layout: "Макет",
      registration: "Регистрация", preview: "Просмотр",
      settings: "Настройки", help: "Помощь",
    };
    if (id !== "layout") toast(`Раздел «${labels[id]}»`, { description: "Открыт выбранный раздел." });
  };


  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar onOpenNav={() => setNavOpen(true)} />
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
            selectedId={selected.id}
            onSelect={setSelectedId}
            zoom={zoom}
            setZoom={setZoom}
            placements={placements}
            updatePlacement={updatePlacement}
          />

          {bottomOpen ? (
            <BottomBar
              selectedId={selected.id}
              onSelect={setSelectedId}
              onCollapse={() => setBottomOpen(false)}
            />
          ) : (
            <button
              onClick={() => setBottomOpen(true)}
              className="mx-3 mb-3 self-start rounded-lg bg-panel border border-border shadow-panel px-3 py-1.5 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Фрагменты ({FRAGMENTS.length})
            </button>
          )}
        </main>

        {/* Desktop right panel */}
        <aside className="hidden lg:block w-[300px] border-l border-border bg-panel overflow-y-auto">
          <FragmentParams
            fragment={selected}
            placement={placements[selected.id]}
            updatePlacement={updatePlacement}
            resetPlacement={resetPlacement}
            inkLevels={inkLevels}
            setInkLevel={setInkLevel}
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
            <FragmentParams
              fragment={selected}
              placement={placements[selected.id]}
              updatePlacement={updatePlacement}
              resetPlacement={resetPlacement}
              inkLevels={inkLevels}
              setInkLevel={setInkLevel}
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
      <Toaster position="top-center" />
    </div>
  );
}

function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
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
        <IconBtn aria-label="Отменить"><Undo2 className="h-4 w-4" /></IconBtn>
        <IconBtn aria-label="Повторить"><Redo2 className="h-4 w-4" /></IconBtn>
        <Button className="ml-2 h-9 px-4">Сделать</Button>
      </div>
    </header>
  );
}

function IconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="h-9 w-9 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
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
  selectedId,
  onSelect,
  zoom,
  setZoom,
  placements,
  updatePlacement,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  zoom: number;
  setZoom: (n: number) => void;
  placements: Record<string, Placement>;
  updatePlacement: (id: string, patch: Partial<Placement>) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);

  const startDrag = (id: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(id);
    const layer = layerRef.current;
    if (!layer) return;
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

  return (
    <div className="relative flex-1 min-h-0 bg-canvas overflow-hidden">
      {/* Guides */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-border/80" />
        <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-border/80" />
      </div>

      {/* Fragments layer */}
      <div
        ref={layerRef}
        className="absolute inset-6 md:inset-10 transition-transform"
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}
      >

        {FRAGMENTS.map((f) => {
          const isSel = f.id === selectedId;
          const p = placements[f.id];
          return (
            <div
              key={f.id}
              data-fragment={f.id}
              onPointerDown={startDrag(f.id)}
              className="absolute group touch-none select-none cursor-move"
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
                  className="aspect-[3/2] rounded-sm shadow-panel overflow-hidden"
                  style={{
                    outline: isSel ? "2px solid var(--primary)" : "none",
                    outlineOffset: isSel ? 2 : 0,
                  }}
                >
                  <FragmentImage
                    fragment={f}
                    className="w-full h-full pointer-events-none"
                    style={{ transform: p.flip ? "scaleX(-1)" : undefined }}
                  />
                </div>
                {isSel && (
                  <SelectionHandles
                    onResize={startResize(f.id)}
                    onRotate={startRotate(f.id)}
                    onFlip={(e) => {
                      e.stopPropagation();
                      updatePlacement(f.id, { flip: !p.flip });
                    }}
                  />
                )}

                <span className="absolute -bottom-5 left-0 text-[10px] px-1.5 py-0.5 rounded bg-panel/90 border border-border text-muted-foreground pointer-events-none">
                  {f.label}
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
  selectedId,
  onSelect,
  onCollapse,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="shrink-0 bg-panel border-t border-border px-3 md:px-4 py-3">
      <div className="flex items-start gap-3 md:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold">Фрагменты ({FRAGMENTS.length})</h2>
            <button
              onClick={onCollapse}
              className="h-6 w-6 rounded hover:bg-secondary text-muted-foreground flex items-center justify-center"
              aria-label="Свернуть"
            >
              <ChevronUp className="h-4 w-4 rotate-180" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {FRAGMENTS.map((f) => {
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

                <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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

