import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectBar } from "@/components/research/ProjectBar";
import { LibraryPapersPanel } from "@/components/research/LibraryPapersPanel";
import { LibraryBibliographyPanel } from "@/components/research/LibraryBibliographyPanel";
import { LibrarySynthesisPanel } from "@/components/research/LibrarySynthesisPanel";
import { LibraryModelsPanel } from "@/components/research/LibraryModelsPanel";
import { ZoteroAnnotationsPanel } from "@/components/research/ZoteroAnnotationsPanel";
import LocalGgufHub from "@/components/LocalGgufHub";
import { isWebClient } from "@/config/platformSurface";

export function LibraryWorkspace() {
  const web = isWebClient();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectBar />
      <Tabs defaultValue="papers" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="papers">Papers</TabsTrigger>
          <TabsTrigger value="bibliography">Bibliography</TabsTrigger>
          <TabsTrigger value="zotero">Zotero</TabsTrigger>
          <TabsTrigger value="synthesis">Themes</TabsTrigger>
          {!web && <TabsTrigger value="models">Models</TabsTrigger>}
        </TabsList>
        <TabsContent value="papers" className="min-h-0 flex-1 overflow-hidden">
          <LibraryPapersPanel />
        </TabsContent>
        <TabsContent value="bibliography" className="min-h-0 flex-1 overflow-hidden">
          <LibraryBibliographyPanel />
        </TabsContent>
        <TabsContent value="zotero" className="min-h-0 flex-1 overflow-hidden">
          <ZoteroAnnotationsPanel />
        </TabsContent>
        <TabsContent value="synthesis" className="min-h-0 flex-1 overflow-hidden">
          <LibrarySynthesisPanel />
        </TabsContent>
        {!web && (
          <TabsContent value="models" className="min-h-0 flex-1 overflow-y-auto p-4">
            <LibraryModelsPanel />
            <div className="mt-8">
              <LocalGgufHub />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
