import { hero } from "@/config/marketingContent";
import { cn } from "@/lib/utils";

type HeroHeadlineProps = {
  className?: string;
  id?: string;
  srOnly?: boolean;
};

export function HeroHeadline({ className, id, srOnly }: HeroHeadlineProps) {
  return (
    <h1
      id={id}
      className={cn(
        "font-display font-bold tracking-tight text-[hsl(222_47%_11%)]",
        srOnly
          ? "sr-only"
          : "mx-auto max-w-6xl break-words text-center text-[2.125rem] leading-[1.1] sm:text-[2.75rem] md:text-[3.5rem] lg:text-[4.25rem] lg:leading-[1.08]",
        className
      )}
    >
      {hero.headlineBefore}
      <span className="text-brand-gradient">{hero.headlineEmphasis}</span>
      {hero.headlineAfter}
    </h1>
  );
}
