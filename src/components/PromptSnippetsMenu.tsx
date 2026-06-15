import React, { useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Sparkles, Plus } from "lucide-react";
import { loadAllSnippets, addCustomSnippet, type PromptSnippet } from "@/lib/promptSnippets";

interface PromptSnippetsMenuProps {
  onInsert: (text: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export const PromptSnippetsMenu: React.FC<PromptSnippetsMenuProps> = ({
  onInsert,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}) => {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const menuOpen = controlledOpen ?? internalOpen;
  const setMenuOpen = onOpenChange ?? setInternalOpen;
  const [snippets, setSnippets] = useState<PromptSnippet[]>(() => loadAllSnippets());
  const [openAdd, setOpenAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const refresh = () => setSnippets(loadAllSnippets());

  const handleAdd = () => {
    if (!newBody.trim()) {
      toast({ title: "Body required", variant: "destructive" });
      return;
    }
    addCustomSnippet(newTitle, newBody.trim());
    setNewTitle("");
    setNewBody("");
    setOpenAdd(false);
    refresh();
    toast({ title: "Snippet saved", description: "Stored in this browser only." });
  };

  const list = useMemo(() => snippets, [snippets]);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {showTrigger && (
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2 text-[11px]" aria-label="Insert saved prompt">
              <Sparkles className="h-3.5 w-3.5" />
              Snippets
            </Button>
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="start" className="w-[min(100vw-2rem,22rem)] max-h-[min(70vh,24rem)] overflow-y-auto">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Insert a starter prompt (stored locally)
          </DropdownMenuLabel>
          {list.map((s) => (
            <DropdownMenuItem
              key={s.id}
              className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
              onClick={() => onInsert(s.body)}
            >
              <span className="font-medium text-foreground">{s.title}</span>
              <span className="line-clamp-2 text-[11px] text-muted-foreground">{s.body}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-primary" onClick={() => setOpenAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Save custom snippet…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New snippet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="snip-title">Title</Label>
              <Input
                id="snip-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Code review"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snip-body">Prompt text</Label>
              <Textarea
                id="snip-body"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={5}
                placeholder="Text inserted into the composer when you pick this snippet."
                className="resize-none font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenAdd(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAdd}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
