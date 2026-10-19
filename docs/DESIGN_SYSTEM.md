# Phryvos-k9 Design System Specification

**Version**: 1.0  
**Date**: 2026-10-16  
**Phase**: 1/52 (Design Principles & Visual Specification)  
**Status**: In Progress

---

## 1. Product Personality & Visual References

### 1.1 Core Identity

**Phryvos-k9** is a **frontier-grade AI-integrated personal operating system** — not a dashboard, not a chat wrapper. It combines:

- Zero-knowledge encrypted vault (AES-256-GCM envelope)
- Autonomous agent with 50+ tools
- Competitive exam preparation engine (JEE/BITSAT/GATE)
- Productivity suite (tasks, projects, goals, calendar)
- Knowledge graph with bi-directional wiki-links

### 1.2 Personality Traits

| Trait | Manifestation |
|-------|---------------|
| **Precise** | Every pixel serves a purpose; no decorative noise |
| **Composed** | Calm density; breathing room without emptiness |
| **Competent** | Professional tool aesthetics; trustworthy, not playful |
| **Restrained** | Motion only when it clarifies state; color only when it communicates |
| **Adaptive** | Respects user context: desktop focus, mobile efficiency, ARM64 constraints |

### 1.3 Visual References (Mental Models)

| Reference | What We Borrow | What We Avoid |
|-----------|----------------|---------------|
| **Linear** | Clean typography, restrained color, purposeful motion | Marketing gloss, unnecessary illustrations |
| **GitHub** | Density for power users, clear hierarchy, dark mode excellence | Feature bloat, inconsistent patterns |
| **Notion** | Block-based mental model, calm writing space | Heavy chrome, slow interactions |
| **VS Code** | Functional chrome, keyboard-first, extensible panels | Overwhelming default density |
| **Claude.ai** | Streaming response clarity, citation transparency | Conversational filler, unnecessary personality |

---

## 2. Information Hierarchy

### 2.1 Global Hierarchy (App Level)

```
Level 0: Vault Status (locked/unlocked) — persistent, non-dismissible
Level 1: Primary Navigation (7 routes) — persistent sidebar
Level 2: Active Context (current session, file, project) — route header
Level 3: Content Canvas (chat, editor, board, graph) — scrollable workspace
Level 4: Transient Overlays (palette, modals, drawers, toasts) — ephemeral
Level 5: System Feedback (toasts, approvals, streaming) — momentary
```

### 2.2 Route-Specific Hierarchies

| Route | Level 2 (Context) | Level 3 (Canvas) | Level 4 (Overlays) |
|-------|-------------------|------------------|-------------------|
| `/chat` | Session rail, provider/model, context gauge | Conversation stream + composer | Approval dialogs, artifact drawer, governance feed |
| `/vault` | File tree, search, trash | Monaco editor + version sidebar | New file/dir/rename modals, upload |
| `/tasks` | Filters, views (list/kanban/gantt) | Task list/board + detail panel | Task create/edit, dependency picker |
| `/exams` | Subject selector, progress summary | Topic DAG, study logs, FSRS cards | Trap questions, syllabus constellation |
| `/projects` | Project list, milestones | Kanban board / Gantt chart | Project create, milestone edit |
| `/goals` | Goal list, progress rings | Milestone timeline | Goal create, progress update |
| `/calendar` | Month/week/day selector | Event grid + task scheduling | Event create/edit, drag-resize |
| `/settings` | Category tabs | Form sections | Provider test, backup/restore modals |

---

## 3. Light/Dark Theme — Intended Appearance

### 3.1 Design Intent

**Light Mode**: Clean, paper-like, high contrast for reading long-form content (markdown, code, math). Warm zinc neutrals, not sterile blue-grays.

**Dark Mode**: True dark (zinc-950), not gray. Reduced eye strain for evening coding/study sessions. Emerald accent for "live/active" states (streaming, unlocked, connected).

