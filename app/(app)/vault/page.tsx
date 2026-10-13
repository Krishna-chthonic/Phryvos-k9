import { FilesApp } from "@/components/files/FilesApp";

/**
 * Vault — the encrypted file manager (P2).
 * Client app: tree + FTS search + Monaco editor + version history,
 * backed by the /api/files* routes guarded by requireVault.
 */
export default function VaultPage() {
  return <FilesApp />;
}
