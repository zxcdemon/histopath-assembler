import { useEffect, useState } from "react";
import { ChevronDown, RotateCcw, Save, X, AlertTriangle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Units = "px" | "мкм" | "мм";
type Status = "draft" | "wip" | "ready";
type Quality = "low" | "medium" | "high";
type RegMode = "auto" | "semi" | "manual";
type RegPrecision = "fast" | "standard" | "high";
type RegTransforms = "translate" | "trans_rot" | "trans_rot_scale";
type ExportFormat = "png" | "ome-tiff" | "big-tiff";

export type FragmentFileInfo = {
  id: string;
  fileName: string;
  status: "uploaded" | "marked" | "registered" | "check";
};

export type AppSettings = {
  project: {
    name: string;
    date: string;
    material: "resection" | "biopsy" | "other";
    units: Units;
    sourceScale: string;
    status: Status;
  };
  display: {
    grid: boolean;
    borders: boolean;
    ids: boolean;
    ink: boolean;
    cps: boolean;
    seams: boolean;
    overlaps: boolean;
    warnings: boolean;
    opacity: number;
    quality: Quality;
    theme: "light" | "dark";
  };
  registration: {
    mode: RegMode;
    useInk: boolean;
    useCps: boolean;
    useEdges: boolean;
    useTextures: boolean;
    precision: RegPrecision;
    transforms: RegTransforms;
    noInpaint: boolean;
  };
  quality: {
    warnGaps: boolean;
    warnOverlaps: boolean;
    warnRotation: boolean;
    warnScale: boolean;
    warnUnused: boolean;
    warnUnconfirmed: boolean;
    warnUnsaved: boolean;
    minThreshold: number;
    requireConfirm: boolean;
  };
  export: {
    format: ExportFormat;
    metadata: boolean;
    transforms: boolean;
    ink: boolean;
    cps: boolean;
    borders: boolean;
    report: boolean;
  };
  performance: {
    tiled: boolean;
    cacheThumbs: boolean;
    maxPreview: number;
    showProgress: boolean;
  };
  autosave: {
    enabled: boolean;
    interval: number;
  };
};

export const DEFAULT_SETTINGS: AppSettings = {
  project: {
    name: "2025-05-20 Печень, биопсия",
    date: "2025-05-20",
    material: "biopsy",
    units: "мкм",
    sourceScale: "0.25 мкм/пиксель",
    status: "wip",
  },
  display: {
    grid: true, borders: true, ids: true, ink: true, cps: false,
    seams: true, overlaps: true, warnings: true,
    opacity: 90, quality: "medium", theme: "light",
  },
  registration: {
    mode: "auto",
    useInk: true, useCps: true, useEdges: true, useTextures: false,
    precision: "standard",
    transforms: "trans_rot_scale",
    noInpaint: true,
  },
  quality: {
    warnGaps: true, warnOverlaps: true, warnRotation: true, warnScale: true,
    warnUnused: true, warnUnconfirmed: true, warnUnsaved: true,
    minThreshold: 70,
    requireConfirm: true,
  },
  export: {
    format: "ome-tiff",
    metadata: true, transforms: true, ink: true, cps: true, borders: true, report: true,
  },
  performance: {
    tiled: true, cacheThumbs: true, maxPreview: 4096, showProgress: true,
  },
  autosave: { enabled: true, interval: 60 },
};

const STORAGE_KEY = "htg-settings:v1";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as AppSettings) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-secondary/60 rounded-lg"
      >
        <span>{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-1 space-y-2.5">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground min-w-0 flex-1">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md bg-secondary p-0.5 text-[11px] font-medium">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-2 py-1 rounded transition-colors ${
            value === o.id ? "bg-panel shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<FragmentFileInfo["status"], string> = {
  uploaded: "Загружен",
  marked: "Размечен",
  registered: "Зарегистр.",
  check: "Требует проверки",
};
const STATUS_STYLE: Record<FragmentFileInfo["status"], string> = {
  uploaded: "bg-secondary text-muted-foreground",
  marked: "bg-blue-500/10 text-blue-600 border border-blue-500/30",
  registered: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30",
  check: "bg-amber-500/10 text-amber-600 border border-amber-500/30",
};

