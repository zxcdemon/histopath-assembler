import { useMemo, useState } from "react";
import {
  Search,
  Upload,
  MapPin,
  LayoutGrid,
  Crosshair,
  Eye,
  Settings,
  HelpCircle,
  ChevronDown,
  Info,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Block = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  content: React.ReactNode;
  searchable: string; // plain-text used for search matching
};

function Collapsible({
  block, forceOpen,
}: {
  block: Block;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!block.defaultOpen);
  const isOpen = forceOpen ?? open;
  return (
    <div className="rounded-lg border border-border bg-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-secondary/60 rounded-lg"
      >
        <block.icon className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 text-left">{block.title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div className="px-3 pb-3 pt-0 text-xs text-muted-foreground">{block.content}</div>}
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-2.5">
      <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <div className="text-foreground text-[12px] font-medium">{title}</div>
        <div className="text-[11px] leading-relaxed mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function Line({ label, body }: { label: string; body: string }) {
  return (
    <div className="text-[11px] leading-relaxed">
      <span className="text-foreground font-medium">{label}</span> — {body}
    </div>
  );
}

const QUICK_TIPS: { id: string; label: string; body: string }[] = [
  {
    id: "how-mrxs",
    label: "Как загрузить .mrxs?",
    body:
      "Откройте раздел «Импорт» в левом меню и перетащите файлы (2–12 шт.) одного макропрепарата. Поддерживаются .mrxs и обычные изображения.",
  },
  {
    id: "how-ink",
    label: "Как поставить маркеры?",
    body:
      "Перейдите в раздел «Маркеры», выберите цвет кисти и проведите штрих по краю фрагмента, который должен состыковаться с соседом. Тот же цвет — на соседнем фрагменте.",
  },
  {
    id: "what-reg",
    label: "Что такое регистрация?",
    body:
      "Здесь «регистрация» — это image registration, то есть точное совмещение изображений в едином масштабе, а не регистрация пользователя.",
  },
  {
    id: "how-seams",
    label: "Как проверить стыки?",
    body:
      "Откройте «Просмотр». Стыки подсвечиваются цветом: зелёный — норм, жёлтый — зазор, красный — наложение, оранжевый — сильный поворот. Кликните по стыку для деталей.",
  },
  {
    id: "how-export",
    label: "Как экспортировать результат?",
    body:
      "В «Просмотре» нажмите «Экспорт гистотопограммы». Формат (OME-TIFF / BigTIFF) и состав метаданных настраиваются в «Настройки → Экспорт».",
  },
];

export function HelpPanel({
  open,
  onOpenChange,
  currentSection,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentSection?: string;
}) {
  const [query, setQuery] = useState("");

  const blocks: Block[] = [
    {
      id: "assembly",
      title: "Как собрать гистотопограмму",
      icon: LayoutGrid,
      defaultOpen: true,
      searchable: "как собрать гистотопограмму импорт маркеры макет регистрация просмотр экспорт mrxs",
      content: (
        <div className="space-y-2.5 pt-1">
          <Step n={1} title="Импорт" body="Загрузите 2–12 .mrxs-файлов одного макропрепарата." />
          <Step n={2} title="Маркеры" body="Отметьте цветные маркеры туши на краях фрагментов — они подскажут, какие части должны быть рядом." />
          <Step n={3} title="Макет" body="Разложите фрагменты как пазл: их можно двигать, поворачивать и масштабировать." />
          <Step n={4} title="Регистрация" body="Запустите авто- или полуавтоматическое совмещение. При необходимости — расставьте контрольные точки." />
          <Step n={5} title="Просмотр" body="Проверьте стыки, зазоры, наложения и общее качество сборки." />
          <Step n={6} title="Экспорт" body="Сохраните итог в OME-TIFF или BigTIFF." />
        </div>
      ),
    },
    {
      id: "sections",
      title: "Что означают разделы",
      icon: Info,
      searchable: "разделы импорт маркеры макет регистрация просмотр настройки помощь image registration",
      content: (
        <div className="space-y-1.5 pt-1">
          <Line label="Импорт" body="загрузка исходных .mrxs-фрагментов." />
          <Line label="Маркеры" body="разметка цветных меток туши на краях." />
          <Line label="Макет" body="ручная раскладка фрагментов на холсте." />
          <Line label="Регистрация" body="точное совмещение изображений." />
          <Line label="Просмотр" body="проверка итоговой сборки и экспорт." />
          <Line label="Настройки" body="параметры проекта, отображения, качества и экспорта." />
          <Line label="Помощь" body="подсказки по работе с приложением." />
          <div className="mt-2 rounded border border-primary/30 bg-primary/5 px-2 py-1.5 text-[11px] text-foreground">
            <span className="font-medium">Важно:</span> «Регистрация» здесь означает
            <em> image registration</em> — совмещение изображений, а не регистрацию пользователя.
          </div>
        </div>
      ),
    },
    {
      id: "issues",
      title: "Частые проблемы",
      icon: HelpCircle,
      searchable:
        "частые проблемы фрагменты не совмещаются зазоры накладываются не использованы неточно тормозит производительность",
      content: (
        <div className="space-y-2 pt-1">
          <Step n={1} title="Фрагменты не совмещаются" body="Проверьте маркеры туши, контрольные точки и масштаб." />
          <Step n={2} title="Между фрагментами есть зазоры" body="Это может быть нормально — приложение не дорисовывает отсутствующую ткань." />
          <Step n={3} title="Фрагменты накладываются" body="Проверьте поворот, масштаб и контрольные точки." />
          <Step n={4} title="Не все фрагменты использованы" body="Проверьте список загруженных .mrxs-файлов и статус каждого фрагмента." />
          <Step n={5} title="Сборка выглядит неточной" body="Перейдите в «Регистрация», добавьте контрольные точки и повторите совмещение." />
          <Step n={6} title="Приложение тормозит на больших файлах" body="Включите тайловую загрузку, уменьшите качество preview или очистите кэш в настройках." />
        </div>
      ),
    },
    {
      id: "rules",
      title: "Главные правила",
      icon: Settings,
      searchable: "правила исходные фрагменты единый масштаб не дорисовывать не искажать сохранять проверять",
      content: (
        <ul className="space-y-1 pt-1 list-disc pl-4 text-[11px] leading-relaxed">
          <li>работать только с исходными фрагментами;</li>
          <li>сохранять единый масштаб;</li>
          <li>не дорисовывать ткань;</li>
          <li>не искажать исходные сканы;</li>
          <li>сохранять маркеры, контрольные точки и трансформации;</li>
          <li>перед экспортом проверять проблемные стыки.</li>
        </ul>
      ),
    },
  ];

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return blocks;
    return blocks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.searchable.toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const currentHint: Record<string, string> = {
    import: "Раздел «Импорт»: перетащите .mrxs-файлы одного макропрепарата.",
    markers: "Раздел «Маркеры»: наносите одинаковый цвет туши на края будущих соседей.",
    layout: "Раздел «Макет»: раскладывайте фрагменты — двигайте, поворачивайте, масштабируйте.",
    registration: "Раздел «Регистрация»: image registration, совмещение изображений в едином масштабе.",
    preview: "Раздел «Просмотр»: проверьте стыки и экспортируйте гистотопограмму.",
    settings: "Раздел «Настройки»: параметры проекта, отображения, качества и экспорта.",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 w-[360px] sm:max-w-[400px] max-w-[92vw] flex flex-col gap-0"
      >
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <SheetTitle className="text-base font-semibold flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" /> Помощь
          </SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Короткая встроенная справка. Ничего не удаляется и не изменяется в проекте.
          </SheetDescription>
          <div className="relative mt-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти подсказку…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          {currentSection && currentHint[currentSection] && (
            <div className="mt-2 rounded border border-primary/30 bg-primary/5 px-2 py-1.5 text-[11px] text-foreground">
              {currentHint[currentSection]}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5">Быстрые ответы</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TIPS.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] px-2"
                  onClick={() => setQuery(t.label)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            {q && (
              <div className="mt-2 space-y-2">
                {QUICK_TIPS.filter(
                  (t) =>
                    t.label.toLowerCase().includes(q) ||
                    t.body.toLowerCase().includes(q),
                ).map((t) => (
                  <div key={t.id} className="rounded-md border border-border bg-panel p-2.5">
                    <div className="text-[12px] font-medium text-foreground">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      {t.body}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-[11px] text-muted-foreground text-center">
              Ничего не найдено. Попробуйте другой запрос.
            </div>
          ) : (
            filtered.map((b) => <Collapsible key={b.id} block={b} forceOpen={q ? true : undefined} />)
          )}

          {/* Sections legend as icons */}
          <div className="rounded-lg border border-border bg-panel p-2.5">
            <div className="text-[11px] text-muted-foreground mb-1.5">Разделы приложения</div>
            <ul className="grid grid-cols-2 gap-1.5 text-[11px]">
              {[
                { id: "import", i: Upload, l: "Импорт" },
                { id: "markers", i: MapPin, l: "Маркеры" },
                { id: "layout", i: LayoutGrid, l: "Макет" },
                { id: "registration", i: Crosshair, l: "Регистрация" },
                { id: "preview", i: Eye, l: "Просмотр" },
                { id: "settings", i: Settings, l: "Настройки" },
              ].map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <s.i className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{s.l}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2 bg-panel">
          <Button variant="outline" className="flex-1 h-9" onClick={() => setQuery("")}>
            Очистить поиск
          </Button>
          <Button className="h-9" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
