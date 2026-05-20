import type { MarketingImageSlot } from "@/config/marketingImages";
import { isMarketingSvg, marketingImageUrl } from "@/config/marketingImages";
import { cn } from "@/lib/utils";

type MarketingVisualProps = {
  slot: MarketingImageSlot;
  className?: string;
  priority?: boolean;
  plain?: boolean;
  large?: boolean;
};

export function MarketingVisual({ slot, className, priority, plain, large }: MarketingVisualProps) {
  const src = marketingImageUrl(slot.file);
  const svg = isMarketingSvg(slot.file);

  return (
    <div
      className={cn(
        "overflow-hidden",
        svg ? "marketing-visual-svg rounded-xl bg-card" : "rounded-xl border border-border/60 bg-card",
        !plain && !svg && "shadow-md ring-1 ring-border/40",
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
          "marketing-visual-img h-auto w-full",
          svg ? "object-contain p-1" : "object-cover object-top",
          large ? "aspect-[16/9] min-h-[260px] md:min-h-[340px]" : "aspect-[16/10] min-h-[200px]"
        )}
      />
    </div>
  );
}
