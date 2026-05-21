import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useNotebookStudioSettings,
  type NotebookPaneId,
} from "@/context/NotebookStudioSettingsContext";
import { compileBackendLabel } from "@/lib/notebookCompileSettings";
import type { CitationStyle } from "@/types/researchProject";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PANE_TABS: { id: NotebookPaneId; label: string }[] = [
  { id: "global", label: "All" },
  { id: "editor", label: "Editor" },
  { id: "preview", label: "Preview" },
  { id: "files", label: "Files" },
  { id: "chat", label: "Chat" },
];

export function NotebookPaneSettingsDock() {
  const [open, setOpen] = useState(false);
  const {
    pane,
    compile,
    documentStyle,
    activePane,
    setActivePane,
    updatePane,
    updateCompile,
    updateDocumentStyle,
  } = useNotebookStudioSettings();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={cn(
            "fixed bottom-4 left-4 z-[60] h-10 w-10 rounded-full shadow-lg",
            "border border-border/80 bg-card/95 backdrop-blur-sm"
          )}
          aria-label="Notebook pane settings"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="z-[70] w-[min(22rem,calc(100vw-2rem))] p-0"
        sideOffset={8}
      >
        <Tabs
          value={activePane}
          onValueChange={(v) => setActivePane(v as NotebookPaneId)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-5 rounded-none border-b bg-muted/40">
            {PANE_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="text-[10px] px-1">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="global" className="space-y-3 p-3 mt-0">
            <div className="space-y-1.5">
              <Label className="text-xs">Compile backend</Label>
              <Select
                value={compile.backend}
                onValueChange={(v) => updateCompile({ backend: v as typeof compile.backend })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{compileBackendLabel("auto")}</SelectItem>
                  <SelectItem value="wasm">{compileBackendLabel("wasm")}</SelectItem>
                  <SelectItem value="local">{compileBackendLabel("local")}</SelectItem>
                  <SelectItem value="remote">{compileBackendLabel("remote")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Document class</Label>
              <Select
                value={documentStyle.documentClass}
                onValueChange={(v) =>
                  updateDocumentStyle({ documentClass: v as typeof documentStyle.documentClass })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="article">Article</SelectItem>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="ieee">IEEE (local TeX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Font preset</Label>
              <Select
                value={documentStyle.font}
                onValueChange={(v) => updateDocumentStyle({ font: v as typeof documentStyle.font })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lmodern">Latin Modern</SelectItem>
                  <SelectItem value="times">Times</SelectItem>
                  <SelectItem value="palatino">Palatino</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Apply style on compile</Label>
              <Switch
                checked={compile.applyDocumentStyle}
                onCheckedChange={(v) => updateCompile({ applyDocumentStyle: v })}
              />
            </div>
          </TabsContent>

          <TabsContent value="editor" className="space-y-3 p-3 mt-0">
            <div className="space-y-2">
              <Label className="text-xs">Font size: {pane.editorFontSize}px</Label>
              <Slider
                value={[pane.editorFontSize]}
                min={10}
                max={22}
                step={1}
                onValueChange={([v]) => updatePane({ editorFontSize: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Syntax highlighting</Label>
              <Switch
                checked={pane.editorUseCodeMirror}
                onCheckedChange={(v) => updatePane({ editorUseCodeMirror: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Word wrap</Label>
              <Switch checked={pane.editorWordWrap} onCheckedChange={(v) => updatePane({ editorWordWrap: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Line numbers</Label>
              <Switch
                checked={pane.editorLineNumbers}
                onCheckedChange={(v) => updatePane({ editorLineNumbers: v })}
              />
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-3 p-3 mt-0">
            <div className="space-y-2">
              <Label className="text-xs">Default zoom: {pane.previewDefaultZoom.toFixed(2)}×</Label>
              <Slider
                value={[pane.previewDefaultZoom * 100]}
                min={65}
                max={225}
                step={5}
                onValueChange={([v]) => updatePane({ previewDefaultZoom: v / 100 })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Fit width by default</Label>
              <Switch checked={pane.previewFitWidth} onCheckedChange={(v) => updatePane({ previewFitWidth: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">PDF text layer (select/copy)</Label>
              <Switch
                checked={pane.previewShowTextLayer}
                onCheckedChange={(v) => updatePane({ previewShowTextLayer: v })}
              />
            </div>
          </TabsContent>

          <TabsContent value="files" className="space-y-3 p-3 mt-0">
            <p className="text-xs text-muted-foreground">
              Upload images to <strong>assets/</strong>. Reference with{" "}
              <code className="text-[10px]">\includegraphics{"{assets/name.png}"}</code>.
            </p>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Compile on save</Label>
              <Switch checked={pane.compileOnSave} onCheckedChange={(v) => updatePane({ compileOnSave: v })} />
            </div>
          </TabsContent>

          <TabsContent value="chat" className="space-y-3 p-3 mt-0">
            <div className="space-y-1.5">
              <Label className="text-xs">Default citation style</Label>
              <Select
                value={pane.citationStyle}
                onValueChange={(v) => updatePane({ citationStyle: v as CitationStyle })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ieee">IEEE</SelectItem>
                  <SelectItem value="apa">APA</SelectItem>
                  <SelectItem value="mla">MLA</SelectItem>
                  <SelectItem value="acm">ACM</SelectItem>
                  <SelectItem value="nature">Nature</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
