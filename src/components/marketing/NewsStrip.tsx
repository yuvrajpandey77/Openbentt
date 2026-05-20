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
      <section id="news" className="scroll-mt-24 border-t border-border/40 py-12 md:py-16">
        <div className="marketing-container">
          <MarketingReveal className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Updates</h2>
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
          <ul className="divide-y divide-border/50">
            {latestNews.map((item, i) => (
              <MarketingReveal key={item.title} as="li" delay={i * 50}>
                <Link
                  to={item.to ?? "/download"}
                  className="flex flex-col gap-1 py-4 transition-colors hover:text-primary sm:flex-row sm:items-center sm:justify-between sm:gap-6"
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
    <section id="news" className="scroll-mt-24 border-b border-border/50 py-12 md:py-14">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Latest news</h2>
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
              <Link
                to="/download"
                className="marketing-news-card block h-full rounded-xl border border-border/60 bg-card/80 p-4 transition-colors hover:border-primary/30 hover:bg-card"
              >
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
