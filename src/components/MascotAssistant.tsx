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
        className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-panel shadow-float border border-border hover:scale-105 transition-transform overflow-hidden md:bottom-6 md:right-6"
      >
        <MascotImage variant="small" className="w-full h-full" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary ring-2 ring-panel" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 md:bottom-6 md:right-6 max-w-[calc(100vw-2rem)]">
      <div className="relative flex items-center gap-3 rounded-2xl bg-panel border border-border shadow-float pl-4 pr-3 py-3 w-[320px] md:w-[360px]">
        <button
          onClick={() => setOpen(false)}
          aria-label="Закрыть"
          className="absolute top-2 right-2 h-6 w-6 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 pr-6">
          <div className="text-sm font-medium text-foreground leading-tight">
            {status ? "Секунду…" : "Нужна помощь со схемой?"}
          </div>
          {status ? (
            <div className="mt-1 text-xs text-muted-foreground">{status}</div>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={handleAuto} className="h-8 px-3">
                Сделай сам
              </Button>
              <Button size="sm" variant="outline" onClick={handleSuggest} className="h-8 px-3">
                Предложи
              </Button>
            </div>
          )}
        </div>

        <button
          onClick={handleAuto}
          aria-label="Спросить помощника"
          className="shrink-0 h-16 w-16 rounded-xl overflow-hidden bg-secondary/50 hover:scale-105 transition-transform"
        >
          <MascotImage variant="main" className="w-full h-full" />
        </button>
      </div>
    </div>
  );
}
