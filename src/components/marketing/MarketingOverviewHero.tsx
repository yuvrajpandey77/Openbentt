import { useState } from "react";
import { Link } from "react-router-dom";
import { appCardHero, hero, overviewModes } from "@/config/marketingContent";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-overview–style hero:
 * huge headline · two CTAs · mode tabs · product window.
 */
export function MarketingOverviewHero() {
  const [modeId, setModeId] = useState(overviewModes[0]?.id ?? "write");
  const mode = overviewModes.find((m) => m.id === modeId) ?? overviewModes[0];

  return (
    <section className="ov-hero" aria-labelledby="ov-hero-title">
      <div className="ov-hero__inner">
        <h1 id="ov-hero-title" className="ov-hero__title">
          {hero.headlineBefore}
          <span className="ov-hero__emphasis">{hero.headlineEmphasis}</span>
          {hero.headlineAfter}
        </h1>

        <div className="ov-hero__cta">
          <Link to={hero.primaryCta.to} className="ov-btn-primary">
            {hero.primaryCta.label}
          </Link>
          <Link to={hero.secondaryCta.to} className="ov-btn-text">
            {hero.secondaryCta.label}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="ov-mode-tabs" role="tablist" aria-label="Product modes">
          {overviewModes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === modeId}
              className={cn("ov-mode-tab", m.id === modeId && "ov-mode-tab--active")}
              onClick={() => setModeId(m.id)}
            >
              {m.tab}
            </button>
          ))}
        </div>

        <figure className="ov-hero__figure">
          <div className="ov-window">
            <div className="ov-window__chrome" aria-hidden>
              <span />
              <span />
              <span />
              <p className="ov-window__title">{mode?.title ?? "Openbentt"}</p>
            </div>
            <img
              src={appCardHero.src}
              alt={appCardHero.alt}
              width={appCardHero.width}
              height={appCardHero.height}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="ov-window__img"
            />
          </div>
          {mode && (
            <figcaption className="ov-hero__caption">
              <strong>{mode.title}</strong>
              <span>{mode.blurb}</span>
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  );
}
