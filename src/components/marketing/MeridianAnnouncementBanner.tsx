import { Link } from "react-router-dom";
import { meridianAnnouncement } from "@/config/marketingContent";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

type MeridianAnnouncementBannerProps = {
  className?: string;
};

/** Small headline pill directly under the site header. */
export function MeridianAnnouncementBanner({ className }: MeridianAnnouncementBannerProps) {
  return (
    <div
      className={cn("marketing-announcement flex justify-center border-b border-border/40 px-4 py-2", className)}
      role="region"
      aria-label="Product announcement"
    >
      <Link
        to={meridianAnnouncement.href}
        className="group inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/70 sm:gap-2.5 sm:px-4 sm:py-2 sm:text-sm"
      >
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground sm:text-[11px]">
          {meridianAnnouncement.eyebrow}
        </span>
        <span className="truncate font-medium sm:whitespace-nowrap">{meridianAnnouncement.title}</span>
        <ArrowRight
          className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:h-3.5 sm:w-3.5"
          aria-hidden
        />
      </Link>
    </div>
  );
}
