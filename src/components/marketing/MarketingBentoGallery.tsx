import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { galleryTiles } from "@/config/marketingImages";
import { marketingImageUrl } from "@/config/marketingImages";
import { cn } from "@/lib/utils";

const BENTO_LAYOUT = [
  "md:col-span-2 md:row-span-2",
  "md:col-span-1",
  "md:col-span-1",
  "md:col-span-1 md:row-span-2",
  "md:col-span-1",
  "md:col-span-2",
] as const;

export function MarketingBentoGallery() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % galleryTiles.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section id="explore" className="marketing-section scroll-mt-32 pb-16 md:pb-20">
      <div className="marketing-container">
        <MarketingSectionHeader
          eyebrow="Explore"
          title="Every workspace in one app"
          lead="Tap a tile to jump to that feature. The gallery cycles so you can preview the full desktop surface."
        />

        <div className="mt-10 grid gap-3 sm:grid-cols-2 md:mt-14 md:grid-cols-4 md:grid-rows-2 md:gap-4">
          {galleryTiles.map((tile, i) => (
            <MarketingReveal
              key={tile.id}
              delay={i * 50}
              className={cn("min-h-[140px]", BENTO_LAYOUT[i])}
            >
              <Link
                to={tile.href}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                className={cn(
                  "group relative block h-full min-h-[inherit] overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-500",
                  active === i && "border-primary/40 ring-2 ring-primary/20 shadow-lg"
                )}
              >
                <img
                  src={marketingImageUrl(tile.file)}
                  alt={tile.alt}
                  loading="lazy"
                  className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.03]"
                />
                <div className="marketing-bento-overlay absolute inset-x-0 bottom-0 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{tile.label}</p>
                </div>
              </Link>
            </MarketingReveal>
          ))}
        </div>

        <MarketingReveal delay={200} className="mt-8 flex justify-center gap-2">
          {galleryTiles.map((tile, i) => (
            <button
              key={tile.id}
              type="button"
              aria-label={`Show ${tile.label}`}
              onClick={() => setActive(i)}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                active === i ? "w-8 bg-primary" : "w-2 bg-muted-foreground/35 hover:bg-muted-foreground/55"
              )}
            />
          ))}
        </MarketingReveal>
      </div>
    </section>
  );
}
