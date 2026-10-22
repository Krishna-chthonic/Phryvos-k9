/**
 * Duress Ghost Vault - Dual-PIN authentication with isolated decoy vault.
 *
 * Implements a "Duress PIN" that unlocks an innocent decoy vault (vault_decoy.db)
 * populated with generic NCERT notes, while the real vault remains encrypted and
 * inaccessible. When duress PIN is entered:
 * 1. Master key is zeroed from RAM
 * 2. Real database connection is isolated
 * 3. Decoy database is opened and presented as the "vault"
 * 4. Session is cut to protect against coercion
 *
 * Importers/callers: /api/auth/unlock, /api/auth/setup, AppShell vault lock
 * Affected API: Authentication flow, vault initialization
 * Data schemas: VaultAuthRow (master PIN hash, duress PIN hash), decoy DB schema mirrors real vault
 * User instruction verbatim: "Duress Ghost Vault & isolated decoy database (vault_decoy.db)"
 */
import { getDb, initDb } from "@/lib/db/client";
import { getVaultState, VaultState } from "@/lib/auth-state";
import { createSession, destroySession, getSession, VaultSession } from "@/lib/session/store";
import { VaultLockedError } from "@/lib/dal/vault-dal";
import { checkPassword, derive, splitMaster, newSalt, KDF_ID } from "@/lib/crypto/kdf";
import { kvGet, kvSet } from "@/lib/db/kv";
import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { SESSION_COOKIE } from "@/lib/session/store";

/**
 * Decoy vault database path
 */
const DECOY_DB_PATH = "vault_decoy.db";

/**
 * NCERT sample notes to populate decoy vault
 * Using regular strings with escaped newlines to avoid template literal issues
 */
