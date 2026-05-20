import { useEffect, useMemo, useState } from "react";
import { releaseAssets } from "@/config/releaseDownloads";
import { getClientPlatform, type ClientPlatform } from "@/lib/detectClientPlatform";

export type SuggestedDownload = {
  label: string;
  hint: string;
  href: string | null;
  platform: ClientPlatform;
};

export function useSuggestedDownload(): SuggestedDownload | null {
  const [platform, setPlatform] = useState<ClientPlatform>("unknown");

  useEffect(() => {
    setPlatform(getClientPlatform());
  }, []);

  return useMemo(() => {
    switch (platform) {
      case "windows":
        return {
          platform,
          label: "Windows installer",
          hint: "NSIS · Windows 10/11 x64",
          href: releaseAssets.windowsNsis(),
        };
      case "linux":
        return {
          platform,
          label: "Linux AppImage",
          hint: "amd64 · chmod +x and run",
          href: releaseAssets.linuxAppImage(),
        };
      case "mac":
        return {
          platform,
          label: "macOS disk image",
          hint: "Apple Silicon (arm64)",
          href: releaseAssets.macDmgArm64(),
        };
      default:
        return null;
    }
  }, [platform]);
}
