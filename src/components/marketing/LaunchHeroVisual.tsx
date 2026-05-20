import { cn } from "@/lib/utils";
import { launchHero } from "@/config/marketingContent";

type LaunchHeroVisualProps = {
  className?: string;
  priority?: boolean;
};

/** Hero creative — tagline, subhead, and product UI baked in. */
export function LaunchHeroVisual({ className, priority = true }: LaunchHeroVisualProps) {
  return (
    <figure className={cn("w-full", className)}>
      <img
        src={launchHero.src}
        alt={launchHero.alt}
        width={launchHero.width}
        height={launchHero.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className="h-auto w-full max-w-none"
        sizes="(min-width: 1280px) 1280px, 100vw"
      />
    </figure>
  );
}
