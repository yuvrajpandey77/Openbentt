import { useEffect, useId, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  rememberDownloadSignup,
  rememberDownloadSkip,
  startAssetDownload,
  submitDownloadSignup,
  type DownloadIntent,
} from "@/lib/downloadSignup";
import { trackDownloadClick, trackMarketingEvent } from "@/lib/analytics/marketingAnalytics";

const INTERESTS = [
  { id: "updates", label: "Openbentt release notes" },
  { id: "cogerphere", label: "Other things Cogerphere ships" },
  { id: "local-ai", label: "Local models & agents tips" },
] as const;

type Props = {
  open: boolean;
  intent: DownloadIntent | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Optional, skippable signup before an installer download starts.
 * Skip always continues the download — never blocks open-source installs.
 */
export function DownloadSignupDialog({ open, intent, onOpenChange }: Props) {
  const emailId = useId();
  const completedRef = useRef(false);
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<string[]>(["updates"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      completedRef.current = false;
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const finishDownload = () => {
    if (!intent?.href || completedRef.current) {
      onOpenChange(false);
      return;
    }
    completedRef.current = true;
    trackDownloadClick({
      assetId: intent.assetId,
      platform: intent.platform,
      version: intent.version,
      source: intent.source,
      href: intent.href,
    });
    startAssetDownload(intent.href);
    onOpenChange(false);
  };

  const onSkip = () => {
    rememberDownloadSkip(30);
    trackMarketingEvent("download_signup_skipped", {
      platform: intent?.platform ?? "unknown",
      asset_id: intent?.assetId ?? "unknown",
      source: intent?.source ?? "other",
    });
    finishDownload();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intent) return;
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email, or skip.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await submitDownloadSignup({
      email: trimmed,
      interests,
      intent,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "not_configured"
          ? "Signup storage isn’t configured yet — downloading anyway."
          : "Couldn’t save that email. You can skip and download."
      );
      rememberDownloadSkip(1);
      finishDownload();
      return;
    }
    rememberDownloadSignup(trimmed);
    finishDownload();
  };

  const toggleInterest = (id: string) => {
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && open && !completedRef.current && intent?.href) {
      rememberDownloadSkip(30);
      trackMarketingEvent("download_signup_skipped", {
        platform: intent.platform ?? "unknown",
        asset_id: intent.assetId,
        source: intent.source,
      });
      completedRef.current = true;
      trackDownloadClick({
        assetId: intent.assetId,
        platform: intent.platform,
        version: intent.version,
        source: intent.source,
        href: intent.href,
      });
      startAssetDownload(intent.href);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "ov-signup border-white/10 bg-[#121212] text-white sm:max-w-md",
          "[&>button]:text-white/70 [&>button]:hover:text-white"
        )}
      >
        <DialogHeader>
          <DialogTitle className="font-hand text-3xl tracking-normal text-white">
            Get updates (optional)
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Openbentt is free and open source. Leave an email if you want release notes and
            occasional Cogerphere news — or skip and download now.
          </DialogDescription>
        </DialogHeader>

        <form className="ov-signup__form" onSubmit={onSubmit}>
          <label className="ov-signup__label" htmlFor={emailId}>
            Email
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ov-signup__input"
            disabled={busy}
          />

          <fieldset className="ov-signup__interests">
            <legend>What should we send?</legend>
            {INTERESTS.map((item) => (
              <label key={item.id} className="ov-signup__check">
                <input
                  type="checkbox"
                  checked={interests.includes(item.id)}
                  onChange={() => toggleInterest(item.id)}
                  disabled={busy}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </fieldset>

          {error ? <p className="ov-signup__error">{error}</p> : null}

          <div className="ov-signup__actions">
            <button type="submit" className="ov-btn-primary ov-signup__primary" disabled={busy}>
              {busy ? "Saving…" : "Notify me & download"}
            </button>
            <button type="button" className="ov-btn-text ov-signup__skip" onClick={onSkip} disabled={busy}>
              Skip, just download
            </button>
          </div>

          <p className="ov-signup__fine">
            No spam. Unsubscribe anytime. Download always works without an email.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
