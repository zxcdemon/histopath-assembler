import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { Upload, X, FileImage, FileWarning, Loader2, ServerCrash, ServerCog } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Fragment } from "@/components/HistologyCanvas";
import { backend } from "@/lib/backend-api";
import { toast } from "sonner";

const MAX_FILES = 12;
const MIN_FILES = 2;

export type StagedFile = {
  id: string;
  file: File;
  name: string;
  sizeKb: number;
  kind: "image" | "mrxs" | "unsupported";
  previewUrl?: string;
};

function classify(file: File): StagedFile["kind"] {
  const name = file.name.toLowerCase();
  if (name.endsWith(".mrxs")) return "mrxs";
  if (name.endsWith(".zip")) return "mrxs"; // .zip carrying an .mrxs + sidecar
  if (file.type.startsWith("image/")) return "image";
  if (/\.(png|jpe?g|webp|tiff?|bmp)$/i.test(name)) return "image";
  return "unsupported";
}

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export function ImportDialog({
  open,
  onOpenChange,
  existingIds,
  onImport,
  onBusyChange,
  backendAvailable,
  backendCaseId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingIds: string[];
  onImport: (fragments: Fragment[]) => void;
  onBusyChange?: (busy: boolean) => void;
  backendAvailable?: boolean | null;
  backendCaseId?: string | null;
}) {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBackendReady(null);

    if (backendAvailable !== undefined) {
      setBackendReady(backendAvailable);
      return () => {
        cancelled = true;
      };
    }

    backend.isAvailable().then((ok) => !cancelled && setBackendReady(ok));
    return () => {
      cancelled = true;
    };
  }, [open, backendAvailable]);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    setStaged((prev) => {
      const combined = [...prev];
      for (const f of arr) {
        if (combined.length >= MAX_FILES) break;
        if (combined.some((s) => s.name === f.name && s.sizeKb === Math.round(f.size / 1024))) continue;
        const kind = classify(f);
        const item: StagedFile = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          name: f.name,
          sizeKb: Math.round(f.size / 1024),
          kind,
          previewUrl: kind === "image" ? URL.createObjectURL(f) : undefined,
        };
        combined.push(item);
      }
      return combined;
    });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const remove = (id: string) =>
    setStaged((p) => {
      const it = p.find((s) => s.id === id);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return p.filter((s) => s.id !== id);
    });

  const clearAll = () => {
    staged.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    setStaged([]);
  };

  const validCount = staged.filter((s) => s.kind !== "unsupported").length;
  const canImport = validCount >= MIN_FILES && validCount <= MAX_FILES;

  const nextId = (offset: number) => {
    const nums = existingIds
      .map((id) => Number(id.replace(/^F-/, "")))
      .filter((n) => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return `F-${String(max + offset).padStart(2, "0")}`;
  };

  const handleImport = async () => {
    setBusy(true);
    onBusyChange?.(true);
    try {
      const valid = staged.filter((s) => s.kind !== "unsupported");
      const hasMrxs = valid.some((s) => s.kind === "mrxs");

      const ready = backendAvailable ?? backendReady;
      let caseId: string | null = backendCaseId ?? null;

      if (ready && hasMrxs && !caseId) {
        try {
          const c = await backend.createCase();
          caseId = c.caseId;
        } catch (e) {
          console.warn("createCase failed", e);
          toast.error("Модуль .mrxs недоступен. Запустите backend-сервис");
        }
      } else if (!ready && hasMrxs) {
        toast.error("Для .mrxs нужно запустить backend с OpenSlide");
      }

      const out: Fragment[] = [];
      let skippedMrxs = 0;
      let i = 1;
      for (const s of valid) {
        const id = nextId(i++);
        const isImg = s.kind === "image";
        const isZip = s.file.name.toLowerCase().endsWith(".zip");
        const idx = i - 2;
        let remote:
          | {
              backendId: string;
              remoteId: string;
              remoteCaseId: string;
              src?: string;
              thumbnailUrl?: string;
              width?: number;
              height?: number;
              pixelWidth?: number;
              pixelHeight?: number;
              mppX?: number | null;
              mppY?: number | null;
            }
          | undefined;

        if (s.kind === "mrxs" && caseId) {
          try {
            const f = isZip
              ? await backend.uploadFragmentArchive(caseId, s.file)
              : await backend.uploadFragment(caseId, s.file);
            const thumbnailUrl = backend.assetUrl(f.thumbnail);

            if (!thumbnailUrl) {
              throw new Error("Thumbnail не получен от backend");
            }

            remote = {
              backendId: f.id,
              remoteId: f.id,
              remoteCaseId: caseId,
              src: thumbnailUrl,
              thumbnailUrl,
              width: f.width,
              height: f.height,
              pixelWidth: f.width,
              pixelHeight: f.height,
              mppX: f.mppX ?? null,
              mppY: f.mppY ?? null,
            };
          } catch (e) {
            console.warn("uploadFragment failed", s.name, e);
            toast.error(`Не удалось загрузить ${s.name}`, {
              description: e instanceof Error ? e.message : String(e),
            });
            if (s.kind === "mrxs") {
              skippedMrxs += 1;
              continue;
            }
          }
        } else if (s.kind === "mrxs") {
          // No backend and this is an .mrxs — cannot render on client, skip with clear message.
          skippedMrxs += 1;
          continue;
        }

        const src = isImg && !remote ? await readAsDataUrl(s.file) : undefined;

        out.push({
          id,
          label: id,
          crop: { x: 0, y: 0, w: 100, h: 100 },
          place: { x: 20 + (idx % 4) * 15, y: 20 + Math.floor(idx / 4) * 22, w: 22, rot: 0 },
          src,
          kind: isImg ? "image" : "mrxs",
          fileName: s.name,
          ...remote,
        });
      }
      if (skippedMrxs) {
        toast.error(`Для .mrxs нужно запустить backend с OpenSlide`, {
          description: `Пропущено файлов: ${skippedMrxs}`,
        });
      }
      if (!out.length) return;
      onImport(out);
      clearAll();
      onOpenChange(false);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) clearAll(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Импорт сканов</DialogTitle>
          <DialogDescription>
            Загрузите от {MIN_FILES} до {MAX_FILES} файлов. Поддерживаются PNG, JPG, WEBP, TIFF, .mrxs и .zip (архив с .mrxs + сателлитом).
          </DialogDescription>
        </DialogHeader>

        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
            backendReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : backendReady === false
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-border bg-secondary/40 text-muted-foreground"
          }`}
        >
          {backendReady ? (
            <>
              <ServerCog className="h-3.5 w-3.5" />
              <span>Backend подключён — .mrxs будет обработан на сервере.</span>
            </>
          ) : backendReady === false ? (
            <>
              <ServerCrash className="h-3.5 w-3.5" />
              <span>
                Демо-режим: PNG/JPG работают локально. Для .mrxs подключите backend (см. README).
              </span>
            </>
          ) : (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Проверяем доступность backend…</span>
            </>
          )}
        </div>


        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-accent" : "border-border hover:bg-secondary/50"
          }`}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Перетащите файлы сюда или нажмите</p>
          <p className="text-xs text-muted-foreground mt-1">
            .mrxs, .zip, .png, .jpg, .webp, .tiff · до {MAX_FILES} шт.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".mrxs,.zip,image/*,.tif,.tiff"
            onChange={onPick}
            className="hidden"
          />
        </div>

        {staged.length > 0 && (
          <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1.5">
            {staged.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-2 rounded-md border border-border bg-background"
              >
                <div className="h-10 w-10 rounded bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                  {s.kind === "image" && s.previewUrl ? (
                    <img src={s.previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : s.kind === "mrxs" ? (
                    <FileImage className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <FileWarning className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.sizeKb.toLocaleString("ru")} КБ ·{" "}
                    {s.kind === "image" ? "изображение" : s.kind === "mrxs" ? "MRXS / ZIP" : "не поддерживается"}
                  </p>
                </div>
                <button
                  onClick={() => remove(s.id)}
                  className="h-7 w-7 rounded hover:bg-secondary flex items-center justify-center text-muted-foreground shrink-0"
                  aria-label="Удалить"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            Принято: {validCount} / {MAX_FILES}
            {validCount > 0 && validCount < MIN_FILES && ` · нужно ≥ ${MIN_FILES}`}
          </span>
          <div className="flex gap-2">
            {staged.length > 0 && (
              <Button variant="ghost" onClick={clearAll} disabled={busy}>
                Очистить
              </Button>
            )}
            <Button onClick={handleImport} disabled={!canImport || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Импортировать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
