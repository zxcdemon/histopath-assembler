import histologyAsset from "@/assets/histology.png.asset.json";

export type Fragment = {
  id: string;
  label: string;
  // crop of source histology image (percent)
  crop: { x: number; y: number; w: number; h: number };
  // placement on canvas (percent of canvas box)
  place: { x: number; y: number; w: number; rot: number };
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

