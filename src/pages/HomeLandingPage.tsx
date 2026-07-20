import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingComparePaths } from "@/components/marketing/MarketingComparePaths";
import { MarketingExploreGrid } from "@/components/marketing/MarketingExploreGrid";
import { FeatureShowcaseBlock } from "@/components/marketing/FeatureShowcaseBlock";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingMission } from "@/components/marketing/MarketingMission";
import { MarketingPrinciples } from "@/components/marketing/MarketingPrinciples";
import { MarketingProvidersStrip } from "@/components/marketing/MarketingProvidersStrip";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { MarketingStats } from "@/components/marketing/MarketingStats";
import { NewsStrip } from "@/components/marketing/NewsStrip";
import { useSuggestedDownload } from "@/components/marketing/useSuggestedDownload";
import { heroPrinciples, showcaseBlocks } from "@/config/marketingContent";
import { Download } from "lucide-react";

const downloadBtnClass =
  "h-12 min-w-[220px] gap-2.5 rounded-xl px-8 text-base font-semibold md:h-14 md:min-w-[260px] md:text-lg";

const HomeLandingPage: React.FC = () => {
  const suggested = useSuggestedDownload();

  useEffect(() => {
    document.title = "Openbentt | desktop-first AI workspace for researchers";
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
              <div className="marketing-hero-cta marketing-hero-enter marketing-hero-enter--4">
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

        <MarketingProvidersStrip />

        <MarketingExploreGrid />

        <section id="principles" className="marketing-section scroll-mt-32 marketing-section-band border-y border-border/40">
          <div className="marketing-container">
            <MarketingSectionHeader
              eyebrow="Principles"
              title="Built for private research"
              lead="Five principles that shape every workspace, from chat threads to GGUF weights on disk."
            />
            <div className="mt-12 md:mt-16">
              <MarketingPrinciples items={heroPrinciples} />
            </div>
            <div className="mt-14 md:mt-20">
              <MarketingStats />
            </div>
          </div>
        </section>

        <section id="features" className="marketing-section scroll-mt-32">
          <div className="marketing-container">
            <MarketingSectionHeader
              eyebrow="Desktop"
              title="What you get on desktop"
              lead="Animated previews for each desktop capability. Your main product screenshot stays in the hero only."
            />
            <div className="marketing-feature-stack">
              {showcaseBlocks.map((block, i) => (
                <MarketingReveal key={block.id} delay={i * 60}>
                  <FeatureShowcaseBlock block={block} large index={i} />
                </MarketingReveal>
              ))}
            </div>
          </div>
        </section>

        <MarketingComparePaths />

        <MarketingMission />

        <NewsStrip compact />

        <section className="marketing-section marketing-section--cta border-t border-border/40">
          <div className="marketing-container text-center">
            <MarketingReveal>
              <p className="marketing-eyebrow">Get started</p>
              <h2 className="marketing-section-title mt-3">Install Openbentt on your machine</h2>
              <p className="marketing-section-lead mx-auto mt-5 max-w-2xl">
                Windows, Linux, and macOS. Offline GGUF, labs, and the full workspace.
              </p>
              <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
                {primaryDownload}
              </div>
            </MarketingReveal>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
};

export default HomeLandingPage;
