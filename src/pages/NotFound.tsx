import { Link, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { appHomePath } from "@/lib/appHomePath";
import { resolveRouteAlias } from "@/lib/routeAliases";
import { applyPageSeo } from "@/lib/seo/pageSeo";

const QUICK = [
  { to: "/chat", label: "Chat" },
  { to: "/projects", label: "Projects" },
  { to: "/notebook", label: "Notebook" },
  { to: "/documents", label: "Documents" },
  { to: "/labs", label: "Research" },
  { to: "/settings", label: "Settings" },
] as const;

const NotFound = () => {
  const location = useLocation();
  const alias = resolveRouteAlias(location.pathname);

  useEffect(() => {
    if (!alias) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
      applyPageSeo({
        title: "Page not found — Openbentt",
        description: "That Openbentt page does not exist.",
        path: location.pathname,
        noindex: true,
      });
    }
  }, [location.pathname, alias]);

  if (alias) {
    return <Navigate to={alias} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="mb-2 font-display text-4xl font-bold text-foreground">404</h1>
        <p className="mb-2 text-lg text-muted-foreground">That page does not exist.</p>
        <p className="mb-6 font-mono text-xs text-muted-foreground/80">{location.pathname}</p>
        <div className="flex flex-col items-center gap-3 text-sm">
          <Link to={appHomePath()} className="font-medium text-primary underline-offset-4 hover:underline">
            Back to home
          </Link>
          <div className="flex flex-wrap justify-center gap-2">
            {QUICK.map((q) => (
              <Link
                key={q.to}
                to={q.to}
                className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