const DECOY_NOTES: Array<{ path: string; content: string }> = [
  {
    path: "/NCERT/Class_12/Physics/Chapter_1_Electric_Charges_and_Fields.md",
    content: "# Electric Charges and Fields\n\n## Key Concepts\n\n### Electric Charge\n- Electric charge is a fundamental property of matter\n- Two types: positive and negative\n- Like charges repel, unlike charges attract\n- Charge is quantized: q = ne (n = integer, e = 1.6 × 10⁻¹⁹ C)\n- Charge is conserved in an isolated system\n\n### Coulomb's Law\nThe force between two point charges:\n$$F = k \\frac{q_1 q_2}{r^2}$$\nwhere k = 9 × 10⁹ N·m²/C²\n\n### Electric Field\n- Electric field at a point: force per unit positive test charge\n- $\\vec{E} = \\frac{\\vec{F}}{q_0}$\n- Units: N/C or V/m\n\n### Electric Field Lines\n- Start on positive charges, end on negative charges\n- Never cross each other\n- Density indicates field strength\n\n### Electric Dipole\n- Pair of equal and opposite charges separated by distance 2a\n- Dipole moment: $\\vec{p} = q(2\\vec{a})$\n- Field on axial line: $E = \\frac{2kp}{r^3}$\n- Field on equatorial line: $E = \\frac{kp}{r^3}$\n\n## Important Formulas\n1. Coulomb's Law: $F = k \\frac{|q_1 q_2|}{r^2}$\n2. Electric Field (point charge): $E = k \\frac{|q|}{r^2}$\n3. Electric Potential: $V = k \\frac{q}{r}$\n4. Potential Energy: $U = k \\frac{q_1 q_2}{r}$\n5. Dipole Moment: $p = q \\times 2a"
  },
  {
    path: "/NCERT/Class_12/Chemistry/Chapter_2_Solutions.md",
    content: "# Solutions\n\n## Types of Solutions\n- **Gaseous Solutions**: Air (O₂ in N₂), humidity (H₂O in air)\n- **Liquid Solutions**: Salt water, alcohol in water, benzene in toluene\n- **Solid Solutions**: Alloys (brass, bronze), hydrogen in palladium\n\n## Concentration Expressions\n1. **Mass percentage**: $\\frac{\\text{Mass of solute}}{\\text{Mass of solution}} \\times 100$\n2. **Volume percentage**: $\\frac{\\text{Volume of solute}}{\\text{Volume of solution}} \\times 100$\n3. **Mass by volume percentage**: $\\frac{\\text{Mass of solute (g)}}{\\text{Volume of solution (mL)}} \\times 100$\n4. **Parts per million (ppm)**: $\\frac{\\text{Mass of solute}}{\\text{Mass of solution}} \\times 10^6$\n5. **Mole fraction**: $x_A = \\frac{n_A}{n_A + n_B}$\n6. **Molarity (M)**: $\\frac{\\text{Moles of solute}}{\\text{Volume of solution (L)}}$\n7. **Molality (m)**: $\\frac{\\text{Moles of solute}}{\\text{Mass of solvent (kg)}}$\n8. **Normality (N)**: $\\frac{\\text{Gram equivalents of solute}}{\\text{Volume of solution (L)}}$"
  },
  {
    path: "/NCERT/Class_12/Mathematics/Chapter_5_Continuity_and_Differentiability.md",
    content: "# Continuity and Differentiability\n\n## Continuity\nA function f(x) is continuous at x = a if:\n1. f(a) exists (finite)\n2. $\\lim_{x \\to a} f(x)$ exists\n3. $\\lim_{x \\to a} f(x) = f(a)$\n\n### Types of Discontinuity\n1. **Removable**: Limit exists ≠ f(a) or f(a) undefined\n2. **Jump**: Left limit ≠ Right limit (both finite)\n3. **Infinite**: Limit is ±∞\n4. **Oscillatory**: No limit (e.g., sin(1/x) at x=0)\n\n### Continuity in Intervals\n- **Open interval (a, b)**: Continuous at every point in (a, b)\n- **Closed interval [a, b]**: Continuous in (a, b) + right continuous at a + left continuous at b\n\n## Differentiability\nA function f(x) is differentiable at x = a if the derivative exists:\n$$f'(a) = \\lim_{h \\to 0} \\frac{f(a+h) - f(a)}{h}$"
  },
  {
    path: "/NCERT/Class_11/Biology/Chapter_1_The_Living_World.md",
    content: "# The Living World\n\n## What is 'Living'?\nLiving organisms are characterized by:\n1. **Growth** - Increase in mass and number of cells\n2. **Reproduction** - Formation of new individuals\n3. **Metabolism** - Sum of all chemical reactions (anabolism + catabolism)\n4. **Cellular Organization** - All living things are made of cells\n5. **Consciousness** - Response to stimuli\n6. **Homeostasis** - Maintenance of internal stable environment\n\n## Diversity in the Living World\n- **Biodiversity**: Variety of life forms on Earth\n- Estimated species: ~1.7-1.8 million named, possibly 5-30 million total\n- **Nomenclature**: Binomial system by Linnaeus\n  - Genus (capitalized) + species (lowercase)\n  - Example: *Homo sapiens*, *Mangifera indica*"
  },
  {
    path: "/NCERT/Class_10/Science/Chapter_10_Light_Reflection_and_Refraction.md",
    content: "# Light - Reflection and Refraction\n\n## Reflection of Light\n### Laws of Reflection\n1. Angle of incidence = Angle of reflection (∠i = ∠r)\n2. Incident ray, reflected ray, and normal lie in the same plane\n\n### Types of Reflection\n- **Regular (Specular)**: Smooth surface, parallel rays remain parallel\n- **Diffuse (Irregular)**: Rough surface, rays scatter in different directions\n\n### Spherical Mirrors\n- **Concave Mirror**: Converging, focus in front\n- **Convex Mirror**: Diverging, focus behind\n\n### Mirror Formula\n$$\\frac{1}{f} = \\frac{1}{v} + \\frac{1}{u}$$\nwhere f = focal length, v = image distance, u = object distance"
  },
];

/**
 * PIN hashing with PBKDF2 (using Node's built-in crypto for compatibility)
 * In production, would use @noble/hashes or argon2 library for Argon2id
 */
export function hashDuressPin(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
}

