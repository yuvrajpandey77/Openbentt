/**
 * Marketing release notes shown on /news and linked from the landing News strip.
 * Keep in sync with docs/releases/v*.md and CHANGELOG.md.
 */

export type ReleaseNoteSection = {
  heading: string;
  bullets: string[];
};

export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlight?: string;
  sections: ReleaseNoteSection[];
  cta?: { label: string; to: string };
};

export const releaseNotes: ReleaseNote[] = [
  {
    version: "2.5.0",
    date: "Nov 22, 2026",
    title: "Prism migration · multi-agent desktop · one-click import",
    summary:
      "Final Openbentt release focused on replacing OpenAI Prism before its shutdown, with ZIP/folder import, PATH-detected AI agents beyond OpenCode, stronger Settings updates, and Bombadil browser QA.",
    highlight: "Switch from OpenAI Prism before ~1 Jan — import your ZIP in one click.",
    sections: [
      {
        heading: "Highlights",
        bullets: [
          "One-click import from Overleaf / Prism ZIP, Codex/Cursor folders, or raw .tex / .bib (Zotero still available).",
          "Auto-detect OpenCode, Claude Code, Codex CLI, Cursor Agent, Aider, and Gemini CLI on PATH — prefer any agent in Settings → Agents.",
          "Desktop updates card on Settings: check → download → restart & install via electron-updater.",
          "Bombadil property-based browser QA in the release gate (caught a Settings Integrations crash before ship).",
          "Hybrid RAG and compile cascade hardening for large local corpora.",
        ],
      },
      {
        heading: "Migrating from OpenAI Prism",
        bullets: [
          "Export your Prism (or Overleaf) project as a ZIP, or copy the project folder.",
          "Open Openbentt → Projects → New → Import → ZIP or folder.",
          "Compile with the BusyTeX → local TeX → HTTP → text PDF cascade.",
          "Keep citations in .bib or connect Zotero under Notebook Tools.",
        ],
      },
    ],
    cta: { label: "Download 2.5.0", to: "/download" },
  },
  {
    version: "2.4.6",
    date: "Sep 2026",
    title: "Production hardening",
    summary: "Stability and packaging polish for desktop installers and auto-update metadata.",
    sections: [
      {
        heading: "Notes",
        bullets: [
          "Installer and download asset version alignment.",
          "Continued Linux GPU / Wayland safe-mode improvements from the 2.4.x line.",
        ],
      },
    ],
    cta: { label: "Download", to: "/download" },
  },
];

export const latestReleaseNote = releaseNotes[0];
