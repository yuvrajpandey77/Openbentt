import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useChat } from "@/context/ChatContext";
import { extractTexFromAssistantReply } from "@/lib/extractTexFromAssistantReply";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";

type CompareUseInNotebookProps = {
  model: string;
  content: string;
  disabled?: boolean;
};

export function CompareUseInNotebook({ model, content, disabled }: CompareUseInNotebookProps) {
  const { project, setDraftTex, recordModelAttribution } = useResearchProject();
  const { requestNotebookLatexInsert } = useChat();
  const navigate = useNavigate();
  const { toast } = useToast();

  const useInNotebook = () => {
    const tex = extractTexFromAssistantReply(content) || content;
    if (project) {
      const merged = project.draftTex.includes("\\end{document}")
        ? project.draftTex.replace(
            /\\end\{document\}/,
            `% --- ${model} ---\n${tex}\n\\end{document}`
          )
        : project.draftTex + "\n\n" + tex;
      void setDraftTex(merged);
      void recordModelAttribution(model, "comparison merge");
    } else {
      requestNotebookLatexInsert(tex, { autoCompile: false });
    }
    navigate("/notebook");
    toast({ title: "Inserted in Notebook", description: `Section from ${model}` });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 text-[10px] px-2"
      disabled={disabled || !content.trim()}
      onClick={useInNotebook}
    >
      Use in Notebook
    </Button>
  );
}
