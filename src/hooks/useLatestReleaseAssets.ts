import { useEffect, useState } from "react";
import { fetchLatestReleaseAssets, type ResolvedReleaseAssets } from "@/lib/fetchLatestReleaseAssets";

export function useLatestReleaseAssets(): {
  release: ResolvedReleaseAssets | null;
  loading: boolean;
} {
  const [release, setRelease] = useState<ResolvedReleaseAssets | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchLatestReleaseAssets().then((r) => {
      if (!cancelled) {
        setRelease(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { release, loading };
}
