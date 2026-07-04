import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import mascotHero from "@/assets/mascot-hero.png";

type Phase = "idle" | "computing" | "preview" | "suggestion" | "error";

export function MascotAssistant({
  onOpenHelp,
  fragmentCount = 0,
  hasMarkers = false,
  hasPending = false,
  hasSuggestion = false,
  onRunAuto,
  onApplyAuto,
  onRejectAuto,
  onShowSuggestion,
  onApplySuggestion,
  onHideSuggestion,
  metrics,
}: {
  onOpenHelp?: () => void;
  fragmentCount?: number;
  hasMarkers?: boolean;
  hasPending?: boolean;
  hasSuggestion?: boolean;
  onRunAuto?: () => { ok: boolean; error?: string };
  onApplyAuto?: () => void;
  onRejectAuto?: () => void;
  onShowSuggestion?: () => { ok: boolean; error?: string };
  onApplySuggestion?: () => void;
  onHideSuggestion?: () => void;
  metrics?: {
    score: number;
    matchCount: number;
    errorCount: number;
    warningCount: number;
    totalFragments: number;
    usedFragments: number;
    statusText: string;
    statusTone: "good" | "check" | "issues";
  };
} = {}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    // reset to idle when reopened, but keep suggestion phase if ghost still active
    if (phase !== "suggestion" || !hasSuggestion) setPhase("idle");
  };

  const preflight = (): string | null => {
    if (fragmentCount < 2) return "Для сборки нужно загрузить минимум 2 фрагмента.";
    if (!hasMarkers)
      return "Недостаточно маркеров или контрольных точек для уверенной автоматической сборки.";
    return null;
  };

  const handleRunAuto = () => {
    const pre = preflight();
    if (pre) {
      setPhase("error");
      setErrorMsg(pre);
      return;
    }
    if (!onRunAuto) {
      setPhase("error");
      setErrorMsg("Модуль автоматической сборки недоступен. Проверьте подключение backend-сервиса.");
      return;
    }
    setPhase("computing");
    setTimeout(() => {
      const res = onRunAuto();
      if (!res.ok) {
        setPhase("error");
        setErrorMsg(res.error ?? "Не удалось построить автоматическую раскладку.");
        return;
      }
      setPhase("preview");
    }, 500);
  };

  const handleShowSuggestion = () => {
    const pre = preflight();
    if (pre) {
      setPhase("error");
      setErrorMsg(pre);
      return;
    }
    if (!onShowSuggestion) {
      setPhase("error");
      setErrorMsg("Модуль автоматической сборки недоступен. Проверьте подключение backend-сервиса.");
      return;
    }
    const res = onShowSuggestion();
    if (!res.ok) {
      setPhase("error");
      setErrorMsg(res.error ?? "Не удалось построить подсказку.");
      return;
    }
    setPhase("suggestion");
  };

  const handleApplyAuto = () => {
    onApplyAuto?.();
    toast.success("Автоматическая раскладка применена");
    setPhase("idle");
    setOpen(false);
  };

  const handleRejectAuto = () => {
    onRejectAuto?.();
    setPhase("idle");
  };

  const handleApplySuggestion = () => {
    onApplySuggestion?.();
    setPhase("idle");
    setOpen(false);
  };

  const handleHideSuggestion = () => {
    onHideSuggestion?.();
    setPhase("idle");
  };

  // ---------- Collapsed: floating button ----------
  if (!open) {
    return (
      <div className="fixed z-50 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 md:bottom-6 md:right-6 group">
        {hasSuggestion && (
          <button
            onClick={handleHideSuggestion}
            className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-panel border border-primary/40 shadow-sm text-[11px] px-2 py-1 text-primary hover:bg-primary/5"
          >
            Скрыть подсказку
          </button>
        )}
        <button
          onClick={() => {
            setOpen(true);
            if (hasSuggestion) setPhase("suggestion");
            else if (hasPending) setPhase("preview");
          }}
          aria-label="Помощник сборки"
          className="relative h-11 w-11 md:h-12 md:w-12 rounded-full bg-panel border border-primary/30 shadow-[0_4px_14px_-4px_rgba(30,60,120,0.25)] hover:border-primary/60 hover:shadow-[0_6px_18px_-4px_rgba(30,60,120,0.35)] transition-all flex items-center justify-center text-primary"
        >
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />
          {(hasPending || hasSuggestion) && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-panel animate-pulse" />
          )}
        </button>
        <div className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="whitespace-nowrap rounded-md bg-foreground text-background text-xs px-2 py-1 shadow-sm">
            Помощник сборки
          </div>
        </div>
      </div>
    );
  }

  // ---------- Expanded card ----------
  const title =
    phase === "preview"
      ? "Предложена автоматическая сборка"
      : phase === "suggestion"
        ? "Показана предложенная раскладка"
        : phase === "computing"
          ? "Считаю раскладку…"
          : phase === "error"
            ? "Не получилось"
            : "Помочь со сборкой?";

  const body =
    phase === "preview"
      ? "Показываю рассчитанные позиции на холсте. Примените или отклоните — исходные изображения не меняются."
      : phase === "suggestion"
        ? "Реальные фрагменты не изменены. Полупрозрачные копии показывают предложенное положение."
        : phase === "computing"
          ? "Анализирую маркеры туши, края и текущее положение фрагментов."
          : phase === "error"
            ? errorMsg ?? "Что-то пошло не так."
            : "Могу предложить раскладку фрагментов по маркерам туши, краям и текущему положению. Результат можно проверить перед применением.";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={close} aria-hidden />
      <div
        className="fixed z-50
          md:bottom-[76px] md:right-6 md:max-w-[calc(100vw-3rem)]
          bottom-0 left-0 right-0 md:left-auto"
      >
        <div
          className="relative bg-panel border border-border shadow-float
            md:w-[360px] md:rounded-2xl
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
              <div className="text-[15px] font-semibold text-foreground leading-snug">{title}</div>
              <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">{body}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {phase === "idle" && (
              <>
                <Button onClick={handleRunAuto} className="h-9 px-3 text-[13px]">
                  Собрать автоматически
                </Button>
                <Button variant="outline" onClick={handleShowSuggestion} className="h-9 px-3 text-[13px]">
                  Показать подсказку
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
                <Button onClick={handleApplyAuto} className="h-9 px-3 text-[13px]">
                  Применить
                </Button>
                <Button variant="outline" onClick={handleRejectAuto} className="h-9 px-3 text-[13px]">
                  Отклонить
                </Button>
              </>
            )}
            {phase === "suggestion" && (
              <>
                <Button onClick={handleApplySuggestion} className="h-9 px-3 text-[13px]">
                  Применить предложение
                </Button>
                <Button variant="outline" onClick={handleHideSuggestion} className="h-9 px-3 text-[13px]">
                  Скрыть подсказку
                </Button>
              </>
            )}
            {phase === "error" && (
              <>
                <Button variant="outline" onClick={() => setPhase("idle")} className="h-9 px-3 text-[13px]">
                  Назад
                </Button>
                {onOpenHelp && (
                  <Button variant="ghost" onClick={onOpenHelp} className="h-9 px-3 text-[13px]">
                    Открыть помощь
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