### 3.2 Semantic Color Roles (Implemented)

| Role | Light (HSL) | Dark (HSL) | Usage |
|------|-------------|------------|-------|
| `--background` | 0 0% 100% | 240 10% 3.9% | Page bg, card bg |
| `--foreground` | 240 10% 3.9% | 0 0% 98% | Primary text |
| `--card` | 0 0% 100% | 240 10% 3.9% | Elevated surfaces |
| `--card-foreground` | 240 10% 3.9% | 0 0% 98% | Card text |
| `--popover` | 0 0% 100% | 240 10% 3.9% | Dialogs, dropdowns |
| `--primary` | 240 5.9% 10% | 0 0% 98% | Brand actions, active nav |
| `--primary-foreground` | 0 0% 98% | 240 5.9% 10% | On-primary text |
| `--secondary` | 240 4.8% 95.9% | 240 3.7% 15.9% | Subtle actions, hover |
| `--muted` | 240 4.8% 95.9% | 240 3.7% 15.9% | Disabled, placeholder |
| `--accent` | 240 4.8% 95.9% | 240 3.7% 15.9% | Highlights, focus rings |
| `--destructive` | 0 84.2% 60.2% | 0 62.8% 30.6% | Delete, errors, danger |
| `--border` | 240 5.9% 90% | 240 3.7% 15.9% | Dividers, input borders |
| `--ring` | 240 5.9% 10% | 240 4.9% 83.9% | Focus rings |

### 3.3 Extended Semantic Tokens (Implemented in Phase 2)

```css
/* Status colors */
--success: 142 76% 36%;           /* emerald-600 */
--success-foreground: 0 0% 98%;
--warning: 38 92% 50%;            /* amber-500 */
--warning-foreground: 0 0% 98%;
--info: 199 89% 48%;              /* sky-500 */
--info-foreground: 0 0% 98%;

/* Vault-specific */
--vault-locked: 0 84.2% 60.2%;    /* destructive */
--vault-unlocked: 142 76% 36%;    /* success */
--vault-decoy: 38 92% 50%;        /* warning */

/* AI streaming states */
--ai-thinking: 142 76% 36%;       /* emerald — active reasoning */
--ai-streaming: 142 76% 36%;      /* emerald — token streaming */
--ai-approval: 38 92% 50%;        /* amber — awaiting human */
--ai-error: 0 84.2% 60.2%;        /* destructive — provider error */

/* Code/Editor */
--code-bg: 240 10% 3.9%;          /* zinc-900 */
--code-fg: 0 0% 98%;              /* zinc-100 */
--code-comment: 240 5% 64.9%;     /* zinc-500 */
--code-keyword: 263 70% 60%;      /* violet */
--code-string: 142 76% 45%;       /* emerald */
--code-number: 38 92% 55%;        /* amber */
```

---

## 7. Content Density Rules

### 3.1 Design Intent

**Light Mode**: Clean, paper-like, high contrast for reading long-form content (markdown, code, math). Warm zinc neutrals, not sterile blue-grays.

**Dark Mode**: True dark (zinc-950), not gray. Reduced eye strain for evening coding/study sessions. Emerald accent for "live/active" states (streaming, unlocked, connected).

### 3.2 Semantic Color Roles (Current Implementation)

