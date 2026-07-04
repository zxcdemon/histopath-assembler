import histologyAsset from "@/assets/histology.png.asset.json";

export type Fragment = {
  id: string;
  label: string;
  // crop of source histology image (percent) — used when no explicit src
  crop: { x: number; y: number; w: number; h: number };
  // placement on canvas (percent of canvas box)
  place: { x: number; y: number; w: number; rot: number };
  // Optional: user-imported image source (data URL / object URL / http).
  src?: string;
  // Optional: file kind for imports where we can't render a real image
  // (e.g. proprietary .mrxs). When set, FragmentImage draws a placeholder.
  kind?: "image" | "mrxs";
  // Optional filename for imports
  fileName?: string;
  // Backend linkage (populated after successful upload to Python backend).
  backendId?: string;
  remoteCaseId?: string;
  remoteId?: string;
  // Absolute URL to a JPEG thumbnail served by the backend. When present,
  // FragmentImage renders this instead of the MRXS placeholder.
  thumbnailUrl?: string;
  // Real pixel dimensions of the underlying WSI (from OpenSlide).
  width?: number;
  height?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  mppX?: number | null;
  mppY?: number | null;
};

export const FRAGMENTS: Fragment[] = [
  { id: "F-01", label: "F-01", crop: { x: 0, y: 0, w: 45, h: 34 }, place: { x: 8, y: 12, w: 30, rot: -3 } },
  { id: "F-02", label: "F-02", crop: { x: 48, y: 0, w: 45, h: 34 }, place: { x: 62, y: 14, w: 30, rot: 2 } },
  { id: "F-03", label: "F-03", crop: { x: 10, y: 34, w: 40, h: 30 }, place: { x: 38, y: 30, w: 22, rot: -6.2 } },
  { id: "F-04", label: "F-04", crop: { x: 50, y: 34, w: 45, h: 30 }, place: { x: 8, y: 55, w: 34, rot: 1.5 } },
  { id: "F-05", label: "F-05", crop: { x: 0, y: 64, w: 50, h: 34 }, place: { x: 40, y: 58, w: 26, rot: -1 } },
  { id: "F-06", label: "F-06", crop: { x: 48, y: 64, w: 50, h: 34 }, place: { x: 66, y: 55, w: 28, rot: 3.5 } },
];

export function FragmentImage({
  fragment,
  className = "",
  style,
}: {
  fragment: Fragment;
  className?: string;
  style?: React.CSSProperties;
}) {
  const imageSource = fragment.src ?? fragment.thumbnailUrl;

  // Real source or backend-provided thumbnail wins over any MRXS fallback.
  if (imageSource) {
    return (
      <div
        className={className}
        role="img"
        aria-label={`Гистологический фрагмент ${fragment.label}`}
        style={{
          backgroundImage: `url(${imageSource})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          ...style,
        }}
      />
    );
  }

  // Backend fragment exists but its thumbnail URL is not available yet.
  if (fragment.backendId || fragment.remoteId) {
    return (
      <div
        className={className}
        role="img"
        aria-label={`Гистологический фрагмент ${fragment.label} загружается`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "oklch(0.94 0.01 250)",
          color: "oklch(0.42 0.02 250)",
          fontSize: 10,
          fontWeight: 600,
          textAlign: "center",
          padding: 4,
          ...style,
        }}
      >
        Загрузка thumbnail…
      </div>
    );
  }

  // Placeholder for .mrxs when backend is not connected.
  if (fragment.kind === "mrxs") {
    return (
      <div
        className={className}
        role="img"
        aria-label={`Гистологический фрагмент ${fragment.label} (backend недоступен)`}
        title="Модуль .mrxs недоступен. Запустите backend-сервис."
        style={{
          background:
            "repeating-linear-gradient(45deg, oklch(0.93 0.03 25) 0 10px, oklch(0.88 0.05 25) 10px 20px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "oklch(0.35 0.08 25)",
          fontSize: 10,
          fontWeight: 600,
          textAlign: "center",
          padding: 4,
          gap: 2,
          ...style,
        }}
      >
        <span>MRXS</span>
        <span style={{ fontSize: 8, fontWeight: 500, opacity: 0.8 }}>
          {fragment.fileName ?? fragment.label}
        </span>
        <span style={{ fontSize: 8, fontWeight: 500, opacity: 0.7 }}>
          backend offline
        </span>
      </div>
    );
  }

  const { crop } = fragment;
  const bgSizeX = 100 / (crop.w / 100);
  const bgSizeY = 100 / (crop.h / 100);
  const bgPosX = crop.w >= 100 ? 0 : (crop.x / (100 - crop.w)) * 100;
  const bgPosY = crop.h >= 100 ? 0 : (crop.y / (100 - crop.h)) * 100;
  return (
    <div
      className={className}
      role="img"
      aria-label={`Гистологический фрагмент ${fragment.label}`}
      style={{
        backgroundImage: `url(${histologyAsset.url})`,
        backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
        backgroundPosition: `${bgPosX}% ${bgPosY}%`,
        backgroundRepeat: "no-repeat",
        ...style,
      }}
    />
  );
}
