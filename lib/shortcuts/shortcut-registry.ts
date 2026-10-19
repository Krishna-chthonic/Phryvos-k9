/**
 * Centralized Keyboard Shortcut Registry (Phase 12)
 *
 * Importers/callers: components/shell/ShortcutsModal.tsx, components/shell/AppShell.tsx, components/shell/CommandPalette.tsx
 * Affected API: Centralized shortcut listener and help dialog
 * Data schemas: ShortcutDefinition interface
 * User instruction verbatim: "continue"
 */

export type ShortcutCategory = "Navigation" | "Vault & Editor" | "AI & Chat" | "System & Security";

export interface ShortcutDefinition {
  id: string;
  label: string;
  description: string;
  category: ShortcutCategory;
  keys: string[]; // e.g. ["Mod", "k"], ["Mod", "Shift", "l"], ["?"]
  disabledInInputs?: boolean;
}

/**
 * Check if current platform is macOS
 */
export function isMacOS(): boolean {
  if (typeof window === "undefined" || !window.navigator) return false;
  return /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
}

/**
 * Format key combination for human-readable display on Mac vs Windows/Linux
 */
export function formatShortcutKey(key: string, isMac: boolean): string {
  const lower = key.toLowerCase();
  if (lower === "mod" || lower === "cmd" || lower === "ctrl") {
    return isMac ? "⌘" : "Ctrl";
  }
  if (lower === "shift") {
    return isMac ? "⇧" : "Shift";
  }
  if (lower === "alt" || lower === "opt") {
    return isMac ? "⌥" : "Alt";
  }
  if (lower === "enter" || lower === "return") {
    return "↵";
  }
  if (lower === "escape" || lower === "esc") {
    return "Esc";
  }
  return key.toUpperCase();
}

export function formatShortcut(keys: string[], isMac: boolean): string {
  return keys.map((k) => formatShortcutKey(k, isMac)).join(isMac ? "" : " + ");
}

/**
 * Master catalog of application keyboard shortcuts
 */
export const GLOBAL_SHORTCUTS: ShortcutDefinition[] = [
  // Navigation
  {
    id: "nav-palette",
    label: "Command Palette",
    description: "Global spotlight search and instant action dispatch",
    category: "Navigation",
    keys: ["Mod", "k"],
    disabledInInputs: false,
  },
  {
    id: "nav-sidebar",
    label: "Toggle Sidebar",
    description: "Collapse or expand left navigation panel",
    category: "Navigation",
    keys: ["Mod", "b"],
    disabledInInputs: false,
  },
  {
    id: "nav-chat",
    label: "Go to Chat",
    description: "Jump to AI co-pilot conversation view",
    category: "Navigation",
    keys: ["g", "c"],
    disabledInInputs: true,
  },
  {
    id: "nav-vault",
    label: "Go to Vault",
    description: "Open encrypted files and Monaco editor",
    category: "Navigation",
    keys: ["g", "v"],
    disabledInInputs: true,
  },
  {
    id: "nav-tasks",
    label: "Go to Tasks",
    description: "Jump to daily tasks and schedule",
    category: "Navigation",
    keys: ["g", "t"],
    disabledInInputs: true,
  },
  {
    id: "nav-exams",
    label: "Go to Exams",
    description: "Jump to exam prep and syllabus tracker",
    category: "Navigation",
    keys: ["g", "e"],
    disabledInInputs: true,
  },
  {
    id: "nav-projects",
    label: "Go to Projects",
    description: "Open project boards and kanban",
    category: "Navigation",
    keys: ["g", "p"],
    disabledInInputs: true,
  },
  {
    id: "nav-calendar",
    label: "Go to Calendar",
    description: "View weekly schedule and deadlines",
    category: "Navigation",
    keys: ["g", "l"],
    disabledInInputs: true,
  },
  {
    id: "nav-settings",
    label: "Go to Settings",
    description: "Configure AI providers, theme, and security",
    category: "Navigation",
    keys: ["g", "s"],
    disabledInInputs: true,
  },

  // Vault & Editor
  {
    id: "vault-save",
    label: "Save File",
    description: "Save active document to encrypted vault",
    category: "Vault & Editor",
    keys: ["Mod", "s"],
    disabledInInputs: false,
  },
  {
    id: "vault-scratchpad",
    label: "Daily Scratchpad",
    description: "Open or create today's encrypted study notes",
    category: "Vault & Editor",
    keys: ["Mod", "d"],
    disabledInInputs: true,
  },

  // AI & Chat
  {
    id: "chat-submit",
    label: "Send Message",
    description: "Send prompt to active AI reasoning model",
    category: "AI & Chat",
    keys: ["Mod", "Enter"],
    disabledInInputs: false,
  },

  // System & Security
  {
    id: "sys-lock",
    label: "Instant Vault Lock",
    description: "Purge master encryption key from RAM and redirect to unlock",
    category: "System & Security",
    keys: ["Mod", "Shift", "l"],
    disabledInInputs: false,
  },
  {
    id: "sys-shortcuts",
    label: "Keyboard Shortcuts",
    description: "Display this keyboard shortcut cheat sheet",
    category: "System & Security",
    keys: ["?"],
    disabledInInputs: true,
  },
];