| Role | Light (HSL) | Dark (HSL) | Usage |
|------|-------------|------------|-------|
| `--background` | 0 0% 100% | 240 10% 3.9% | Page bg, card bg |
| `--foreground` | 240 10% 3.9% | 0 0% 98% | Primary text |
| `--card` | 0 0% 100% | 240 10% 3.9% | Elevated surfaces |
| `--card-foreground` | 240 10% 3.9% | 0 0% 98% | Card text |
| `--popover` | 0 0% 100% | 240 10% 3.9% | Dialogs, dropdowns |
| `--primary` | 240 5.9% 10% | 0 0% 98% | Brand actions, active nav |
| `--primary-foreground` | 0 0% 98% | 240 5.9% 10% | On-primary text |
| `--secondary` | 240 4.8% 95.9% | 240 3.7% 15.9% | Subtle actions, hover |
| `--muted` | 240 4.8% 95.9% | 240 3.7% 15.9% | Disabled, placeholder |
| `--accent` | 240 4.8% 95.9% | 240 3.7% 15.9% | Highlights, focus rings |
| `--destructive` | 0 84.2% 60.2% | 0 62.8% 30.6% | Delete, errors, danger |
| `--border` | 240 5.9% 90% | 240 3.7% 15.9% | Dividers, input borders |
| `--ring` | 240 5.9% 10% | 240 4.9% 83.9% | Focus rings |

### 3.3 Extended Semantic Tokens (To Add)

```css
/* Status colors — NOT in current tailwind config */
--success: 142 76% 36%;           /* emerald-600 */
--success-foreground: 0 0% 98%;
--warning: 38 92% 50%;            /* amber-500 */
--warning-foreground: 0 0% 98%;
--info: 199 89% 48%;              /* sky-500 */
--info-foreground: 0 0% 98%;

/* Vault-specific */
--vault-locked: 0 84.2% 60.2%;    /* destructive */
--vault-unlocked: 142 76% 36%;    /* success */
--vault-decoy: 38 92% 50%;        /* warning */

/* AI streaming states */
--ai-thinking: 142 76% 36%;       /* emerald — active reasoning */
--ai-streaming: 142 76% 36%;      /* emerald — token streaming */
--ai-approval: 38 92% 50%;        /* amber — awaiting human */
--ai-error: 0 84.2% 60.2%;        /* destructive — provider error */

/* Code/Editor */
--code-bg: 240 10% 3.9%;          /* zinc-900 */
--code-fg: 0 0% 98%;              /* zinc-100 */
--code-comment: 240 5% 64.9%;     /* zinc-500 */
--code-keyword: 263 70% 60%;      /* violet */
--code-string: 142 76% 45%;       /* emerald */
--code-number: 38 92% 55%;        /* amber */
```

---

## 7. Content Density Rules

### 4.1 Density Tiers

| Tier | Use Case | Padding | Gap | Font Size | Line Height |
|------|----------|---------|-----|-----------|-------------|
| **Compact** | Toolbars, status bars, dense lists | 4px / 8px | 4px | 11px / 12px | 1.4 |
| **Comfortable** | Default for all content areas | 12px / 16px | 8px / 12px | 13px / 14px | 1.6 |
| **Spacious** | Hero, empty states, onboarding | 24px / 32px | 16px / 24px | 16px / 18px | 1.7 |

### 4.2 Density by Route

| Route | Default Tier | Compact Areas | Spacious Areas |
|-------|--------------|---------------|----------------|
| `/chat` | Comfortable | Session rail, composer, token gauge | Hero welcome, message bubbles |
| `/vault` | Comfortable | Toolbar, tabs, status bar, file tree | Editor pane, version sidebar |
| `/tasks` | Comfortable | Filters, Kanban columns | Task detail, Gantt chart |
| `/exams` | Comfortable | Subject list, progress chips | DAG visualization, constellation |
| `/calendar` | Comfortable | Month grid, event chips | Day view, event detail |
| `/settings` | Comfortable | Category nav, form fields | — |

---

## 5. Interaction Philosophy

### 5.1 Core Principles

1. **Keyboard-First** — Every action accessible via keyboard; shortcuts discoverable (Ctrl+K palette)
2. **Direct Manipulation** — Drag-drop, inline edit, click-to-expand over modal forms
3. **Progressive Disclosure** — Show essentials; reveal complexity on demand (collapsible sections, "Advised" badges)
4. **Optimistic Feedback** — Immediate UI response; reconcile with server silently
5. **Reversible Actions** — Undo toasts for deletions, version history for edits, approval gates for destructive ops
6. **State Clarity** — Loading, empty, error, success states never ambiguous
7. **No Mystery Meat** — Icons always have labels or tooltips; hover/focus reveals intent