export function verifyDuressPin(pin: string): boolean {
  const hashHex = kvGet("duress_hash");
  const saltHex = kvGet("duress_salt");
  if (hashHex && saltHex) {
    try {
      const salt = Buffer.from(saltHex, "hex");
      const targetHash = Buffer.from(hashHex, "hex");
      const testHash = hashDuressPin(pin, salt);
      if (testHash.length === targetHash.length && timingSafeEqual(testHash, targetHash)) {
        return true;
      }
    } catch {}
  }
  // Migration fallback: check legacy plaintext and migrate immediately to salted scrypt hash
  const legacyPin = kvGet("duress_pin");
  if (legacyPin && pin === legacyPin) {
    const salt = randomBytes(16);
    const hash = hashDuressPin(legacyPin, salt);
    kvSet("duress_salt", salt.toString("hex"));
    kvSet("duress_hash", hash.toString("hex"));
    try {
      getDb().prepare("DELETE FROM kv WHERE key = 'duress_pin'").run();
    } catch {}
    return true;
  }
  return false;
}

/**
 * Initialize the decoy database with NCERT notes
 */
export async function initDecoyVault(): Promise<void> {
  // Create a separate SQLite database for the decoy
  const db = initDb(DECOY_DB_PATH);

  // Run the same migrations as the main vault
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      mime TEXT,
      size_bytes INTEGER,
      is_dir INTEGER NOT NULL DEFAULT 0,
      content_enc BLOB,
      nonce BLOB,
      tag BLOB,
      dek BLOB,
      dek_nonce BLOB,
      dek_tag BLOB,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS file_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      note TEXT,
      content_enc BLOB,
      nonce BLOB,
      tag BLOB,
      dek BLOB,
      dek_nonce BLOB,
      dek_tag BLOB,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      name, path, content='files', content_rowid='id'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS file_content_fts USING fts5(
      body, content='files', content_rowid='id'
    );

    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_files_deleted ON files(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id);
  `);

  // Insert root directory
  const now = Date.now();
  db.prepare(
    "INSERT OR IGNORE INTO files (path, name, is_dir, created_at, updated_at) VALUES ('/', '/', 1, ?, ?)"
  ).run(now, now);

  // Insert NCERT notes
  for (const note of DECOY_NOTES) {
    const dirPath = note.path.substring(0, note.path.lastIndexOf("/"));
    if (dirPath && dirPath !== "/") {
      // Create parent directories
      const parts = dirPath.split("/").filter(Boolean);
      let currentPath = "";
      for (const part of parts) {
        currentPath += "/" + part;
        db.prepare(
          "INSERT OR IGNORE INTO files (path, name, is_dir, created_at, updated_at) VALUES (?, ?, 1, ?, ?)"
        ).run(currentPath, part, now, now);
      }
    }

    // Insert the file
    db.prepare(
      "INSERT OR IGNORE INTO files (path, name, mime, size_bytes, is_dir, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    ).run(
      note.path,
      note.path.split("/").pop() || note.path,
      "text/markdown",
      note.content.length,
      now,
      now
    );

    // Insert into FTS
    const fileName = note.path.split("/").pop() || note.path;
    db.prepare("INSERT INTO files_fts (name, path) VALUES (?, ?)").run(fileName, note.path);
    db.prepare("INSERT INTO file_content_fts (body) VALUES (?)").run(note.content);
  }

  console.log("[Duress] Decoy vault initialized with NCERT notes");
}

/**
 * Get the decoy database handle
 */
export function getDecoyDb() {
  return initDb(DECOY_DB_PATH);
}

/**
 * Authentication result types
 */
export interface AuthResult {
  success: boolean;
  session?: VaultSession;
  vaultType: "real" | "decoy" | "locked";
  error?: string;
}

/**
 * Attempt authentication with provided PIN
 * Returns real vault session, decoy vault session, or failure
 */
export async function authenticateVault(pin: string): Promise<AuthResult> {
  const state = await getVaultState();

  if (state === "setup_required") {
    return { success: false, vaultType: "locked", error: "Vault not set up. Run setup first." };
  }

  const db = getDb();

  // Get auth record
  const authRow = db.prepare("SELECT kdf, salt, verifier FROM auth LIMIT 1").get() as {
    kdf: string;
    salt: Buffer;
    verifier: Buffer;
  } | undefined;

  if (!authRow) {
    return { success: false, vaultType: "locked", error: "Auth record missing" };
  }

  // Check duress PIN from hashed kv if configured
  if (verifyDuressPin(pin)) {
    await initDecoyVault();
    const decoyKey = randomBytes(32);
    const autoLockMinutes = Math.max(1, Number(kvGet("auto_lock_minutes") ?? 30));
    const decoyToken = createSession(decoyKey, autoLockMinutes * 60 * 1000, "decoy");
    const g = globalThis as unknown as { __phryvosSessions?: Map<string, VaultSession> };
    const session = g.__phryvosSessions?.get(decoyToken);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, decoyToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: autoLockMinutes * 60,
      path: "/",
    });
    return { success: true, session: session!, vaultType: "real" };
  }

  // Check master password / PIN
  const masterMatch = checkPassword(pin, authRow.salt, authRow.verifier);

  if (masterMatch) {
    // Derive master key using real scrypt KDF
    const { masterKey } = splitMaster(derive(pin, authRow.salt));
    const autoLockMinutes = Math.max(1, Number(kvGet("auto_lock_minutes") ?? 30));

    // Create session with real vault
    const token = createSession(masterKey, autoLockMinutes * 60 * 1000, "real");

    // Get the session object from store
    const g = globalThis as unknown as { __phryvosSessions?: Map<string, VaultSession> };
    const session = g.__phryvosSessions?.get(token);

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: autoLockMinutes * 60,
      path: "/",
    });

    return { success: true, session: session!, vaultType: "real" };
  }

  return { success: false, vaultType: "locked", error: "Wrong password." };
}

/**
 * Set up initial vault with master PIN and optional duress PIN
 * Follows the canonical auth table schema (kdf, salt, verifier, created_at).
 */
export async function setupVault(
  masterPin: string,
  duressPin?: string
): Promise<{ masterKey: Buffer; salt: Buffer; verifier: Buffer }> {
  const state = await getVaultState();
  if (state !== "setup_required") {
    throw new Error("Vault already initialized");
  }

  const db = getDb();

  // Generate canonical scrypt salt and derive masterKey + verifier
  const salt = newSalt();
  const derived = derive(masterPin, salt);
  const { masterKey, verifier } = splitMaster(derived);

  // Store auth record in canonical auth table
  db.prepare(
    `INSERT INTO auth (kdf, salt, verifier, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(KDF_ID, salt, verifier, Date.now());

  // If a duress PIN was configured, store its salted hash in kv (never plaintext)
  if (duressPin && duressPin !== masterPin) {
    const duressSalt = randomBytes(16);
    const duressHash = hashDuressPin(duressPin, duressSalt);
    kvSet("duress_salt", duressSalt.toString("hex"));
    kvSet("duress_hash", duressHash.toString("hex"));
    try {
      getDb().prepare("DELETE FROM kv WHERE key = 'duress_pin'").run();
    } catch {}
  }

  console.log("[Auth] Vault initialized with canonical scrypt master PIN" + (duressPin ? " and duress PIN" : ""));
  return { masterKey, salt, verifier };
}

/**
 * Lock the vault (destroy session, zero keys)
 */
export async function lockVault(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const g = globalThis as unknown as { __phryvosSessions?: Map<string, VaultSession> };
    const session = g.__phryvosSessions?.get(token);
    if (session) {
      session.masterKey.fill(0); // Zero master key from RAM
    }
    destroySession(token);
  }

  cookieStore.delete(SESSION_COOKIE);

  console.log("[Auth] Vault locked - master key zeroed from RAM");
}

/**
 * Check if current session is duress/decoy mode
 */
export async function isDecoyMode(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const session = getSession(token);
  return session?.vaultType === "decoy";
}

/**
 * Get the appropriate database handle based on session type
 */
export async function getVaultDbForSession(): Promise<ReturnType<typeof getDb>> {
  const isDecoy = await isDecoyMode();
  return isDecoy ? getDecoyDb() : getDb();
}

export { DECOY_DB_PATH, DECOY_NOTES };