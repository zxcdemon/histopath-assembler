import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MascotImage } from "./Mascot";

export function MascotAssistant() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const handleAuto = () => {
    setStatus("Помощник анализирует расположение фрагментов…");
    toast("Помощник анализирует расположение фрагментов…", {
      description: "Подбираю совпадения по краям среза и маркерам туши.",
    });
    setTimeout(() => setStatus(null), 3500);
  };

  const handleSuggest = () => {
    setStatus(null);
    toast.success("Рекомендация помощника", {
      description:
        "Попробуйте совместить фрагменты по совпадающим зонам ткани, краям среза и маркерам туши.",
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Открыть помощника"
        className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full bg-panel shadow-float border border-border hover:scale-105 transition-transform overflow-hidden md:bottom-6 md:right-6"
      >
        <MascotImage variant="small" className="w-full h-full" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary ring-2 ring-panel" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 md:bottom-6 md:right-6 max-w-[calc(100vw-2rem)]">
      <div className="relative flex items-stretch gap-4 rounded-2xl bg-panel border border-border shadow-float pl-5 pr-4 pt-5 pb-5 w-[440px] md:w-[480px]">
        <button
          onClick={() => setOpen(false)}
          aria-label="Закрыть"
          className="absolute top-2.5 right-2.5 h-7 w-7 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 pr-2 flex flex-col justify-center">
          <div className="text-[17px] font-semibold text-foreground leading-snug">
            {status ? "Секунду…" : "Нужна помощь\u00a0со схемой?"}
          </div>
          {status ? (
            <div className="mt-2 text-sm text-muted-foreground">{status}</div>
          ) : (
            <div className="mt-3.5 flex gap-2">
              <Button onClick={handleAuto} className="h-9 px-4 text-sm">
                Сделай сам
              </Button>
              <Button variant="outline" onClick={handleSuggest} className="h-9 px-4 text-sm">
                Предложи
              </Button>
            </div>
          )}
        </div>

        <button
          onClick={handleAuto}
          aria-label="Спросить помощника"
          className="shrink-0 self-end -mb-3 -mr-1 hover:scale-105 transition-transform"
        >
          <MascotImage variant="main" className="h-40 w-32 md:h-44 md:w-36" />
        </button>
      </div>
    </div>
  );
}
