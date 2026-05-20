import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { FeatureShowcaseBlock } from "@/components/marketing/FeatureShowcaseBlock";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { NewsStrip } from "@/components/marketing/NewsStrip";
import { useSuggestedDownload } from "@/components/marketing/useSuggestedDownload";
import { showcaseBlocks } from "@/config/marketingContent";
import { showcaseImages } from "@/config/marketingImages";
import { Download } from "lucide-react";

const FEATURE_IDS = ["notebook", "model-arena", "desktop-gguf"] as const;

const downloadBtnClass =
  "h-12 min-w-[220px] gap-2.5 rounded-xl px-8 text-base font-semibold md:h-14 md:min-w-[260px] md:text-lg";

const HomeLandingPage: React.FC = () => {
  const suggested = useSuggestedDownload();

  useEffect(() => {
    document.title = "Openbentt | local-first AI workspace for researchers";
  }, []);

  const features = showcaseBlocks.filter((b) =>
    (FEATURE_IDS as readonly string[]).includes(b.id)
  );

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
        <section className="marketing-hero" aria-label="Introduction">
          <MarketingHero />

          <div className="marketing-hero-actions">
            <div className="marketing-container">
              <div className="marketing-hero-cta">
                {primaryDownload}
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl border-border/80 px-8 text-base font-medium md:h-14 md:px-10 md:text-lg"
                  asChild
                >
                  <Link to="/download">All platforms</Link>
                </Button>
              </div>

              <p className="marketing-hero-web-link">
                <Link to="/chat" className="font-medium text-foreground underline-offset-4 hover:underline">
                  Try the web app
                </Link>
                <span className="text-border"> · </span>
                <span>no install required</span>
              </p>
            </div>
          </div>
        </section>

        <section id="features" className="marketing-section scroll-mt-32">
          <div className="marketing-container">
            <h2 className="marketing-section-title">What you get on desktop</h2>
            <p className="marketing-section-lead">
              Notebook, model comparison, and offline GGUF — the same workspace shown above.
            </p>
            <div className="marketing-feature-stack">
              {features.map((block) => (
                <FeatureShowcaseBlock
                  key={block.id}
                  block={block}
                  imageSlot={showcaseImages[block.id]}
                  plain
                  large
                />
              ))}
            </div>
          </div>
        </section>

        <NewsStrip compact />

        <section className="marketing-section marketing-section--cta border-t border-border/40">
          <div className="marketing-container text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.75rem]">
              Install Openbentt on your machine
            </h2>
            <p className="marketing-section-lead mx-auto mt-5 max-w-2xl">
              Windows, Linux, and macOS. Offline GGUF, labs, and the full workspace.
            </p>
            <div className="mt-12 flex justify-center">{primaryDownload}</div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
};

export default HomeLandingPage;
