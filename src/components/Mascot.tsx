import mascotAsset from "@/assets/mascot.png.asset.json";

// Crops from the 4-in-one mascot sheet.
// The uploaded image is roughly square with 4 poses; we use the large left pose by default.
// objectPosition values approximate: main pose sits left/center.
export function MascotImage({
  variant = "main",
  className = "",
}: {
  variant?: "main" | "search" | "puzzle" | "small";
  className?: string;
}) {
  // Use the full sprite and crop with clip-path + object-position on a larger container.
  // Simpler: display full image but scaled — for consistency we use background-image on a box.
  const positions: Record<string, { pos: string; size: string }> = {
    // approximate crop of the standing pen-holding mascot on the left
    main: { pos: "14% 45%", size: "260%" },
    search: { pos: "88% 22%", size: "260%" },
    puzzle: { pos: "88% 62%", size: "260%" },
    small: { pos: "14% 45%", size: "260%" },
  };
  const p = positions[variant];
  return (
    <div
      role="img"
      aria-label="Помощник"
      className={className}
      style={{
        backgroundImage: `url(${mascotAsset.url})`,
        backgroundPosition: p.pos,
        backgroundSize: p.size,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
