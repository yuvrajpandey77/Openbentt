import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, Sparkles } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { githubReleasesLatestUrl } from "@/config/releaseDownloads";
import { releaseNotes, latestReleaseNote } from "@/config/releaseNotes";
import { applyPageSeo, marketingSeo } from "@/lib/seo/pageSeo";

const NewsPage: React.FC = () => {
  const releasesUrl = githubReleasesLatestUrl();

  useEffect(() => {
    applyPageSeo(marketingSeo.news);
  }, []);

  return (
    <MarketingShell>
      <main className="marketing-section">
        <div className="marketing-container max-w-3xl">
          <MarketingReveal>
            <p className="marketing-eyebrow">Updates</p>
            <h1 className="marketing-section-title mt-3 text-left">News &amp; releases</h1>
            <p className="marketing-section-lead mt-4 max-w-2xl text-left">
              What shipped in Openbentt — starting with{" "}
              <span className="font-medium text-foreground">v{latestReleaseNote.version}</span>.
              Installers land on{" "}
              <Link to="/download" className="text-primary underline-offset-4 hover:underline">
                Download
              </Link>
              {releasesUrl ? (
                <>
                  {" "}
                  and{" "}
                  <a
                    href={releasesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    GitHub Releases
                  </a>
                </>
              ) : null}
              .
            </p>
          </MarketingReveal>

          <div className="mt-12 space-y-10 md:mt-16 md:space-y-14">
            {releaseNotes.map((note, i) => (
              <MarketingReveal key={note.version} delay={i * 60}>
                <article
                  id={`v${note.version.replace(/\./g, "-")}`}
                  className="scroll-mt-28 rounded-2xl border border-border/60 bg-card/40 p-6 md:p-8"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={i === 0 ? "default" : "secondary"}>v{note.version}</Badge>
                    <span className="text-sm text-muted-foreground">{note.date}</span>
                    {i === 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Sparkles className="h-3 w-3" /> Latest
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-3 font-display text-xl font-semibold tracking-tight md:text-2xl">
                    {note.title}
                  </h2>
                  <p className="mt-3 text-muted-foreground">{note.summary}</p>
                  {note.highlight && (
                    <p className="mt-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground">
                      {note.highlight}
                    </p>
                  )}
                  <div className="mt-6 space-y-5">
                    {note.sections.map((section) => (
                      <div key={section.heading}>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {section.heading}
                        </h3>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
                          {section.bullets.map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {note.cta && (
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button asChild>
                        <Link to={note.cta.to}>
                          <Download className="mr-2 h-4 w-4" />
                          {note.cta.label}
                        </Link>
                      </Button>
                      {i === 0 && (
                        <Button variant="outline" asChild>
                          <Link to="/">
                            Back to home
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              </MarketingReveal>
            ))}
          </div>
        </div>
      </main>
    </MarketingShell>
  );
};

export default NewsPage;
