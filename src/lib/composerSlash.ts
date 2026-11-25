import { loadAllSnippets, type PromptSnippet } from "@/lib/promptSnippets";

export type SlashItem = {
  id: string;
  command: string;
  title: string;
  description: string;
  body: string;
  icon?: "file" | "hash" | "quote" | "sparkles";
};

const NOTEBOOK_SLASH: SlashItem[] = [
  {
    id: "nb-abstract",
    command: "abstract",
    title: "abstract",
    description: "Draft abstract variants from the current paper.",
    body: "Write 2–3 abstract variants for this paper based on the draft and library context. Keep each under 200 words.",
    icon: "file",
  },
  {
    id: "nb-keywords",
    command: "keywords",
    title: "keywords",
    description: "Suggest keywords grounded in the draft.",
    body: "Suggest 8–12 keywords for this paper based on the draft. Return a comma-separated list.",
    icon: "hash",
  },
  {
    id: "nb-cite",
    command: "cite",
    title: "cite",
    description: "Propose citations from the library / bibliography.",
    body: "Suggest which claims in the draft need citations and propose \\cite keys from the connected bibliography. Do not invent keys.",
    icon: "quote",
  },
];

function snippetToItem(s: PromptSnippet): SlashItem {
  const command =
    s.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "snippet";
  return {
    id: s.id,
    command,
    title: command,
    description: s.title,
    body: s.body,
    icon: "sparkles",
  };
}

export function getSlashQuery(text: string): string | null {
  const m = text.match(/(?:^|\s)\/([^\s]*)$/);
  return m ? m[1] ?? "" : null;
}

export function buildSlashItems(opts: { notebook?: boolean }): SlashItem[] {
  const snippets = loadAllSnippets().map(snippetToItem);
  return opts.notebook ? [...NOTEBOOK_SLASH, ...snippets] : snippets;
}

/** Replace the trailing `/query` token with the command body. */
export function applySlashPick(text: string, body: string): string {
  const replaced = text.replace(/(^|\s)\/[^\s]*$/, "$1").trimEnd();
  if (!replaced) return body;
  return `${replaced}\n\n${body}`;
}