### 5.2 Interaction Patterns by Component Type

| Component | Primary Interaction | Secondary | Keyboard |
|-----------|--------------------|-----------|----------|
| Button | Click | Hover → focus ring | Enter/Space |
| Input | Type | Focus → ring, clear | Tab, Escape |
| Select | Click → pick | Search/filter | Arrow keys, Enter |
| Tree Nav | Click expand, click select | Drag-drop move | Arrow keys, Enter |
| Tabs | Click | Hover preview | Arrow keys |
| Modal | Focus trap | Escape dismiss | Tab cycle, Escape |
| Drawer | Swipe/click | Backdrop click | Escape |
| Toast | Auto-dismiss | Click action | — |
| Streaming | Auto-scroll (configurable) | Pause/stop | Escape to stop |

---

## 6. Motion Usage Rules

### 6.1 Motion Categories

| Category | Duration | Easing | Examples |
|----------|----------|--------|----------|
| **Instant** | 0ms | — | Button press, checkbox, selection |
| **Micro** | 100-150ms | `ease-out` | Hover, focus ring, tooltip, inline expand |
| **Short** | 150-250ms | `ease-out` | Popover, menu, drawer slide, tab switch |
| **Spatial** | 250-350ms | `ease-in-out` | Sidebar collapse, dialog, panel resize |
| **Content** | 200-300ms | `ease-out` | New message arrive, loading→success, approval appear |

### 6.2 Motion Constraints

- **Reduced Motion**: All animations respect `prefers-reduced-motion` → instant (0ms)
- **No Layout Shift**: Animations never cause reflow (transform/opacity only)
- **No Decorative Motion**: No bouncing, pulsing, floating unless communicating state (streaming pulse, approval pulse)
- **No Blocking**: Motion never delays critical actions (submit, save, lock)
- **Cleanup**: All transitions cancel on unmount; no orphaned animations

### 6.3 Specific Motion Specs

| Element | Enter | Exit | State Change |
|---------|-------|------|--------------|
| Command Palette | Fade + scale(0.95→1) 150ms | Fade + scale(1→0.95) 100ms | — |
| Mobile Drawer | Slide X(-100%→0) 300ms | Slide X(0→-100%) 250ms | — |
| Sidebar Collapse | Width transition 300ms | Width transition 300ms | Icon crossfade 150ms |
| Toast | Slide Y(100%→0) + fade 200ms | Fade + slide Y(0→-50%) 150ms | — |
| Approval Dialog | Fade + zoom(0.95→1) 200ms | Fade + zoom(1→0.95) 150ms | Pulse amber while pending |
| Streaming Token | None (batched) | — | Thinking pulse (emerald, 1.5s) |
| Version Restore | Crossfade 150ms | — | — |

---

## 7. Component Inventory (Current vs Required)

### 7.1 Existing Primitives (`components/ui/`)

| Component | File | Status | Gaps |
|-----------|------|--------|------|
| Button | `button.tsx` | ✅ Basic | Variants, sizes, loading, icon-only |
| Input | `input.tsx` | ✅ Basic | Label, error, helper, prefix/suffix |
| Label | `label.tsx` | ✅ Basic | — |

### 7.2 Required Primitives (Phase 6)

