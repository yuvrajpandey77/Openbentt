import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useChat } from "@/context/ChatContext";
import {
  buildModelManagerSnapshot,
  checkConfiguredModelAvailability,
  type ModelManagerSnapshot,
} from "@/lib/modelManager";
import { subscribeConnectivity, isNavigatorOnline } from "@/lib/offline/connectivity";
import { connectivityState, connectivityLabel, type ConnectivityState } from "@/lib/offline/mode";
import { loadPrivacyPreferences } from "@/lib/privacy/privacyPreferences";
import type { ModelAvailability } from "@/lib/modelManager/types";

interface LocalModelContextValue {
  snapshot: ModelManagerSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  navigatorOnline: boolean;
  connectivity: ConnectivityState;
  connectivityLabel: string;
  configuredAvailability: ModelAvailability | null;
  lastRefreshError: string | null;
}

const LocalModelContext = createContext<LocalModelContextValue | undefined>(undefined);

export const LocalModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { apiConfig } = useChat();
  const [snapshot, setSnapshot] = useState<ModelManagerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigatorOnline, setNavigatorOnline] = useState(isNavigatorOnline);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);

  useEffect(() => subscribeConnectivity(setNavigatorOnline), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastRefreshError(null);
    try {
      const snap = await buildModelManagerSnapshot(apiConfig, {
        navigatorOffline: !navigatorOnline,
        skipOllamaProbe: loadPrivacyPreferences().localOnlyMode && !navigatorOnline,
      });
      setSnapshot(snap);
    } catch (e) {
      setLastRefreshError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiConfig, navigatorOnline]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connectivity = connectivityState(!navigatorOnline);
  const connLabel = connectivityLabel(connectivity);

  const configuredAvailability = useMemo(() => {
    if (!snapshot) return null;
    return checkConfiguredModelAvailability(apiConfig, snapshot.ctx);
  }, [snapshot, apiConfig]);

  const value: LocalModelContextValue = {
    snapshot,
    loading,
    refresh,
    navigatorOnline,
    connectivity,
    connectivityLabel: connLabel,
    configuredAvailability,
    lastRefreshError,
  };

  return <LocalModelContext.Provider value={value}>{children}</LocalModelContext.Provider>;
};

export function useLocalModels(): LocalModelContextValue {
  const ctx = useContext(LocalModelContext);
  if (!ctx) {
    throw new Error("useLocalModels must be used within LocalModelProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent (e.g. marketing pages). */
export function useLocalModelsOptional(): LocalModelContextValue | null {
  return useContext(LocalModelContext) ?? null;
}
