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
    version: "2.5.9",
    date: "Nov 26, 2026",
    title: "Unified desktop chrome · agent picker · clearer approvals",
    summary:
      "One dark surface from title bar to chat, window controls in the app, pick OpenCode or Claude from the composer, and approvals that stay visible when an agent needs you.",
    highlight:
      "Frameless Linux title bar with minimize / maximize / close on the same background as the rest of the workspace",
    sections: [
      {
        heading: "What’s new for you",
        bullets: [
          "Window looks like one piece: same background from the top strip through chat and sidebar",
          "Close, minimize, and maximize sit in the app header (Linux) — no separate system title color strip",
          "Composer runtime menu: choose OpenCode, Claude Code, Codex, and other local agents for chat work",
          "When an agent asks for permission or options, a sticky bar appears above the composer so you never miss it",
          "Voice capture and Paper Orchestra screens updated to the same card / border language as the rest of the app",
          "Projects hub and menus use a proper pointer cursor on actions",
        ],
      },
      {
        heading: "Stability",
        bullets: [
          "Fixed a white-screen crash on startup caused by an experimental UI package loading too early",
          "Permission and question prompts stay in chat — nothing is auto-approved",
        ],
      },
    ],
    cta: { label: "Download 2.5.9", to: "/download" },
  },
  {
    version: "2.5.3",
    date: "Nov 23, 2026",
    title: "Desktop UX overhaul · native window integration · chat experience",
    summary:
      "Comprehensive desktop experience upgrade with ChatGPT-style empty state, native title bar controls, unified design system, and performance optimizations. Local-first AI app with ChatGPT Desktop-level interaction discipline.",
    highlight:
      "New ChatGPT desktop-style empty chat with welcome state, suggested actions, and smooth first-message transition",
    sections: [
      {
        heading: "Highlights",
        bullets: [
          "ChatGPT desktop-style empty chat: 'Ready when you are.' heading, composer, and 4 suggested actions (Summarize, Analyze, Start project, Search library)",
          "First-message transition: welcome state fades out, composer repositions, messages reveal progressively",
          "Native window integration: platform-specific title bars (Windows hidden + overlay, macOS hiddenInset, Linux frameless/safe mode)",
          "Unified dark design system: consistent background (#171717), sidebar, header, composer (#353535), active (#303030), primary text (#F5F5F5), secondary (#999999)",
          "PermissionPill in header: one-click access to approve any OpenCode permission requests globally",
          "Notebook lag fix: restructured ResearchProjectContext initialization to avoid blocking UI during load",
          "New chat behavior: creates empty conversation with proper routing to ChatHome welcome state",
          "All prior fixes maintained: VoiceDock crash, duplicate mic, PDF display, device independence",
        ],
      },
      {
        heading: "PermissionPill — Global Approval Access",
        bullets: [
          "Persistent amber badge in header shows pending OpenCode permission requests",
          "Clickable to open approvals drawer with task/question details",
          "Debounced check (250ms) for performance — no flicker on every render",
          "Keyboard accessible (Enter/Space to open)",
          "Jumps to the active task drawer when a pending request is found",
        ],
      },
      {
        heading: "Notebook Performance Fix",
        bullets: [
          "Reduced initialization blocking: `setLoading(false)` now triggers after project loads, not after all async operations",
          "No more whole-app lag when opening Notebook — UI becomes interactive progressively",
          "Skeleton loading state allows browsing while project data fetches in background",
          "Fixed ResearchProjectContext useEffect to avoid blocking UI chain of initResearchDesktop → refreshProjects → listResearchProjects → loadActive",
        ],
      },
      {
        heading: "Design System & Appearance",
        bullets: [
          "APP_SHELL_BG: #1f1f1f → #171717 (matches dark palette throughout)",
          "Background: #171717 | Sidebar: #171717 | Header: #171717",
          "Elevated surface: #202020 | Composer: #353535 | Hover: #292929",
          "Active: #303030 | Primary text: #F5F5F5 | Secondary text: #999999",
          "Border: #303030 | All tokens consistent across light/dark modes",
        ],
      },
    ],
    cta: { label: "Download 2.5.3", to: "/download" },
  },
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
