import React, { Suspense, lazy } from "react";
import type { A2uiV1Message } from "@/lib/a2ui/permissionMessages";

const A2uiHostSurface = lazy(() =>
  import("./A2uiHostSurface").then((m) => ({ default: m.A2uiHostSurface }))
);

type Props = {
  surfaceId: string;
  messages: A2uiV1Message[];
  onAction?: (name: string) => void;
  className?: string;
};

/** Lazy A2UI host — keeps the catalog/renderer out of the initial chat bundle. */
export const A2uiHostSurfaceLazy: React.FC<Props> = (props) => (
  <Suspense fallback={<div className="h-16 animate-pulse rounded-xl bg-muted/40" aria-hidden />}>
    <A2uiHostSurface {...props} />
  </Suspense>
);
