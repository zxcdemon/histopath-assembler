import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import mascotHero from "@/assets/mascot-hero.png";

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
        className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full bg-panel shadow-float border border-border hover:scale-105 transition-transform overflow-hidden md:bottom-6 md:right-6 flex items-end justify-center"
      >
        <img
          src={mascotHero}
          alt=""
          className="h-[130%] w-auto object-contain object-bottom"
        />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary ring-2 ring-panel" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 md:bottom-6 md:right-6 max-w-[calc(100vw-2rem)] pt-16">
      <div className="relative rounded-2xl bg-panel border border-border shadow-float px-5 py-4 w-[380px] md:w-[420px]">
        <button
          onClick={() => setOpen(false)}
          aria-label="Закрыть"
          className="absolute top-2.5 right-2.5 h-7 w-7 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center z-10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pr-[140px] md:pr-[160px]">
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

        {/* Mascot overflows to the right and top of the card */}
        <button
          onClick={handleAuto}
          aria-label="Спросить помощника"
          className="absolute right-2 md:right-3 bottom-0 hover:scale-[1.03] transition-transform origin-bottom"
        >
          <img
            src={mascotHero}
            alt="Помощник"
            className="h-[190px] md:h-[210px] w-auto object-contain drop-shadow-[0_8px_16px_rgba(30,40,80,0.15)] select-none"
            draggable={false}
          />
        </button>
      </div>
    </div>
  );
}
