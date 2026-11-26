import { useState } from "react";
import { Link } from "react-router-dom";
import { FeatureShowcaseVisual } from "@/components/marketing/FeatureShowcaseVisual";
import { overviewModes } from "@/config/marketingContent";
import { cn } from "@/lib/utils";

/** Accordion / side-nav modes — ChatGPT Chat · Work · Codex pattern. */
export function MarketingModeSections() {
  const [activeId, setActiveId] = useState(overviewModes[0]?.id ?? "write");
  const active = overviewModes.find((m) => m.id === activeId) ?? overviewModes[0];

  if (!active) return null;

  return (
    <section id="modes" className="ov-modes" aria-label="Openbentt modes">
      <div className="ov-container">
        <div className="ov-modes__grid">
          <div className="ov-modes__nav" role="tablist" aria-orientation="vertical" aria-label="Modes">
            {overviewModes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={m.id === activeId}
                className={cn("ov-modes__nav-item", m.id === activeId && "ov-modes__nav-item--active")}
                onClick={() => setActiveId(m.id)}
              >
                {m.title}
              </button>
            ))}

            <div className="ov-modes__copy">
              <h2 className="ov-modes__title">{active.title}</h2>
              <p className="ov-modes__blurb">{active.blurb}</p>
              <p className="ov-modes__body">{active.body}</p>
              <Link to={active.cta.to} className="ov-link">
                {active.cta.label} →
              </Link>
            </div>
          </div>

          <div className="ov-modes__visual" role="tabpanel" aria-label={active.title}>
            <div className="ov-window ov-window--panel">
              <div className="ov-window__chrome" aria-hidden>
                <span />
                <span />
                <span />
                <p className="ov-window__title">{active.title}</p>
              </div>
              <FeatureShowcaseVisual variant={active.visual} className="!rounded-none !border-0 !shadow-none" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
