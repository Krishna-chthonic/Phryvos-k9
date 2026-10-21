/**
 * Phryvos-K9 Keyring Manager (Memory-Only Key Hygiene)
 *
 * Invariant: Never writes key material to localStorage, sessionStorage, or IndexedDB.
 * Holds key bytes strictly in an ephemeral Uint8Array that is immediately zeroed (.fill(0))
 * upon lock, idle expiration, or global 401 interceptor trigger.
 */

class KeyringManager {
  private keyBytes: Uint8Array | null = null;
  private isUnlockedState: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      // Automatic memory hygiene on tab unload/hide
      window.addEventListener("pagehide", () => this.wipe());
      window.addEventListener("beforeunload", () => this.wipe());
    }
  }

  /**
   * Set the active in-memory session key bytes.
   */
  public setKey(bytes: Uint8Array): void {
    this.wipe();
    this.keyBytes = new Uint8Array(bytes.length);
    this.keyBytes.set(bytes);
    this.isUnlockedState = true;
  }

  /**
   * Retrieve a copy of the current key bytes (never expose direct internal reference).
   */
  public getKey(): Uint8Array | null {
    if (!this.keyBytes) return null;
    const copy = new Uint8Array(this.keyBytes.length);
    copy.set(this.keyBytes);
    return copy;
  }

  /**
   * Check if a session key is currently held in memory.
   */
  public hasKey(): boolean {
    return this.isUnlockedState && this.keyBytes !== null;
  }

  /**
   * Mark the vault as unlocked via server session cookie (even if key is server-managed).
   */
  public setUnlocked(unlocked: boolean): void {
    this.isUnlockedState = unlocked;
    if (!unlocked) {
      this.wipe();
    }
  }

  /**
   * Cryptographically zeroes all memory buffers and nulls references.
   */
  public wipe(): void {
    if (this.keyBytes) {
      if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(this.keyBytes);
      }
      this.keyBytes.fill(0);
      this.keyBytes = null;
    }
    this.isUnlockedState = false;
  }
}

export const keyring = new KeyringManager();
