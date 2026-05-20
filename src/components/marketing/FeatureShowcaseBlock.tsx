import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ShowcaseBlock } from "@/config/marketingContent";
import { MarketingVisual } from "@/components/marketing/MarketingVisual";
import type { MarketingImageSlot } from "@/config/marketingImages";
import { cn } from "@/lib/utils";

type FeatureShowcaseBlockProps = {
  block: ShowcaseBlock;
  imageSlot?: MarketingImageSlot;
  visual?: React.ReactNode;
  plain?: boolean;
  large?: boolean;
  index?: number;
};

export function FeatureShowcaseBlock({ block, imageSlot, visual, plain, large, index }: FeatureShowcaseBlockProps) {
  const paragraphs = block.paragraphs;

  return (
    <article
      id={block.id}
      className={cn(
        "grid scroll-mt-28 items-center gap-12 lg:grid-cols-2",
        large ? "lg:gap-20" : "lg:gap-16",
        block.reverse && "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
      )}
    >
      <div className={cn("space-y-6", large && "lg:pr-6")}>
        {index != null && (
          <span className="marketing-feature-index" aria-hidden>
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <h2
          className={cn(
            "font-display font-semibold tracking-tight text-foreground",
            large ? "text-3xl md:text-4xl lg:text-[2.75rem] lg:leading-tight" : "text-3xl md:text-4xl"
          )}
        >
          {block.title}
        </h2>
        {paragraphs.map((p) => (
          <p
            key={p.slice(0, 40)}
            className={cn(
              "leading-relaxed text-muted-foreground",
              large ? "text-lg md:text-xl" : "text-base md:text-lg"
            )}
          >
            {p}
          </p>
        ))}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button size={large ? "lg" : "default"} className="rounded-xl px-6 font-medium" asChild>
            <Link to={block.primaryCta.to}>{block.primaryCta.label}</Link>
          </Button>
          {block.secondaryCta && (
            <Button
              size={large ? "lg" : "default"}
              variant="outline"
              className="rounded-xl px-6 font-medium"
              asChild
            >
              <Link to={block.secondaryCta.to}>{block.secondaryCta.label}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="marketing-showcase-frame">
          {visual ??
            (imageSlot ? (
              <MarketingVisual slot={imageSlot} plain large={large} priority={block.id === "meridian"} className="border-0 shadow-none ring-0" />
            ) : null)}
        </div>
      </div>
    </article>
  );
}
