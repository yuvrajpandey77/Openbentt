import type { MarketingImageSlot } from "@/config/marketingImages";
import { marketingImageUrl, marketingPlaceholderSvg } from "@/config/marketingImages";
import { cn } from "@/lib/utils";

type MarketingVisualProps = {
  slot: MarketingImageSlot;
  className?: string;
  priority?: boolean;
  plain?: boolean;
  large?: boolean;
};

/** Raster (webp/png) with SVG fallback, or direct SVG showcase art. */
export function MarketingVisual({ slot, className, priority, plain, large }: MarketingVisualProps) {
  const isSvg = /\.svg$/i.test(slot.file);
  const raster = isSvg ? null : marketingImageUrl(slot.file);
  const imgSrc = isSvg ? marketingImageUrl(slot.file) : marketingPlaceholderSvg(slot.file);

  const imgClass = cn(
    "h-auto w-full object-cover object-top",
    large ? "aspect-[16/9] min-h-[280px] md:min-h-[360px]" : "aspect-[16/10]"
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-card",
        !plain && "shadow-md ring-1 ring-border/40",
        className
      )}
    >
      {raster ? (
        <picture>
          <source srcSet={raster} type="image/webp" />
          <img
            src={imgSrc}
            alt={slot.alt}
            width={1280}
            height={720}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className={imgClass}
          />
        </picture>
      ) : (
        <img
          src={imgSrc}
          alt={slot.alt}
          width={1280}
          height={720}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={imgClass}
        />
      )}
    </div>
  );
}
