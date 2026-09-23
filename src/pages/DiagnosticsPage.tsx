import React from "react";
import { Link } from "react-router-dom";
import { VoiceDiagnostics } from "@/components/conversation/VoiceDiagnostics";
import { ComputerUsePanel, ModelRouteStatus } from "@/components/conversation/ComputerUsePanel";
import { ExecutionSetupSection } from "@/components/conversation/ExecutionSetupSection";
import { useNavigate } from "react-router-dom";
import { appHomePath } from "@/lib/appHomePath";
import { Stethoscope } from "lucide-react";

/**
 * Phase J — Diagnostics: runtime, models, voice pipeline, computer use.
 * One status surface; launch/setup never blocks the app unnecessarily.
 */
const DiagnosticsPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Stethoscope className="h-5 w-5 text-primary" /> Diagnostics
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Runtime, models, voice, and computer-use status.</p>
      <div className="mt-4 flex flex-col gap-3 pb-10">
        <section className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-semibold text-foreground">Execution runtime</p>
          <div className="mt-1">
            <ModelRouteStatus />
          </div>
        </section>
        <VoiceDiagnostics />
        <ComputerUsePanel />
        <section className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-semibold text-foreground">First-run setup</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            OpenCode · models · workspace — deterministic, re-runnable any time.
          </p>
          <div className="mt-2">
            <ExecutionSetupSection onContinue={() => navigate(appHomePath())} />
          </div>
        </section>
        <p className="text-[11px] text-muted-foreground">
          Chat stays one click away: <Link to="/chat" className="underline">back to conversation</Link>.
        </p>
      </div>
    </div>
  );
};

export default DiagnosticsPage;
