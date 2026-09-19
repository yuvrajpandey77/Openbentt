# PHASE 9.5 CHAT UX AUDIT

Date: 2026-09-17

## Current Chat UX State (Post Phase 9)

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px) │ Main Workspace                                │
│                 │ ┌─────────────────────────────────────────┐   │
│  Search         │ │ AppChromeHeader                          │   │
│  New Chat       │ │ [Chat badge] [ModelPicker] [Share] [Info] │   │
│  Chat           │ └─────────────────────────────────────────┘   │
│  Projects       │ ┌─────────────────────────────────────────┐   │
│  Library        │ │                                          │   │
│  Notebook       │ │          ChatHome / ChatMessages         │   │
│  ─────────      │ │                                          │   │
│  Benchmark      │ │                                          │   │
│  Providers      │ │                                          │   │
│  Settings       │ └─────────────────────────────────────────┘   │
│  ─────────      │ ┌─────────────────────────────────────────┐   │
│  Recent chats   │ │ ChatInput (Composer)                     │   │
│  ─────────      │ │ [Attach] [ModelPicker] [Tools] [Send]    │   │
│  Local AI status│ └─────────────────────────────────────────┘   │
│  Account        │                                               │
└─────────────────┴───────────────────────────────────────────────┘
```

### Current Issues Identified

#### 1. Model State Inconsistency (FIXED in 9.5)
- **Before**: Sidebar showed `LocalAIContext.defaultModel` (auto-selected Ollama) while ModelPicker showed `ChatContext.apiConfig.model` (actual configured)
- **After**: Both use unified `effectiveModel` derived from `apiConfig` with fallback to local AI default

#### 2. Visual Hierarchy Weaknesses
- **Sidebar**: All nav items at same visual weight; "Search" and "New Chat" should be primary actions
- **Header**: ModelPicker and Share button compete for attention; model should be more prominent
- **Chat area**: Empty state (`ChatHome`) uses card layout that feels disconnected from composer
- **Composer**: Tool buttons (attach, model, tools) are cramped; model selector duplicated in header

#### 3. Density & Spacing Inconsistencies
- Sidebar: 4px gap between nav items, but 16px before "Recent" section
- Chat messages: Variable padding depending on message type
- Composer: 12px gap between controls but 24px vertical padding
- Settings: Card padding varies (some 16px, some 24px)

#### 4. Empty State (`ChatHome`)
- Logo + value prop + 6 suggestion buttons in 2-column grid
- Feels like a landing page, not a conversation starter
- Suggestions are generic, not contextual
- Large vertical gap before composer

#### 5. Composer UX
- Model picker appears twice (header + composer) — confusing
- Tool buttons (attach, research, agent) lack clear affordance
- Send button doesn't change to "Stop" during generation (handled but not visually obvious)
- No clear visual feedback for "model unavailable" state

#### 6. Message Rendering
- User messages: Right-aligned, subtle background
- Assistant messages: Left-aligned, full width
- No clear visual distinction between streaming and complete
- Tool activity appears inline but without clear boundaries
- Code blocks have copy button but no language label visible on hover

#### 7. Error Handling
- Provider errors show raw error text from API (e.g., "This model is unavailable for free...")
- No structured error card with actions (Retry, Choose Model, Settings)
- Errors appear as toast + inline, no consistent pattern

#### 8. Sidebar Specific Issues
- "Search" and "New Chat" look like nav items but are actions
- Recent chats: No timestamps, no message preview
- No context menu on chat items (rename, delete, pin)
- Local AI status: Compact but cryptic ("Qwen3 0.6B" — is it active? available? preferred?)

#### 9. Responsive Issues
- < 1200px: Sidebar collapses but tooltips don't always show
- < 900px: Header model picker truncates aggressively
- Mobile: ChatHome grid becomes single column but buttons too tall

## Project Workspace as Design Reference

The `/projects` page (`ProjectsHubPage`) has stronger information architecture:

### What Works Well There
1. **Clear section hierarchy**: Header → Search/Filter → Content grid → Footer actions
2. **Consistent card treatment**: Project cards have uniform padding, hover state, action menu
3. **Strong visual grouping**: "New Project" button is prominent; filters are grouped
4. **Information density**: Project list shows title, updated time, status badges without clutter
5. **Contextual toolbar**: When project selected, shows relevant actions without mode switch
5. **Empty state**: "No projects yet" with single primary action button

### Principles to Extract
| Principle | Application to Chat |
|-----------|---------------------|
| Primary action prominent | "New Chat" should be most visible action in sidebar |
| Section grouping | Group sidebar: Primary (Chat, Projects, Library) / Secondary (Notebook, Benchmark) / Utility (Providers, Settings) |
| Consistent card density | Message bubbles, recent chats, model list items should share padding/radius |
| Contextual actions | On hover/focus show actions (retry, copy, regenerate) not permanent toolbar |
| Status as metadata | Model/provider status as badges/chips, not separate sections |
| Empty state = action | Empty chat → single "Start conversation" or contextual suggestions |

## Recommended Changes (Priority Order)

### P0 — Model State (DONE in 9.5)
- [x] Unified `effectiveModel` in `LocalAIContext`
- [x] Sidebar `LocalAIStatus` uses `effectiveModel`
- [x] Settings `LocalAICard` uses `effectiveModel` for "In use"
- [x] `ModelPicker` already correct

### P1 — Sidebar Visual Hierarchy
- [ ] Restructure sidebar into 3 groups: Primary / Workspace / Utility
- [ ] "Search" and "New Chat" as action buttons, not nav items
- [ ] Recent chats: Add timestamp, preview, context menu
- [ ] Local AI status: Show `effectiveModel.displayName + location badge`
- [ ] Selected state: Subtle background + left accent border (not full highlight)

### P2 — Chat Header
- [ ] Remove duplicate ModelPicker from header (keep in composer only)
- [ ] Show effective model as badge next to "Chat" title
- [ ] Move Share to overflow/menu
- [ ] Provider status dot (green/amber/red) in header

### P3 — Composer Redesign
- [ ] Single model picker (in composer, not header)
- [ ] Group controls: [Attach] [Model▼] [Tools▼] [Send/Stop]
- [ ] Send button → Stop during generation (visual state change)
- [ ] Model unavailable: Show inline error chip with "Choose model" action

### P4 — ChatHome Empty State
- [ ] Reduce vertical padding, integrate with composer
- [ ] Show 3-4 contextual suggestions (not 6 generic)
- [ ] Suggestions based on available context (documents, projects, local models)
- [ ] Subtle prompt: "Ask anything, or try: Summarize a document..."

### P5 — Message UX
- [ ] Streaming indicator: Subtle pulse on assistant avatar
- [ ] Tool activity: Collapsible inline block with clear boundary
- [ ] Error messages: Structured card with [Retry] [Choose Model] actions
- [ ] Regenerate: Only show on assistant messages, subtle icon

### P6 — Settings Consistency
- [ ] Apply Project card density to Settings cards
- [ ] Local AI card: Show effective model prominently at top
- [ ] Provider cards: Consistent layout (icon, name, status, action)

## Visual Token Audit Needed

| Token | Current | Target |
|-------|---------|--------|
| Sidebar nav gap | 4px | 8px (actions), 4px (nav) |
| Section header gap | 16px | 24px before, 8px after |
| Card padding | 16-24px inconsistent | 16px uniform |
| Border radius | 8px, 12px, 16px mixed | 8px (sm), 12px (md), 16px (lg) |
| Focus ring | 2px primary | 2px primary, 2px offset |
| Transition | 150ms, 200ms, 300ms mixed | 150ms (fast), 200ms (normal) |

## Acceptance Criteria for Chat UX

- [ ] Sidebar + Header + Composer feel like one unified bar
- [ ] Model shown in sidebar = model in header = model in composer = model used for generation
- [ ] Empty chat invites action without feeling like a landing page
- [ ] Streaming, complete, error states visually distinct
- [ ] No duplicate controls (model picker appears once)
- [ ] Responsive down to 900px without horizontal scroll
- [ ] Keyboard accessible: Tab through all controls, Escape closes popovers