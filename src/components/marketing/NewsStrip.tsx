import { latestNews } from "@/config/marketingContent";
import { githubReleasesLatestUrl } from "@/config/releaseDownloads";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { Link } from "react-router-dom";

type NewsStripProps = {
  compact?: boolean;
};

export function NewsStrip({ compact = false }: NewsStripProps) {
  const releasesUrl = githubReleasesLatestUrl();

  if (compact) {
    return (
      <section id="news" className="marketing-section scroll-mt-32 border-t border-border/40">
        <div className="marketing-container">
          <MarketingReveal className="mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-10">
            <div>
              <p className="marketing-eyebrow">Updates</p>
              <h2 className="marketing-section-title mt-3 text-left">Latest news</h2>
            </div>
            {releasesUrl && (
              <a
                href={releasesUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                GitHub releases
              </a>
            )}
          </MarketingReveal>
          <ul className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/50">
            {latestNews.map((item, i) => (
              <MarketingReveal key={item.title} as="li" delay={i * 50}>
                <Link
                  to={item.to ?? "/download"}
                  className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:px-6 md:py-5"
                >
                  <span className="text-base font-medium text-foreground md:text-lg">{item.title}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">{item.date}</span>
                </Link>
              </MarketingReveal>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section id="news" className="marketing-section scroll-mt-32 border-b border-border/50">
      <div className="marketing-container">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="marketing-section-title text-left">Latest news</h2>
          {releasesUrl && (
            <a
              href={releasesUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              View more on GitHub
            </a>
          )}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {latestNews.map((item) => (
            <li key={item.title}>
              <Link to="/download" className="marketing-news-card marketing-card block h-full p-4">
                <p className="font-medium leading-snug text-foreground">{item.title}</p>
                <p className="mt-2 text-xs text-muted-foreground">{item.date}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
