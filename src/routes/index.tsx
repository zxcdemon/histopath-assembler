import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  ChevronUp,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { FRAGMENTS, FragmentImage, type Fragment } from "@/components/HistologyCanvas";
import { MascotAssistant } from "@/components/MascotAssistant";
import { Toaster } from "@/components/ui/sonner";
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
  { color: "oklch(0.20 0.02 260)", label: "Чёрный", count: 4 },
  { color: "oklch(0.60 0.22 27)", label: "Красный", count: 4 },
  { color: "oklch(0.58 0.20 260)", label: "Синий", count: 4 },
  { color: "oklch(0.62 0.18 145)", label: "Зелёный", count: 4 },
];

function Workspace() {
  const [selectedId, setSelectedId] = useState<string>("F-03");
  const [mode, setMode] = useState<"auto" | "semi" | "manual">("auto");
  const [inkOn, setInkOn] = useState(true);
  const [zoom, setZoom] = useState(28);
  const [navOpen, setNavOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);

  const selected = useMemo(
    () => FRAGMENTS.find((f) => f.id === selectedId) ?? FRAGMENTS[0],
    [selectedId],
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar onOpenNav={() => setNavOpen(true)} />
      <div className="flex-1 flex min-h-0">
        {/* Desktop nav */}
        <NavRail />
        {/* Mobile nav */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="p-0 w-[104px] sm:max-w-[104px] border-r-0">
            <SheetTitle className="sr-only">Навигация</SheetTitle>
            <NavRail mobile />
          </SheetContent>
        </Sheet>

        <main className="flex-1 flex flex-col min-w-0 relative">
          <Canvas
            selectedId={selected.id}
            onSelect={setSelectedId}
            zoom={zoom}
            setZoom={setZoom}
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

function NavRail({ mobile = false }: { mobile?: boolean }) {
  const items = [
    { icon: Upload, label: "Импорт" },
    { icon: MapPin, label: "Маркеры" },
    { icon: LayoutGrid, label: "Макет", active: true },
    { icon: Crosshair, label: "Регистрация" },
    { icon: Eye, label: "Просмотр" },
  ];
  return (
    <nav
      className={`${mobile ? "flex w-full" : "hidden lg:flex w-[88px]"} shrink-0 border-r border-border bg-panel flex-col items-stretch py-3`}
    >
      <div className="flex flex-col gap-1 px-2">
        {items.map((it) => (
          <button
            key={it.label}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-[11px] font-medium transition-colors ${
              it.active
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <it.icon className="h-5 w-5" />
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-1 px-2">
        <button className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] text-muted-foreground hover:bg-secondary">
          <Settings className="h-5 w-5" /> <span>Настройки</span>
        </button>
        <button className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] text-muted-foreground hover:bg-secondary">
          <HelpCircle className="h-5 w-5" /> <span>Помощь</span>
        </button>
      </div>
    </nav>
  );
}

function Canvas({
  selectedId,
  onSelect,
  zoom,
  setZoom,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  zoom: number;
  setZoom: (n: number) => void;
}) {
  return (
    <div className="relative flex-1 min-h-0 bg-canvas overflow-hidden">
      {/* Guides */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-border/80" />
        <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-border/80" />
      </div>

      {/* Fragments layer */}
      <div className="absolute inset-6 md:inset-10">
        {FRAGMENTS.map((f) => {
          const isSel = f.id === selectedId;
          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="absolute group"
              style={{
                left: `${f.place.x}%`,
                top: `${f.place.y}%`,
                width: `${f.place.w}%`,
                transform: `rotate(${f.place.rot}deg)`,
                transformOrigin: "center",
              }}
              aria-label={`Выбрать фрагмент ${f.label}`}
            >
              <div className="relative">
                <div
                  className="aspect-[3/2] rounded-sm shadow-panel bg-white p-1.5"
                  style={{
                    outline: isSel ? "2px solid var(--primary)" : "1px solid oklch(0 0 0 / 0.06)",
                    outlineOffset: isSel ? 2 : 0,
                  }}
                >
                  <FragmentImage fragment={f} className="w-full h-full rounded-[2px]" />
                </div>
                {isSel && <SelectionHandles />}
                <span className="absolute -bottom-5 left-0 text-[10px] px-1.5 py-0.5 rounded bg-panel/90 border border-border text-muted-foreground">
                  {f.label}
                </span>
              </div>
            </button>
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
        <IconBtn aria-label="По размеру"><Maximize2 className="h-4 w-4" /></IconBtn>
        <IconBtn aria-label="Панорама"><Move className="h-4 w-4" /></IconBtn>
      </div>
    </div>
  );
}

function SelectionHandles() {
  const handle = "absolute w-2 h-2 bg-panel border border-primary rounded-[2px]";
  return (
    <>
      <span className={`${handle} -top-1 -left-1`} />
      <span className={`${handle} -top-1 left-1/2 -translate-x-1/2`} />
      <span className={`${handle} -top-1 -right-1`} />
      <span className={`${handle} top-1/2 -left-1 -translate-y-1/2`} />
      <span className={`${handle} top-1/2 -right-1 -translate-y-1/2`} />
      <span className={`${handle} -bottom-1 -left-1`} />
      <span className={`${handle} -bottom-1 left-1/2 -translate-x-1/2`} />
      <span className={`${handle} -bottom-1 -right-1`} />
      <span className="absolute -top-6 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full border border-primary bg-panel" />
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
                  className={`snap-start shrink-0 w-28 md:w-32 rounded-lg border bg-background overflow-hidden transition-shadow ${
                    isSel ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/40"
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
  mode,
  setMode,
  inkOn,
  setInkOn,
}: {
  fragment: Fragment;
  mode: "auto" | "semi" | "manual";
  setMode: (m: "auto" | "semi" | "manual") => void;
  inkOn: boolean;
  setInkOn: (b: boolean) => void;
}) {
  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-base font-semibold">Фрагмент</h3>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>ID: {fragment.id}</span>
          <button className="h-6 w-6 rounded hover:bg-secondary flex items-center justify-center">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        <ParamRow label="Сдвиг X" value="-1,250" unit="мкм" />
        <ParamRow label="Сдвиг Y" value="860" unit="мкм" />
        <ParamRow label="Поворот" value={String(fragment.place.rot)} unit="°" />
        <ParamRow label="Масштаб" value="100" unit="%" lock />
      </div>

      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Маркеры туши</span>
          <Switch checked={inkOn} onCheckedChange={setInkOn} />
        </div>
        <ul className="space-y-2.5">
          {INK_MARKERS.map((m) => {
            const pct = 66;
            return (
              <li key={m.label} className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                <div className="relative flex-1 h-1.5 rounded-full bg-secondary">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: m.color, opacity: 0.55 }}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-panel border-2 shadow-sm"
                    style={{ left: `${pct}%`, borderColor: m.color }}
                  />
                </div>
                <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs w-4 text-right tabular-nums">{m.count}</span>
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

      <Button variant="outline" className="w-full h-9 gap-2">
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
  lock = false,
}: {
  label: string;
  value: string;
  unit: string;
  lock?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground w-16">{label}</label>
      <Input defaultValue={value} className="h-8 text-sm flex-1" />
      <span className="text-xs text-muted-foreground w-8">{unit}</span>
      {lock && (
        <button className="h-6 w-6 rounded hover:bg-secondary flex items-center justify-center text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
