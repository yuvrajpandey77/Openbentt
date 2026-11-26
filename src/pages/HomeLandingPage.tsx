import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingCapabilityMap } from "@/components/marketing/MarketingCapabilityMap";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingProductStories } from "@/components/marketing/MarketingProductStories";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { NewsStrip } from "@/components/marketing/NewsStrip";
import { useSuggestedDownload } from "@/components/marketing/useSuggestedDownload";
import { Download } from "lucide-react";

const downloadBtnClass =
  "h-12 min-w-[220px] gap-2.5 rounded-xl px-8 text-base font-semibold md:h-14 md:min-w-[260px] md:text-lg";

const HomeLandingPage: React.FC = () => {
  const suggested = useSuggestedDownload();

  useEffect(() => {
    document.title = "Openbentt | Notebook, Paper Orchestra, agents & local GGUF";
  }, []);

  const primaryDownload = suggested?.href ? (
    <Button size="lg" className={downloadBtnClass} asChild>
      <a href={suggested.href} target="_blank" rel="noreferrer">
        <Download className="h-5 w-5" />
        {suggested.label}
      </a>
    </Button>
  ) : (
    <Button size="lg" className={downloadBtnClass} asChild>
      <Link to="/download">
        <Download className="h-5 w-5" />
        Download desktop app
      </Link>
    </Button>
  );

  return (
    <MarketingShell homeAnchors terminalBar wide>
      <main>
        <section className="marketing-hero relative z-10" aria-label="Introduction">
          <MarketingHero />

          <div className="marketing-hero-actions">
            <div className="marketing-container">
              <div className="marketing-hero-cta marketing-hero-enter" style={{ animationDelay: "0.4s" }}>
                <div className="contents">
                  {primaryDownload}
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-xl border-border/80 px-8 text-base font-medium transition-colors md:h-14 md:px-10 md:text-lg"
                    asChild
                  >
                    <Link to="/download">All platforms</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <MarketingCapabilityMap />

        <MarketingProductStories />

        <NewsStrip compact />

        <section className="marketing-section marketing-section--cta border-t border-border/40">
          <div className="marketing-container text-center">
            <MarketingReveal>
              <p className="marketing-eyebrow">Get the desktop lab</p>
              <h2 className="marketing-section-title mt-3">Windows · Linux · macOS</h2>
              <p className="marketing-section-lead mx-auto mt-5 max-w-2xl">
                Full Notebook, Paper Orchestra, OpenCode, Arena, Labs, and offline GGUF — not the browser subset.
              </p>
              <div className="mt-12 flex flex-wrap items-center justify-center gap-4">{primaryDownload}</div>
            </MarketingReveal>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
};

export default HomeLandingPage;
