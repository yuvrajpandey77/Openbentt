import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingModeSections } from "@/components/marketing/MarketingModeSections";
import { MarketingOverviewHero } from "@/components/marketing/MarketingOverviewHero";
import { MarketingUseStrip } from "@/components/marketing/MarketingUseStrip";
import { NewsStrip } from "@/components/marketing/NewsStrip";
import { useSuggestedDownload } from "@/components/marketing/useSuggestedDownload";
import { mission } from "@/config/marketingContent";
import { applyPageSeo, marketingSeo } from "@/lib/seo/pageSeo";

const HomeLandingPage: React.FC = () => {
  const suggested = useSuggestedDownload();

  useEffect(() => {
    applyPageSeo(marketingSeo.home);
  }, []);

  const downloadHref = suggested?.href ?? "/download";
  const downloadLabel = suggested?.label ?? "Download desktop";
  const downloadIsExternal = Boolean(suggested?.href);

  return (
    <MarketingShell homeAnchors overview>
      <main className="ov-main">
        <MarketingOverviewHero />

        <MarketingModeSections />

        <MarketingUseStrip />

        <NewsStrip compact />

        <section className="ov-cta" aria-label="Get started">
          <div className="ov-container ov-cta__inner">
            <h2 className="font-hand">{mission.title}</h2>
            <p className="font-hand ov-cta__sub">{mission.body}</p>
            <div className="ov-hero__cta">
              {downloadIsExternal ? (
                <a href={downloadHref} target="_blank" rel="noreferrer" className="ov-btn-primary">
                  {downloadLabel}
                </a>
              ) : (
                <Link to={downloadHref} className="ov-btn-primary">
                  {downloadLabel}
                </Link>
              )}
              <Link to="/download" className="ov-btn-text">
                All platforms →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
};

export default HomeLandingPage;
