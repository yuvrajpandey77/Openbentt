import { appCardHero, hero } from "@/config/marketingContent";
import { HeroHeadline } from "@/components/marketing/HeroHeadline";

/** Hero: brand + concrete product line + Notebook screenshot. */
export function MarketingHero() {
  return (
    <div className="marketing-hero-stage" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-inner relative z-10">
        <p className="marketing-hero-brand marketing-hero-enter marketing-hero-enter--1">{hero.brand}</p>

        <div className="marketing-hero-enter marketing-hero-enter--2">
          <HeroHeadline id="marketing-hero-title" />
        </div>

        <p className="marketing-hero-subhead marketing-hero-enter marketing-hero-enter--3">{hero.subhead}</p>

        <ul className="marketing-hero-modules marketing-hero-enter marketing-hero-enter--3" aria-label="Product modules">
          {hero.moduleStrip.map((name) => (
            <li key={name} className="marketing-hero-module">
              {name}
            </li>
          ))}
        </ul>

        <div className="marketing-hero-card-wrap marketing-hero-enter marketing-hero-enter--4">
          <img
            src={appCardHero.src}
            alt={appCardHero.alt}
            width={appCardHero.width}
            height={appCardHero.height}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="marketing-hero-card-img max-w-full"
          />
        </div>
      </div>
    </div>
  );
}
