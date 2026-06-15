import React, { createContext, useContext, useMemo, useState } from "react";

type WebChatUiContextValue = {
  composerSeed: string;
  setComposerSeed: (text: string) => void;
  clearComposerSeed: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  installOpen: boolean;
  openInstall: () => void;
  closeInstall: () => void;
};

const WebChatUiContext = createContext<WebChatUiContextValue | null>(null);

export function WebChatUiProvider({ children }: { children: React.ReactNode }) {
  const [composerSeed, setComposerSeedState] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  const value = useMemo<WebChatUiContextValue>(
    () => ({
      composerSeed,
      setComposerSeed: setComposerSeedState,
      clearComposerSeed: () => setComposerSeedState(""),
      searchOpen,
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      installOpen,
      openInstall: () => setInstallOpen(true),
      closeInstall: () => setInstallOpen(false),
    }),
    [composerSeed, searchOpen, installOpen]
  );

  return <WebChatUiContext.Provider value={value}>{children}</WebChatUiContext.Provider>;
}

export function useWebChatUi(): WebChatUiContextValue | null {
  return useContext(WebChatUiContext);
}

/** Read web chat UI state; falls back to no-ops when outside provider. */
export function useWebChatUiOptional() {
  const ctx = useWebChatUi();
  return useMemo(
    () =>
      ctx ?? {
        composerSeed: "",
        setComposerSeed: () => {},
        clearComposerSeed: () => {},
        searchOpen: false,
        openSearch: () => {},
        closeSearch: () => {},
        installOpen: false,
        openInstall: () => {},
        closeInstall: () => {},
      },
    [ctx]
  );
}
