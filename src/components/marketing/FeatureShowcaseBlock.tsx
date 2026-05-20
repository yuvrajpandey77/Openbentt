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
};

export function FeatureShowcaseBlock({ block, imageSlot, visual, plain, large }: FeatureShowcaseBlockProps) {
  const Icon = block.icon;
  const paragraphs = large ? block.paragraphs.slice(0, 1) : block.paragraphs;

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
        <div className="pt-2">
          <Button size={large ? "lg" : "default"} className="rounded-xl px-6 font-medium" asChild>
            <Link to={block.primaryCta.to}>{block.primaryCta.label}</Link>
          </Button>
        </div>
      </div>

      <div className="relative">
        {visual ??
          (imageSlot ? (
            <MarketingVisual slot={imageSlot} plain={plain} large={large} />
          ) : (
            <div className="marketing-showcase-panel flex aspect-[16/10] flex-col items-center justify-center rounded-2xl border border-border/70 bg-gradient-to-br from-muted/50 via-card to-primary/5 p-8 shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Icon className="h-8 w-8" strokeWidth={1.5} />
              </div>
              <p className="mt-6 max-w-xs text-center text-sm text-muted-foreground">{block.title}</p>
            </div>
          ))}
      </div>
    </article>
  );
}
