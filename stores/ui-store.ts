"use client";

import { create } from "zustand";

/**
 * Ephemeral UI Zustand Store
 * Strict Security Invariant: Never store cryptographic keys, tokens, or decrypted file contents here.
 * Strictly used for layout dimensions, dock states, and modal visibility.
 */
export interface UiState {
  contextPaneWidth: number;
  setContextPaneWidth: (width: number) => void;
  aiDockOpen: boolean;
  toggleAiDock: () => void;
  setAiDockOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  isTabBlurred: boolean;
  setIsTabBlurred: (blurred: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  contextPaneWidth: 280,
  setContextPaneWidth: (width) =>
    set({ contextPaneWidth: Math.min(Math.max(width, 240), 360) }),
  aiDockOpen: false,
  toggleAiDock: () => set((state) => ({ aiDockOpen: !state.aiDockOpen })),
  setAiDockOpen: (open) => set({ aiDockOpen: open }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  isTabBlurred: false,
  setIsTabBlurred: (blurred) => set({ isTabBlurred: blurred }),
}));