export function SettingsPanel({
  open,
  onOpenChange,
  settings,
  onSave,
  files,
  onClearCache,
  onResetProject,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  files: FragmentFileInfo[];
  onClearCache: () => void;
  onResetProject: () => void;
  onRestore: () => void;
}) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);

  const patch = <K extends keyof AppSettings>(k: K, v: Partial<AppSettings[K]>) =>
    setDraft((d) => ({ ...d, [k]: { ...d[k], ...v } }));

  const save = () => {
    onSave(draft);
    toast.success("Настройки сохранены");
    onOpenChange(false);
  };
  const reset = () => {
    setDraft(DEFAULT_SETTINGS);
    toast("Настройки сброшены к значениям по умолчанию");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 w-[380px] sm:max-w-[420px] max-w-[92vw] flex flex-col gap-0"
      >
        <div className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle className="text-base font-semibold">Настройки</SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Проект, отображение, регистрация, качество, экспорт и производительность.
          </SheetDescription>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          <Section title="1. Проект" defaultOpen>
            <Row label="Название кейса">
              <Input
                value={draft.project.name}
                onChange={(e) => patch("project", { name: e.target.value })}
                className="h-8 text-xs w-48"
              />
            </Row>
            <Row label="Дата кейса">
              <Input
                type="date"
                value={draft.project.date}
                onChange={(e) => patch("project", { date: e.target.value })}
                className="h-8 text-xs w-40"
              />
            </Row>
            <Row label="Тип материала">
              <Segmented
                value={draft.project.material}
                onChange={(v) => patch("project", { material: v })}
                options={[
                  { id: "resection", label: "Резекция" },
                  { id: "biopsy", label: "Биопсия" },
                  { id: "other", label: "Другое" },
                ]}
              />
            </Row>
            <Row label="Количество фрагментов">
              <span className="tabular-nums font-medium">{files.length}</span>
            </Row>
            <Row label="Единицы">
              <Segmented
                value={draft.project.units}
                onChange={(v) => patch("project", { units: v })}
                options={[
                  { id: "px", label: "px" },
                  { id: "мкм", label: "мкм" },
                  { id: "мм", label: "мм" },
                ]}
              />
            </Row>
            <Row label="Исходный масштаб">
              <Input
                value={draft.project.sourceScale}
                onChange={(e) => patch("project", { sourceScale: e.target.value })}
                className="h-8 text-xs w-40"
              />
            </Row>
            <Row label="Статус проекта">
              <Segmented
                value={draft.project.status}
                onChange={(v) => patch("project", { status: v })}
                options={[
                  { id: "draft", label: "Черновик" },
                  { id: "wip", label: "В работе" },
                  { id: "ready", label: "Готов" },
                ]}
              />
            </Row>
            <div className="pt-2">
              <div className="text-[11px] text-muted-foreground mb-1.5">Загруженные фрагменты</div>
              <ul className="rounded border border-border divide-y divide-border bg-background max-h-40 overflow-y-auto">
                {files.length === 0 && (
                  <li className="px-2 py-2 text-[11px] text-muted-foreground">Нет фрагментов</li>
                )}
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
                    <span className="font-medium tabular-nums w-12 shrink-0">{f.id}</span>
                    <span className="truncate flex-1 text-muted-foreground">{f.fileName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${STATUS_STYLE[f.status]}`}>
                      {STATUS_LABEL[f.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section title="2. Отображение">
            {[
              ["grid", "Показывать сетку"],
              ["borders", "Границы фрагментов"],
              ["ids", "ID фрагментов"],
              ["ink", "Маркеры туши"],
              ["cps", "Контрольные точки"],
              ["seams", "Линии стыков"],
              ["overlaps", "Зоны наложения"],
              ["warnings", "Проблемные участки"],
            ].map(([k, l]) => (
              <Row key={k} label={l}>
                <Switch
                  checked={draft.display[k as keyof AppSettings["display"]] as boolean}
                  onCheckedChange={(v) => patch("display", { [k]: v } as Partial<AppSettings["display"]>)}
                />
              </Row>
            ))}
            <Row label={`Прозрачность при наложении (${draft.display.opacity}%)`}>
              <input
                type="range" min={20} max={100}
                value={draft.display.opacity}
                onChange={(e) => patch("display", { opacity: Number(e.target.value) })}
                className="w-32 accent-primary"
              />
            </Row>
            <Row label="Качество предпросмотра">
              <Segmented
                value={draft.display.quality}
                onChange={(v) => patch("display", { quality: v })}
                options={[
                  { id: "low", label: "Низкое" },
                  { id: "medium", label: "Среднее" },
                  { id: "high", label: "Высокое" },
                ]}
              />
            </Row>
            <Row label="Тема">
              <Segmented
                value={draft.display.theme}
                onChange={(v) => patch("display", { theme: v })}
                options={[
                  { id: "light", label: "Светлая" },
                  { id: "dark", label: "Тёмная" },
                ]}
              />
            </Row>
          </Section>

          <Section title="3. Регистрация и совмещение">
            <Row label="Режим по умолчанию">
              <Segmented
                value={draft.registration.mode}
                onChange={(v) => patch("registration", { mode: v })}
                options={[
                  { id: "auto", label: "Авто" },
                  { id: "semi", label: "Полуавто" },
                  { id: "manual", label: "Ручной" },
                ]}
              />
            </Row>
            {[
              ["useInk", "Использовать маркеры туши"],
              ["useCps", "Использовать контрольные точки"],
              ["useEdges", "Сравнение краёв ткани"],
              ["useTextures", "Сравнение текстур ткани"],
            ].map(([k, l]) => (
              <Row key={k} label={l}>
                <Switch
                  checked={draft.registration[k as keyof AppSettings["registration"]] as boolean}
                  onCheckedChange={(v) =>
                    patch("registration", { [k]: v } as Partial<AppSettings["registration"]>)
                  }
                />
              </Row>
            ))}
            <Row label="Точность">
              <Segmented
                value={draft.registration.precision}
                onChange={(v) => patch("registration", { precision: v })}
                options={[
                  { id: "fast", label: "Быстрая" },
                  { id: "standard", label: "Стандарт" },
                  { id: "high", label: "Высокая" },
                ]}
              />
            </Row>
            <Row label="Допустимые трансформации">
              <Segmented
                value={draft.registration.transforms}
                onChange={(v) => patch("registration", { transforms: v })}
                options={[
                  { id: "translate", label: "Сдвиг" },
                  { id: "trans_rot", label: "+ Поворот" },
                  { id: "trans_rot_scale", label: "+ Масштаб" },
                ]}
              />
            </Row>
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-amber-700">
                  Запретить автоматическое дорисовывание отсутствующих областей
                </div>
                <div className="text-amber-700/80">
                  Программа не должна генерировать ткань, которой нет на исходных сканах.
                </div>
              </div>
              <Switch
                checked={draft.registration.noInpaint}
                onCheckedChange={(v) => patch("registration", { noInpaint: v })}
              />
            </div>
          </Section>

          <Section title="4. Контроль качества">
            {[
              ["warnGaps", "Предупреждать: зазоры"],
              ["warnOverlaps", "Предупреждать: наложения"],
              ["warnRotation", "Предупреждать: сильный поворот"],
              ["warnScale", "Предупреждать: разный масштаб"],
              ["warnUnused", "Не все фрагменты использованы"],
              ["warnUnconfirmed", "Неподтверждённые стыки"],
              ["warnUnsaved", "Несохранённые изменения"],
            ].map(([k, l]) => (
              <Row key={k} label={l}>
                <Switch
                  checked={draft.quality[k as keyof AppSettings["quality"]] as boolean}
                  onCheckedChange={(v) => patch("quality", { [k]: v } as Partial<AppSettings["quality"]>)}
                />
              </Row>
            ))}
            <Row label={`Мин. порог качества (${draft.quality.minThreshold}%)`}>
              <input
                type="range" min={0} max={100}
                value={draft.quality.minThreshold}
                onChange={(e) => patch("quality", { minThreshold: Number(e.target.value) })}
                className="w-32 accent-primary"
              />
            </Row>
            <Row label="Ручное подтверждение проблемных стыков">
              <Switch
                checked={draft.quality.requireConfirm}
                onCheckedChange={(v) => patch("quality", { requireConfirm: v })}
              />
            </Row>
          </Section>

          <Section title="5. Экспорт">
            <Row label="Формат">
              <Segmented
                value={draft.export.format}
                onChange={(v) => patch("export", { format: v })}
                options={[
                  { id: "png", label: "PNG" },
                  { id: "ome-tiff", label: "OME-TIFF" },
                  { id: "big-tiff", label: "BigTIFF" },
                ]}
              />
            </Row>
            {[
              ["metadata", "Metadata проекта"],
              ["transforms", "Трансформации фрагментов"],
              ["ink", "Маркеры туши"],
              ["cps", "Контрольные точки"],
              ["borders", "Границы / маски фрагментов"],
              ["report", "Отчёт о качестве сборки"],
            ].map(([k, l]) => (
              <Row key={k} label={l}>
                <Switch
                  checked={draft.export[k as keyof AppSettings["export"]] as boolean}
                  onCheckedChange={(v) => patch("export", { [k]: v } as Partial<AppSettings["export"]>)}
                />
              </Row>
            ))}
            <div className="text-[11px] text-muted-foreground rounded border border-border bg-secondary/40 px-2 py-1.5">
              Экспорт выполняется в едином масштабе. Отсутствующие области ткани не дорисовываются.
            </div>
          </Section>

          <Section title="6. Производительность">
            {[
              ["tiled", "Тайловая загрузка больших изображений"],
              ["cacheThumbs", "Кэшировать миниатюры"],
              ["showProgress", "Индикатор загрузки .mrxs"],
            ].map(([k, l]) => (
              <Row key={k} label={l}>
                <Switch
                  checked={draft.performance[k as keyof AppSettings["performance"]] as boolean}
                  onCheckedChange={(v) => patch("performance", { [k]: v } as Partial<AppSettings["performance"]>)}
                />
              </Row>
            ))}
            <Row label={`Макс. разрешение preview (${draft.performance.maxPreview}px)`}>
              <input
                type="range" min={1024} max={8192} step={256}
                value={draft.performance.maxPreview}
                onChange={(e) => patch("performance", { maxPreview: Number(e.target.value) })}
                className="w-32 accent-primary"
              />
            </Row>
            <Button variant="outline" size="sm" className="h-8 text-xs w-full" onClick={onClearCache}>
              Очистить временный кэш проекта
            </Button>
          </Section>

          <Section title="7. Автосохранение">
            <Row label="Автосохранение">
              <Switch
                checked={draft.autosave.enabled}
                onCheckedChange={(v) => patch("autosave", { enabled: v })}
              />
            </Row>
            <Row label={`Интервал (${draft.autosave.interval} с)`}>
              <input
                type="range" min={15} max={300} step={15}
                value={draft.autosave.interval}
                onChange={(e) => patch("autosave", { interval: Number(e.target.value) })}
                className="w-32 accent-primary"
              />
            </Row>
            <Button variant="outline" size="sm" className="h-8 text-xs w-full" onClick={onRestore}>
              Восстановить последнее сохранённое состояние
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs w-full" onClick={onResetProject}>
              Сбросить настройки проекта
            </Button>
          </Section>
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2 bg-panel">
          <Button className="flex-1 h-9 gap-1.5" onClick={save}>
            <Save className="h-4 w-4" /> Сохранить
          </Button>
          <Button variant="outline" className="h-9 gap-1.5" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Сбросить
          </Button>
          <Button variant="ghost" className="h-9 gap-1.5" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> Закрыть
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
