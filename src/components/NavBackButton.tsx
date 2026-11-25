/**
 * History-aware back control for secondary pages (Settings, Agent, Labs, …).
 * Uses in-app history when available; otherwise falls back to a safe route.
 */
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appHomePath } from "@/lib/appHomePath";

type Props = {
  fallback?: string;
  className?: string;
  label?: string;
};

export function NavBackButton({ fallback, className, label }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const dest = fallback ?? appHomePath();

  const goBack = () => {
    const state = window.history.state as { idx?: number } | null;
    const idx = typeof state?.idx === "number" ? state.idx : null;
    // React Router populates history.state.idx for in-app navigations.
    if (idx != null && idx > 0) {
      navigate(-1);
      return;
    }
    // Same-session referrer inside the SPA (avoid leaving to marketing `/`).
    const ref = document.referrer;
    try {
      if (ref) {
        const u = new URL(ref);
        if (u.origin === window.location.origin && u.pathname !== location.pathname) {
          navigate(u.pathname + u.search + u.hash);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    navigate(dest);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? "sm" : "icon"}
      className={cn(
        label ? "h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" : "h-8 w-8 shrink-0",
        className
      )}
      onClick={goBack}
      aria-label={label ?? "Go back"}
    >
      <ArrowLeft className="h-4 w-4" />
      {label ? <span>{label}</span> : null}
    </Button>
  );
}
