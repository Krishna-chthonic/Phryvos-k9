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

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <ThemePanel />
        <MemoryPanel />
        <ProvidersPanel />
        <SystemPromptPanel />
        <ChangePasswordPanel />
        <BackupPanel />
      </div>
    </div>
  );
}
