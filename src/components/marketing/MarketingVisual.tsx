import type { MarketingImageSlot } from "@/config/marketingImages";
import { marketingImageUrl } from "@/config/marketingImages";
import { cn } from "@/lib/utils";

type MarketingVisualProps = {
  slot: MarketingImageSlot;
  className?: string;
  priority?: boolean;
  plain?: boolean;
  large?: boolean;
};

/** Product screenshot — raster assets only (PNG/WebP in public/marketing). */
export function MarketingVisual({ slot, className, priority, plain, large }: MarketingVisualProps) {
  const src = marketingImageUrl(slot.file);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-card",
        !plain && "shadow-md ring-1 ring-border/40",
        className
      )}
    >
      <img
        src={src}
        alt={slot.alt}
        width={1280}
        height={720}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn(
          "h-auto w-full object-cover object-top",
          large ? "aspect-[16/9] min-h-[280px] md:min-h-[360px]" : "aspect-[16/10]"
        )}
      />
    </div>
  );
}