| Component | Priority | Spec Reference |
|-----------|----------|----------------|
| **Textarea** | High | Composer, vault editor fallback |
| **Select** | High | Provider/model picker, filters |
| **Checkbox** | High | Task lists, settings toggles |
| **RadioGroup** | Medium | View mode selectors |
| **Switch** | High | Settings toggles (auto-lock, memory) |
| **Slider** | Medium | Effort level, zoom, scrubber |
| **Badge** | High | Status chips, version tags, mode pills |
| **Avatar** | Low | User, provider icons |
| **Tooltip** | High | Icon-only buttons, truncated text |
| **Popover** | High | Context menus, date pickers |
| **DropdownMenu** | High | Message actions, file actions, nav |
| **Dialog** | High | Confirmations, forms, settings |
| **Drawer** | High | Mobile nav, artifact drawer, approvals |
| **Tabs** | High | Exam views, settings categories |
| **Separator** | Medium | Visual grouping |
| **Skeleton** | High | Loading states for lists, trees, messages |
| **Toast** | High | Notifications, undo, save confirmation |
| **Progress** | Medium | Upload, compaction, streaming gauge |
| **EmptyState** | High | No sessions, no files, no results |
| **ErrorState** | High | Vault locked, provider down, sync fail |
| **LoadingState** | High | Skeleton + spinner combos |
| **ConfirmationDialog** | High | Delete, lock, destructive actions |

### 7.3 Composite Components (Existing)

| Component | File | Route | Status |
|-----------|------|-------|--------|
| AppShell | `AppShell.tsx` | All | ✅ Complete |
| CommandPalette | `CommandPalette.tsx` | All | ✅ Complete |
| TimeTravelScrubber | `TimeTravelScrubber.tsx` | All | ✅ Complete |
| ThemeToggle | `ThemeToggle.tsx` | All | ✅ Complete |
| ChatApp | `ChatApp.tsx` | `/chat` | ✅ Feature-complete |
| FilesApp | `FilesApp.tsx` | `/vault` | ✅ Feature-complete |
| ExamsApp | `ExamsApp.tsx` | `/exams` | ✅ Feature-complete |

---

## 8. Accessibility Baseline (WCAG 2.2 AA)

### 8.1 Non-Negotiable Requirements

- **Color Contrast**: 4.5:1 normal text, 3:1 large text/UI components
- **Focus Visible**: 2px solid ring, offset 2px, high contrast (`--ring`)
- **Keyboard Navigation**: Tab order logical; no keyboard traps
- **ARIA**: Labels on all icon buttons; roles on composites (dialog, menu, tree)
- **Reduced Motion**: `prefers-reduced-motion` honored globally
- **Zoom**: Functional at 200% browser zoom; no horizontal scroll
- **Screen Reader**: Live regions for streaming, toasts, approvals

### 8.2 Current Gaps (from audit)

- [ ] `components/ui/` primitives need ARIA attributes
- [ ] CommandPalette needs `role="dialog"` + `aria-modal`
- [ ] File tree needs `role="tree"` + `aria-expanded`
- [ ] Chat streaming needs `aria-live="polite"` region
- [ ] Approval dialog needs `role="alertdialog"`
- [ ] Monaco editor needs accessible fallback

---

## 9. Implementation Phases (This Document Covers Phase 1)

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **1** | Design Principles & Visual Specification | ✅ Complete |
| **2** | Color System & Semantic Tokens | ✅ Complete (tailwind.config.ts + globals.css) |
| **3** | Typography Architecture | 🟢 **In Progress** |
| **4** | Spacing, Sizing & Geometry | ⏳ |
| **5** | Interaction State System | ⏳ |
| **6** | Core Component Library (Primitives) | ⏳ |
| **7** | Component Showcase (Storybook) | ⏳ |

---

## 10. Acceptance Criteria for Phase 1

- [ ] Design principles documented and approved
- [ ] Visual references and anti-patterns clearly defined
- [ ] Information hierarchy mapped for all 8 routes
- [ ] Light/dark theme intent specified with semantic roles
- [ ] Content density rules defined per route
- [ ] Interaction philosophy codified with patterns
- [ ] Motion rules specified with durations/easings
- [ ] Component inventory complete with gaps identified
- [ ] Accessibility baseline established

---

*End of Phase 1 Specification — Ready for Phase 2 (Color System & Semantic Tokens)*