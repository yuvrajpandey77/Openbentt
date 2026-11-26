import { latestNews } from "@/config/marketingContent";
import { githubReleasesLatestUrl } from "@/config/releaseDownloads";
import { Link } from "react-router-dom";

type NewsStripProps = {
  compact?: boolean;
};

export function NewsStrip({ compact = false }: NewsStripProps) {
  const releasesUrl = githubReleasesLatestUrl();
  const items = compact ? latestNews.slice(0, 5) : latestNews;

  if (compact) {
    return (
      <section id="news" className="ov-news scroll-mt-28" aria-label="Latest news">
        <div className="ov-container">
          <div className="ov-news__head">
            <h2 className="font-hand">Latest news</h2>
            <div className="ov-news__links">
              <Link to="/news">All release notes</Link>
              {releasesUrl && (
                <a href={releasesUrl} target="_blank" rel="noreferrer">
                  GitHub releases
                </a>
              )}
            </div>
          </div>
          <ul className="ov-news__list">
            {items.map((item) => (
              <li key={item.title}>
                <Link to={item.to ?? "/news"}>
                  <span>{item.title}</span>
                  <time>{item.date}</time>
                </Link>
              </li>
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
          <div className="flex flex-wrap gap-4">
            <Link to="/news" className="text-sm font-medium text-primary hover:underline">
              All release notes
            </Link>
            {releasesUrl && (
              <a
                href={releasesUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-muted-foreground hover:underline"
              >
                GitHub
              </a>
            )}
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.title}>
              <Link to={item.to ?? "/news"} className="marketing-news-card marketing-card block h-full p-4">
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
