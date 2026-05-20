import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, Rocket } from "lucide-react";
import { getDesktopApi, type DesktopUpdateStatus } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { formatBytes, formatSpeed } from "@/lib/downloadProgress";
import { useToast } from "@/components/ui/use-toast";

/** Settings card: check for updates (packaged Electron only). */
const DesktopUpdateCard: React.FC = () => {
  const api = getDesktopApi();
  const { toast } = useToast();
  const [version, setVersion] = useState<string>("");
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!api?.getAppVersion) return;
    void api.getAppVersion().then(setVersion);
    return api.onUpdateStatus?.((s) => setStatus(s));
  }, [api]);

  if (!isDesktopApp() || !api?.checkForUpdates) return null;

  const onCheck = async () => {
    setChecking(true);
    try {
      const r = await api.checkForUpdates();
      if (!r.ok) {
        toast({
          title: "Update check failed",
          description: r.message ?? "Could not reach GitHub Releases.",
          variant: "destructive",
        });
      } else if (r.updateInfo) {
        toast({ title: "Update available", description: `Version ${r.updateInfo} is on GitHub Releases.` });
      } else if (status?.phase !== "available") {
        toast({ title: "You're up to date", description: `Openbentt ${version || "—"}` });
      }
    } finally {
      setChecking(false);
    }
  };

  const onDownload = () => void api.downloadUpdate?.();
  const onInstall = () => void api.installUpdate?.();

  const downloading = status?.phase === "downloading";
  const ready = status?.phase === "downloaded";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Desktop app updates</CardTitle>
        <CardDescription>
          Installed build <span className="font-mono text-foreground">{version || "…"}</span> — checks GitHub
          Releases for newer installers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={checking} onClick={() => void onCheck()}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            Check for updates
          </Button>
          {status?.phase === "available" && !ready && (
            <Button type="button" size="sm" onClick={onDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download update
            </Button>
          )}
          {ready && (
            <Button type="button" size="sm" onClick={onInstall}>
              <Rocket className="mr-1.5 h-3.5 w-3.5" />
              Restart & install
            </Button>
          )}
        </div>

        {downloading && status.percent != null ? (
          <div className="space-y-1.5">
            <Progress value={status.percent} className="h-2" />
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {formatBytes(status.transferred ?? 0)} / {formatBytes(status.total ?? 0)}
              {status.bytesPerSecond ? ` · ${formatSpeed(status.bytesPerSecond)}` : ""}
            </p>
          </div>
        ) : null}

        {status?.phase === "error" && status.message ? (
          <p className="text-xs text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default DesktopUpdateCard;
