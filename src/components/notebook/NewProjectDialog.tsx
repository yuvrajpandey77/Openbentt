import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateGallery } from "@/components/notebook/TemplateGallery";
import type { TemplateCatalogEntry } from "@/lib/research/templateCatalog";
import { FileUp, LayoutTemplate, Plus } from "lucide-react";

type NewProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBlank: (title: string) => void | Promise<void>;
  onCreateFromTemplate: (title: string, entry: TemplateCatalogEntry) => void | Promise<void>;
  onImport: (files: FileList | null) => void | Promise<void>;
  onImportFolder?: (files: FileList) => void | Promise<void>;
  busy?: boolean;
};

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreateBlank,
  onCreateFromTemplate,
  onImport,
  onImportFolder,
  busy,
}: NewProjectDialogProps) {
  const [tab, setTab] = useState<"blank" | "template" | "import">("template");
  const [title, setTitle] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setTab("template");
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Start blank, from a LaTeX template, or import an existing file.</DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="template" className="gap-1 text-xs">
                <LayoutTemplate className="h-3.5 w-3.5" />
                Template
              </TabsTrigger>
              <TabsTrigger value="blank" className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Blank
              </TabsTrigger>
              <TabsTrigger value="import" className="gap-1 text-xs">
                <FileUp className="h-3.5 w-3.5" />
                Import
              </TabsTrigger>
            </TabsList>
            <TabsContent value="template" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Verified templates include main.tex, references.bib, and multi-section bodies ready to compile.
              </p>
              <Button type="button" className="w-full" disabled={busy} onClick={() => setGalleryOpen(true)}>
                <LayoutTemplate className="mr-2 h-4 w-4" />
                Browse templates…
              </Button>
            </TabsContent>
            <TabsContent value="blank" className="space-y-3 pt-3">
              <Input
                placeholder="Project name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onCreateBlank(title.trim() || "New project");
                }}
              />
              <Button
                type="button"
                className="w-full"
                disabled={busy}
                onClick={() => void onCreateBlank(title.trim() || "New project")}
              >
                Create blank project
              </Button>
            </TabsContent>
            <TabsContent value="import" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                One-click import from Overleaf / Prism ZIP, Openbentt export, Codex/Cursor folders, or raw{" "}
                <code className="rounded bg-muted px-1">.tex</code> / <code className="rounded bg-muted px-1">.bib</code>.
              </p>
              <input
                ref={importRef}
                type="file"
                accept=".tex,.bib,.zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  void onImport(e.target.files);
                  e.target.value = "";
                  onOpenChange(false);
                }}
              />
              <input
                ref={folderRef}
                type="file"
                // @ts-expect-error webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                multiple
                className="hidden"
                onChange={(e) => {
                  if (onImportFolder && e.target.files?.length) {
                    void onImportFolder(e.target.files);
                  } else {
                    void onImport(e.target.files);
                  }
                  e.target.value = "";
                  onOpenChange(false);
                }}
              />
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => importRef.current?.click()}>
                <FileUp className="mr-2 h-4 w-4" />
                Import .tex / .bib / .zip
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => folderRef.current?.click()}
              >
                <FileUp className="mr-2 h-4 w-4" />
                Import folder
              </Button>
              <Button type="button" variant="ghost" className="w-full text-xs" asChild>
                <a href="#zotero" onClick={() => onOpenChange(false)}>
                  Prefer Zotero? Connect it under Integrations / Notebook Tools.
                </a>
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <TemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        mode="create"
        featuredOnly
        projectTitle={title}
        onProjectTitleChange={setTitle}
        applying={busy}
        onApply={(entry) => {
          void onCreateFromTemplate(title.trim() || entry.label, entry);
          setGalleryOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
