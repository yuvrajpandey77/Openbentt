# PHASE 9 CHAT UX — Unified Chat Surface

## 1. One Chat Implementation

**Rule**: Single `ChatMessages` + `ChatInput` + `HomeChatArea` shared by all contexts.

| Context | Route | Workspace Meta | System Assist |
|---------|-------|----------------|---------------|
| Global Chat | `/chat` | none | — |
| Project Chat | `/projects` (split) | Project title | Project scope |
| Library Chat | `/labs` (split) | "Research library" | Corpus RAG |
| Notebook | `/notebook` (tabs) | "Notebook" | LaTeX-driven |
| Document | (future) | Document name | Document RAG |

All reuse: message renderer, composer, model picker, streaming, tool activity, attachments, actions.

## 2. Chat Home (`src/components/ChatHome.tsx`)

- **Value statement**: "Work with your knowledge, models, and projects in one place."
- **Local AI status**: Shows `friendlyModelLabel(defaultModel)` when ready
- **Suggestions** (real actions → `queuePromptInComposer`):
  - "Summarize a document"
  - "Analyze this idea"
  - "Start a research project"
  - "Search connected knowledge"
  - "Help me build something"
  - "Compare local models"
- Keyboard hint: `Enter` send, `Shift+Enter` newline

## 3. Composer (`ChatInput` — existing, enhanced)

### Keyboard
| Key | Action |
|-----|--------|
| `Enter` | Send |
| `Shift+Enter` | Newline |
| `Escape` | Stop generation / close transient UI |

### Controls (left → right)
1. Attachments (files, images, PDFs)
2. ModelPicker (global default)
3. Tools / Context (Research, Sources, Agents)
4. Project/Document context chip (when applicable)
5. Send / Stop (loading state)

### Edge Cases Handled
- Empty/whitespace → disabled
- Giant paste → truncation warning
- Double submit → guard
- Send during model switch → uses current config
- Provider failure → recovery options (retry, switch model, settings)

## 4. Message Rendering (`ChatMessages` + `AssistantContent`)

### Supported
- User / Assistant / System
- Streaming tokens (raf-batched)
- Markdown + GFM (tables, strikethrough, task lists)
- Code blocks (copy, language badge)
- Attachments (images, PDFs with extracted text)
- Tool activity (compact: "Searching… Found 8 sources")
- Citations / Sources
- Artifacts (apply to notebook, etc.)
- Errors (user-facing, not raw)
- Cancelled / Regeneration

### Performance
- Virtualization for >100 messages (existing `VirtualList`)
- Memoized message components
- Streaming uses `requestAnimationFrame` batching

## 5. Model Picker in Header (`AppChromeHeader` → `ModelPicker`)

- Always visible when chat can send
- Shows: `Qwen3 1.7B · Local` or `gpt-4o · Cloud`
- Dropdown: Local models (with running indicator) + Current cloud model
- Scope: Global default (project/conversation override in Settings)

## 6. Tool Activity UX

```
Searching connected knowledge…
Found 8 sources.

Preparing action…
Waiting for confirmation.
```

- Compact, non-blocking
- Links to source details where applicable
- Phase 8 approval cards unchanged (security boundary intact)

## 7. Action Confirmation (Phase 8 Preserved)

```
┌─────────────────────────────────────┐
│ Send email                          │
├─────────────────────────────────────┤
│ To: team@example.com                │
│ Subject: Research update            │
│ Body: …                             │
├─────────────────────────────────────┤
│ [Cancel]                    [Approve]│
└─────────────────────────────────────┘
```

- Exact action data shown
- High-risk = stronger visual (destructive styling)
- Never auto-executes; always proposal → confirm → execute → verify → audit

## 8. Agent Mode (Phase 6 Preserved)

- Controlled runtime: `runAgent` → tool loop → approval gates
- UI: "Tools / Mode" dropdown (Research, Executive, Marketing, Engineering, Operations)
- No autonomous agents, no swarms, no background destructive actions

## 9. Context Indicators

| Context | Chip |
|---------|------|
| Project | `Project: ResearchBench ×` |
| Document | `Document: paper.pdf ×` |
| Library | `Library: 12 papers ×` |

Click `×` to clear context.

## 10. Empty States

| Surface | State | Guidance |
|---------|-------|----------|
| Chat | No messages | `ChatHome` with suggestions |
| Chat | No provider | Redirect to `/setup` (or local AI usable) |
| Projects | No projects | "Create your first project" → `NewProjectDialog` |
| Library | No papers | "Add papers to start research" |
| Settings | No API key | "Add a provider to enable chat" |

## 11. Navigation Edge Cases

| Case | Handling |
|------|----------|
| Deleted chat | Redirect to `/chat` (new chat) |
| Deleted project | Redirect to `/projects` |
| Invalid route | `NotFound` → redirect to `/chat` |
| Generation in progress | Stop generation on navigation |
| Deep link `/chat/:id` | Restore chat, scroll to bottom |

## 12. Window Size QA

| Size | Verified |
|------|----------|
| 1366×768 | ✅ Composer visible, sidebar fits |
| 1440×900 | ✅ |
| 1920×1080 | ✅ |
| 2560×1440 | ✅ |
| Min 900×600 | ✅ No clipping |

## 13. Visual Design Tokens

| Token | Value |
|-------|-------|
| Background | `#0D0F10` (near black) |
| Card | `#16191C` |
| Border | `#24292D` |
| Primary | `#A3C987` (green) |
| Muted | `#495056` |
| Foreground | `#E8F1F6` |
| Muted foreground | `#96A0AB` |

- Radius: `0.5rem` (8px) base, `0.75rem` cards
- Shadows: Subtle, elevation-based
- Focus: `outline-none ring-2 ring-primary ring-offset-2 ring-offset-background`
- Transitions: `150ms ease-out` standard