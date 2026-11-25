import { createRoot } from "react-dom/client";
import { migrateAllLegacyStorage } from "@/lib/storageMigrate";
// Phase 3/C: install the Notebook mark collector at entry so startup project
// loads (which happen before the Notebook route is mounted) are instrumented.
import "@/lib/perf/notebookMarks";
import App from "./App.tsx";
import "./index.css";

/** Phase 3 startup instrumentation: renderer critical path, no artificial delays. */
const startupMarks: Array<{ name: string; atMs: number }> = [];
function markStartup(name: string) {
  performance.mark(name);
  startupMarks.push({ name, atMs: Math.round(performance.now() * 100) / 100 });
}
type StartupMarksApi = {
  dump: () => {
    marks: Array<{ name: string; atMs: number }>;
    navigation: ReturnType<PerformanceEntry["toJSON"]> | undefined;
  };
  mark: (name: string) => void;
};
(window as unknown as Window & { __openbenttStartupMarks: StartupMarksApi }).__openbenttStartupMarks = {
  dump: () => ({ marks: [...startupMarks], navigation: performance.getEntriesByType("navigation")[0]?.toJSON?.() }),
  mark: markStartup,
};
markStartup("openbentt:entry");

// Unregister stale service workers from earlier web builds. Electron's custom
// app:// scheme rejects this call in some document states; handle the rejection
// explicitly so startup never reports an unhandled promise rejection.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(
    (regs) => {
      for (const reg of regs) void reg.unregister().catch(() => {});
      markStartup("openbentt:serviceWorkerChecked");
    },
    () => markStartup("openbentt:serviceWorkerChecked")
  );
}

// Must run before the first render: UI reads these keys during mount.
migrateAllLegacyStorage();
markStartup("openbentt:storageMigrated");

createRoot(document.getElementById("root")!).render(<App />);
markStartup("openbentt:renderCalled");

requestAnimationFrame(() => markStartup("openbentt:firstFrame"));
