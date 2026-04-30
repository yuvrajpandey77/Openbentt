import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info } from "lucide-react";

/** Honest scope: what this web app does vs hosted “Deep Research” products. */
export const CapabilitiesSheet: React.FC = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
          <Info className="h-4 w-4" />
          <span className="hidden sm:inline">Capabilities & limits</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-left">What Openbentt does (and does not)</SheetTitle>
          <SheetDescription className="text-left text-xs leading-relaxed">
            This is a browser client: your keys stay local; features are limited by CORS, bundle size, and no proprietary
            agent fleet on our servers.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="mt-2 min-h-0 flex-1 pr-3">
          <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h3 className="mb-1 font-medium text-foreground">Research mode</h3>
              <p>
                Fetches a <strong className="text-foreground">small, curated</strong> context pack (Wikipedia, Semantic
                Scholar, HTTPS URLs via a reader, optional Brave through a proxy). It is{" "}
                <strong className="text-foreground">not</strong> multi-agent Deep Research: no long autonomous browsing,
                tool loops, or report-length pipelines like some hosted products.
              </p>
              <p className="mt-2">
                Use <strong className="text-foreground">Research depth</strong> in Settings (quick / standard / deep) to
                scale how much context is pulled before the model answers — still bounded for latency and cost.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-medium text-foreground">“Deep thinking” / reasoning</h3>
              <p>
                <strong className="text-foreground">Reasoning emphasis</strong> adds stronger system instructions (portable
                across providers). Vendor-native “thinking” channels (e.g. some o-series or Claude extended thinking) depend
                on the API you connect; we do not claim parity with every host feature.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-medium text-foreground">Model list & modalities</h3>
              <p>
                Icons next to each model are <strong className="text-foreground">heuristics from the model id</strong> (text
                / vision / audio hints). They help you pick; they are not a live capability matrix from the provider. For
                ground truth, check the vendor’s docs.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-medium text-foreground">Notebook (PDF & LaTeX), Labs, Benchmark, WebGPU</h3>
              <p>
                These are <strong className="text-foreground">playgrounds</strong> that share your{" "}
                <strong className="text-foreground">Home → Settings</strong> provider and{" "}
                <strong className="text-foreground">Open in Home chat</strong> for full LLM turns. They are not separate
                hosted agents; WebGPU probes run in-browser and LLM calls still go through your configured API.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-medium text-foreground">Charts & tools</h3>
              <p>
                Assistant replies can emit <code className="rounded bg-muted px-1 font-mono text-[11px]">openbentt-chart</code>{" "}
                blocks. Richer analytics (dashboards, SQL, code execution) would need additional server sandboxes — not bundled
                here.
              </p>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
