import React from "react";
import { Navigate } from "react-router-dom";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { Link } from "react-router-dom";

/** Notebook studio is desktop-only for this release. */
export function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  if (isDesktopApp()) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="font-display text-xl font-semibold">Desktop app required</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The research notebook studio (multi-PDF proofreading, project tree, and local library) runs in the
        Openbentt desktop app only. Install the desktop build to use this workspace.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="default">
          <Link to="/download">
            <Download className="mr-2 h-4 w-4" />
            Get desktop app
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

export function DesktopOnlyRedirect({ to = "/" }: { to?: string }) {
  if (isDesktopApp()) return null;
  return <Navigate to={to} replace />;
}
