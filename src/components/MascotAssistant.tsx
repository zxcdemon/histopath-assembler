import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import mascotHero from "@/assets/mascot-hero.png";

type Phase = "idle" | "computing" | "preview" | "insufficient";

export function MascotAssistant({
  onOpenHelp,
  onAutoLayoutPreview,
  onAutoLayoutApply,
  onAutoLayoutReject,
  canAutoLayout = true,
}: {
  onOpenHelp?: () => void;
  onAutoLayoutPreview?: () => void;
  onAutoLayoutApply?: () => void;
  onAutoLayoutReject?: () => void;
  canAutoLayout?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");

  const close = () => {
    setOpen(false);
    setPhase("idle");
  };

  const handleAuto = () => {
    if (!canAutoLayout) {
      setPhase("insufficient");
      return;
    }
    setPhase("computing");
    setTimeout(() => {
      onAutoLayoutPreview?.();
      setPhase("preview");
    }, 900);
  };

  const handleManual = () => {
    close();
  };

  const handleApply = () => {
    onAutoLayoutApply?.();
    toast.success("Автоматическая раскладка применена");
    close();
  };

  const handleReject = () => {
    onAutoLayoutReject?.();
    toast("Предложение отклонено", {
      description: "Расположение фрагментов не изменилось.",
    });
    setPhase("idle");
  };

  // ---------- Collapsed: floating button ----------
  if (!open) {
    return (
      <div className="fixed z-50 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 md:bottom-6 md:right-6 group">
        <button
          onClick={() => setOpen(true)}
          aria-label="Помощник сборки"
          className="relative h-11 w-11 md:h-12 md:w-12 rounded-full bg-panel border border-primary/30 shadow-[0_4px_14px_-4px_rgba(30,60,120,0.25)] hover:border-primary/60 hover:shadow-[0_6px_18px_-4px_rgba(30,60,120,0.35)] transition-all flex items-center justify-center text-primary"
        >
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-panel" />
        </button>
        <div className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="whitespace-nowrap rounded-md bg-foreground text-background text-xs px-2 py-1 shadow-sm">
            Помощник сборки
          </div>
        </div>
      </div>
    );
  }

  // ---------- Expanded: assistant card ----------
  return (
    <>
      {/* Mobile bottom-sheet backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 md:hidden"
        onClick={close}
        aria-hidden
      />
      <div
        className="fixed z-50
          md:bottom-[76px] md:right-6 md:max-w-[calc(100vw-3rem)]
          bottom-0 left-0 right-0 md:left-auto"
      >
        <div
          className="relative bg-panel border border-border shadow-float
            md:w-[340px] md:rounded-2xl
            rounded-t-2xl md:rounded-t-2xl
            px-5 pt-4 pb-5
            pb-[calc(env(safe-area-inset-bottom,0px)+20px)] md:pb-5"
        >
          <button
            onClick={close}
            aria-label="Закрыть"
            className="absolute top-2.5 right-2.5 h-7 w-7 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3 pr-8">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={mascotHero}
                alt=""
                className="h-[140%] w-auto object-contain object-bottom select-none"
                draggable={false}
              />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground leading-snug">
                {phase === "preview"
                  ? "Предложение готово"
                  : phase === "computing"
                    ? "Анализирую фрагменты…"
                    : phase === "insufficient"
                      ? "Недостаточно данных"
                      : "Помочь со сборкой?"}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
                {phase === "preview"
                  ? "Показал предварительную раскладку на холсте. Примените или отклоните — исходные фрагменты не изменятся."
                  : phase === "computing"
                    ? "Ищу совпадения по краям среза и маркерам туши."
                    : phase === "insufficient"
                      ? "Недостаточно маркеров или контрольных точек для уверенной автоматической сборки."
                      : "Могу предложить автоматическую раскладку фрагментов. Результат можно проверить перед применением."}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {phase === "idle" && (
              <>
                <Button onClick={handleAuto} className="h-9 px-3 text-[13px]">
                  Собрать автоматически
                </Button>
                <Button variant="outline" onClick={handleManual} className="h-9 px-3 text-[13px]">
                  Соберу вручную
                </Button>
              </>
            )}
            {phase === "computing" && (
              <Button disabled className="h-9 px-3 text-[13px]">
                Считаю…
              </Button>
            )}
            {phase === "preview" && (
              <>
                <Button onClick={handleApply} className="h-9 px-3 text-[13px]">
                  Применить
                </Button>
                <Button variant="outline" onClick={handleReject} className="h-9 px-3 text-[13px]">
                  Отклонить
                </Button>
              </>
            )}
            {phase === "insufficient" && (
              <>
                <Button variant="outline" onClick={() => setPhase("idle")} className="h-9 px-3 text-[13px]">
                  Назад
                </Button>
                {onOpenHelp && (
                  <Button variant="ghost" onClick={onOpenHelp} className="h-9 px-3 text-[13px]">
                    Как добавить маркеры
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
