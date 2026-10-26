/**
 * Tailwind CSS v3 Configuration for phryvos-k9.
 * Pinned to v3 for Termux/ARM64 compatibility - v4's native engine (lightningcss/oxide)
 * cannot dlopen on Android PRoot environments.
 *
 * Importers/callers: postcss.config.mjs (via @tailwindcss/postcss), app/globals.css
 * Affected API: PostCSS pipeline, CSS utility generation
 * Data schemas if any: CSS custom properties (--background, --foreground, etc.)
 * User instruction verbatim: "phryvos-k8 UI pins Tailwind v3 on Termux; v4's native engine can't run on-device"
 *
 * Phase 2: Extended semantic color tokens per DESIGN_SYSTEM.md
 */
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Phryvos-K9 WCAG AA Design Tokens */
        'bg-0': 'var(--bg-0)',
        'bg-1': 'var(--bg-1)',
        'bg-2': 'var(--bg-2)',
        'bg-3': 'var(--bg-3)',
        'bg-inset': 'var(--bg-inset)',
        'border-subtle': 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        'fg-0': 'var(--fg-0)',
        'fg-1': 'var(--fg-1)',
        'fg-2': 'var(--fg-2)',
        'fg-3': 'var(--fg-3)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        'accent-border': 'var(--accent-border)',
        'danger-soft': 'var(--danger-soft)',

        /* Core semantic colors (mapped to CSS custom properties) */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        /* Extended semantic tokens (Phase 2) */
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },

        /* Vault-specific states */
        vault: {
          locked: "hsl(var(--vault-locked))",
          unlocked: "hsl(var(--vault-unlocked))",
          decoy: "hsl(var(--vault-decoy))",
        },

        /* AI streaming states */
        ai: {
          thinking: "hsl(var(--ai-thinking))",
          streaming: "hsl(var(--ai-streaming))",
          approval: "hsl(var(--ai-approval))",
          error: "hsl(var(--ai-error))",
        },

        /* Code/Editor syntax (for future token-based theming) */
        code: {
          bg: "hsl(var(--code-bg))",
          fg: "hsl(var(--code-fg))",
          comment: "hsl(var(--code-comment))",
          keyword: "hsl(var(--code-keyword))",
          string: "hsl(var(--code-string))",
          number: "hsl(var(--code-number))",
        },

        /* Zinc scale (preserved for direct usage) */
        zinc: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      fontSize: {
        /* Density tier font sizes */
        "2xs": ["0.625rem", { lineHeight: "1.4" }],    /* 10px - compact */
        "xs": ["0.75rem", { lineHeight: "1.5" }],      /* 12px - compact */
        "sm": ["0.8125rem", { lineHeight: "1.5" }],    /* 13px - comfortable */
        "base": ["0.875rem", { lineHeight: "1.6" }],   /* 14px - comfortable */
        "lg": ["1rem", { lineHeight: "1.6" }],         /* 16px - spacious */
        "xl": ["1.125rem", { lineHeight: "1.6" }],     /* 18px - spacious */
      },
      spacing: {
        /* Density tier spacing */
        "18": "4.5rem",   /* 72px - spacious section */
        "22": "5.5rem",   /* 88px - spacious section */
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "zoom-in-95": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-from-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-to-left": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
        "slide-in-from-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-to-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "slide-up-from-bottom": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down-to-bottom": {
          from: { transform: "translateY(0)", opacity: "1" },
          to: { transform: "translateY(100%)", opacity: "0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.75" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "zoom-in-95": "zoom-in-95 0.15s ease-out",
        "slide-in-left": "slide-in-from-left 300ms ease-in-out",
        "slide-out-left": "slide-out-to-left 250ms ease-in-out",
        "slide-in-right": "slide-in-from-right 300ms ease-in-out",
        "slide-out-right": "slide-out-to-right 250ms ease-in-out",
        "slide-up": "slide-up-from-bottom 200ms ease-out",
        "slide-down": "slide-down-to-bottom 150ms ease-out",
        "pulse-soft": "pulse-soft 1.5s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
      },
      transitionDuration: {
        "0": "0ms",
        "50": "50ms",
        "75": "75ms",
        "100": "100ms",
        "150": "150ms",
        "200": "200ms",
        "250": "250ms",
        "300": "300ms",
        "350": "350ms",
        "400": "400ms",
        "500": "500ms",
        "700": "700ms",
        "1000": "1000ms",
      },
      transitionTimingFunction: {
        "ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
        "ease-out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      boxShadow: {
        "xs": "0 1px 2px 0 rgb(0 0 0 / 0.03)",
        "2xs": "0 1px 2px 0 rgb(0 0 0 / 0.02)",
        "inner-xs": "inset 0 1px 1px 0 rgb(0 0 0 / 0.03)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;