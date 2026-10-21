/**
 * Settings page for phryvos-k9.
 *
 * Importers/callers: Next.js App Router (/settings).
 * Affected API: /api/providers, /api/settings, /api/auth/change-password, /api/backups.
 * Data schemas if any: None.
 * User instruction verbatim: "1. i want dual theme dark and light"
 */
import { ProvidersPanel } from "@/components/settings/ProvidersPanel";
import { SystemPromptPanel } from "@/components/settings/SystemPromptPanel";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { ChangePasswordPanel } from "@/components/settings/ChangePasswordPanel";
import { ThemePanel } from "@/components/settings/ThemePanel";
import { MemoryPanel } from "@/components/settings/MemoryPanel";
import { SyncPanel } from "@/components/settings/SyncPanel";
import { McpPanel } from "@/components/settings/McpPanel";
import { TelegramGatewayPanel } from "@/components/settings/TelegramGatewayPanel";
import { FreeModelsPanel } from "@/components/settings/FreeModelsPanel";
import { Settings2 } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 pb-16">
        <div className="border-b border-zinc-200/80 pb-3 dark:border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-indigo-500" />
            Vault Settings & AI Configuration
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Configure AI endpoints, permanent memory facts, appearance, master password, backups, P2P sync, and MCP servers.
          </p>
        </div>

        <ThemePanel />
        <TelegramGatewayPanel />
        <MemoryPanel />
        <SyncPanel />
        <McpPanel />
        <FreeModelsPanel />
        <ProvidersPanel />
        <SystemPromptPanel />
        <ChangePasswordPanel />
        <BackupPanel />
      </div>
    </div>
  );
}
