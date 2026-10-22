#!/usr/bin/env node

/**
 * phryvos CLI
 * Command line interface to manage, start, stop, and update phryvos.
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PID_FILE = path.join(ROOT_DIR, ".phryvos.pid");
const LOG_FILE = path.join(ROOT_DIR, ".phryvos.log");
const PKG_FILE = path.join(ROOT_DIR, "package.json");

// Read version from package.json
let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(fs.readFileSync(PKG_FILE, "utf-8"));
  if (pkg.version) pkgVersion = pkg.version;
} catch {}

// Colors for terminal output
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function banner() {
  console.log(`
${c.cyan}${c.bold}   ____  __                                      __ _____ 
  / __ \\/ /_  ______  ______  ______  _____     / //_/   |
 / /_/ / __ \\/ ___/ / / / / / / __ \\/ ___/____ / ,<  / /| |
/ ____/ / / / /  / /_/ / /_/ / /_/ (__  )/___// /| |/ ___ |
/_/   /_/ /_/_/   \\__, /\\__,_/\\____/____/    /_/ |_/_/  |_|
                 /____/                    ${c.reset}${c.dim}v${pkgVersion}${c.reset}
`);
}

function getRunningInstance() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
      let pid = null;
      let port = 3000;
      let startedAt = null;

      if (raw.startsWith("{")) {
        const data = JSON.parse(raw);
        pid = parseInt(data.pid, 10);
        port = parseInt(data.port, 10) || 3000;
        startedAt = data.startedAt;
      } else {
        pid = parseInt(raw, 10);
      }

      if (pid && !isNaN(pid)) {
        process.kill(pid, 0);
        return { pid, port, startedAt };
      }
    } catch {
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  }
  return null;
}

function getRunningPid() {
  const inst = getRunningInstance();
  return inst ? inst.pid : null;
}

function killProcessTree(pid, signal = "SIGTERM") {
  try {
    const childrenOut = execSync(`pgrep -P ${pid} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
    if (childrenOut) {
      const childPids = childrenOut.split("\n").map((p) => parseInt(p.trim(), 10)).filter(Boolean);
      for (const childPid of childPids) {
        killProcessTree(childPid, signal);
      }
    }
  } catch {}
  try {
    process.kill(pid, signal);
  } catch {}
}

function getGlibcEnv() {
  const env = { ...process.env };
  // If in proot / Termux environment, ensure standard glibc PATH is first
  if (fs.existsSync("/usr/bin/node")) {
    const currentPath = env.PATH || "";
    if (!currentPath.startsWith("/usr/bin")) {
      env.PATH = `/usr/bin:/usr/sbin:/sbin:/bin:/usr/local/bin:${currentPath}`;
    }
  }
  return env;
}

async function checkPortOpen(port = 3000, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/auth/status`, (res) => {
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function cmdStart(args) {
  banner();
  const existingInst = getRunningInstance();
  if (existingInst) {
    console.log(`${c.yellow}⚠️  Phryvos is already running (PID: ${existingInst.pid})${c.reset}`);
    console.log(`Open: ${c.green}${c.bold}http://localhost:${existingInst.port}${c.reset}\n`);
    return;
  }

  const isDev = args.includes("--dev");
  const isForeground = args.includes("--foreground") || args.includes("-f");
  const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3000";

  console.log(`${c.blue}🚀 Starting Phryvos ${isDev ? "(Development mode)" : "(Production mode)"}...${c.reset}`);

  const npmCmd = isDev ? "dev" : "start";
  const env = getGlibcEnv();
  env.PORT = port;

  if (isForeground) {
    const child = spawn("npm", ["run", npmCmd], {
      cwd: ROOT_DIR,
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => process.exit(code || 0));
    return;
  }

  // Background daemon mode
  const outLog = fs.openSync(LOG_FILE, "a");
  const child = spawn("npm", ["run", npmCmd], {
    cwd: ROOT_DIR,
    env,
    detached: true,
    stdio: ["ignore", outLog, outLog],
  });

  child.unref();
  const meta = {
    pid: child.pid,
    port: parseInt(port, 10) || 3000,
    startedAt: Date.now(),
  };
  fs.writeFileSync(PID_FILE, JSON.stringify(meta, null, 2), "utf-8");

  console.log(`${c.green}✔ Process started in background (PID: ${child.pid}, Port: ${meta.port})${c.reset}`);
  console.log(`Logs: ${c.dim}${LOG_FILE}${c.reset}`);
  console.log(`Connecting...`);

  // Wait a moment and check status
  let attempts = 0;
  const maxAttempts = 15;
  const interval = setInterval(async () => {
    attempts++;
    const ok = await checkPortOpen(meta.port, 1500);
    if (ok) {
      clearInterval(interval);
      console.log(`\n${c.green}${c.bold}✨ Phryvos is ready!${c.reset}`);
      console.log(`URL: ${c.cyan}${c.bold}http://localhost:${meta.port}${c.reset}\n`);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.log(`\n${c.yellow}Phryvos is still initializing. Check logs with:${c.reset}`);
      console.log(`  ${c.bold}phryvos logs${c.reset}\n`);
    } else {
      process.stdout.write(".");
    }
  }, 1000);
}

function cmdStop() {
  banner();
  const inst = getRunningInstance();
  if (!inst) {
    console.log(`${c.yellow}Phryvos is not currently running.${c.reset}\n`);
    return;
  }

  const { pid } = inst;
  console.log(`${c.blue}Stopping Phryvos (PID: ${pid})...${c.reset}`);
  try {
    killProcessTree(pid, "SIGTERM");

    // Wait up to 3 seconds for graceful shutdown
    const start = Date.now();
    let alive = true;
    while (Date.now() - start < 3000) {
      try {
        process.kill(pid, 0);
        execSync("sleep 0.1 2>/dev/null || true");
      } catch {
        alive = false;
        break;
      }
    }

    if (alive) {
      killProcessTree(pid, "SIGKILL");
    }

    try {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch {}
    console.log(`${c.green}✔ Phryvos stopped successfully.${c.reset}\n`);
  } catch (err) {
    console.error(`${c.red}Failed to stop Phryvos: ${err.message}${c.reset}\n`);
  }
}

async function cmdStatus() {
  banner();
  const inst = getRunningInstance();

  if (!inst) {
    console.log(`Status: ${c.red}${c.bold}Stopped${c.reset}`);
    const portInUse = await checkPortOpen(3000, 1000);
    if (portInUse) {
      console.log(`${c.yellow}Note: Port 3000 is responding to requests, but not from this Phryvos instance.${c.reset}`);
    }
    console.log(`Run ${c.bold}phryvos start${c.reset} to launch.\n`);
    return;
  }

  const port = inst.port || 3000;
  const ok = await checkPortOpen(port, 1500);

  console.log(`Status: ${c.green}${c.bold}Running${c.reset} (PID: ${inst.pid})`);
  if (ok) {
    console.log(`Web UI: ${c.cyan}${c.bold}http://localhost:${port}${c.reset} (Responding)`);
  } else {
    console.log(`Web UI: ${c.yellow}http://localhost:${port} (Starting up...)${c.reset}`);
  }
  console.log(`Logs:   ${c.dim}${LOG_FILE}${c.reset}\n`);
}

function cmdLogs(args) {
  if (!fs.existsSync(LOG_FILE)) {
    console.log(`${c.yellow}No log file found at ${LOG_FILE}${c.reset}\n`);
    return;
  }
  const lines = args.includes("-n") ? args[args.indexOf("-n") + 1] : "50";
  try {
    execSync(`tail -n ${lines} "${LOG_FILE}"`, { stdio: "inherit" });
  } catch {
    console.log(fs.readFileSync(LOG_FILE, "utf-8").slice(-2000));
  }
}

async function cmdUpdate() {
  banner();
  console.log(`${c.blue}🔍 Checking for updates...${c.reset}`);

  let isGitRepo = false;
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: ROOT_DIR, stdio: "ignore" });
    isGitRepo = true;
  } catch {}

  if (isGitRepo) {
    try {
      // Check for uncommitted/dirty local changes to tracked files (-uno ignores untracked data/db files)
      const gitStatus = execSync("git status --porcelain -uno", { cwd: ROOT_DIR, encoding: "utf-8" }).trim();
      if (gitStatus.length > 0) {
        console.error(`${c.red}Update aborted: You have uncommitted local changes to tracked files.${c.reset}`);
        console.log(`Please commit, stash, or revert your changes before updating.\n`);
        return;
      }

      console.log(`Fetching latest changes from git...`);
      execSync("git fetch origin", { cwd: ROOT_DIR, stdio: "inherit" });
      
      const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT_DIR, encoding: "utf-8" }).trim();
      const status = execSync("git status -uno", { cwd: ROOT_DIR, encoding: "utf-8" });
      
      if (status.includes("Your branch is up to date")) {
        console.log(`${c.green}✔ You are already on the latest version! (v${pkgVersion})${c.reset}\n`);
        return;
      }

      console.log(`${c.yellow}Pulling updates for branch '${currentBranch}'...${c.reset}`);
      execSync(`git pull --ff-only origin ${currentBranch}`, { cwd: ROOT_DIR, stdio: "inherit" });
      
      console.log(`${c.blue}Updating dependencies and rebuilding...${c.reset}`);
      const env = getGlibcEnv();
      execSync("npm install", { cwd: ROOT_DIR, env, stdio: "inherit" });
      execSync("npm run build", { cwd: ROOT_DIR, env, stdio: "inherit" });

      console.log(`\n${c.green}${c.bold}✨ Phryvos updated successfully!${c.reset}`);
      const inst = getRunningInstance();
      if (inst) {
        console.log(`${c.yellow}Restarting running instance...${c.reset}`);
        cmdStop();
        await cmdStart([]);
      }
      return;
    } catch (e) {
      console.error(`${c.red}Update failed: ${e.message}${c.reset}\n`);
      return;
    }
  }

  // Check GitHub releases via public API
  try {
    const res = await fetch("https://api.github.com/repos/Krishna-chthonic/Phryvos-k9/releases/latest", {
      headers: { "User-Agent": "phryvos-cli" }
    });
    if (res.ok) {
      const data = await res.json();
      const latest = (data.tag_name || "").replace(/^v/, "");
      if (latest && latest !== pkgVersion) {
        console.log(`${c.yellow}New version available: v${latest} (Current: v${pkgVersion})${c.reset}`);
        console.log(`To update, run the install script or pull the latest release.\n`);
      } else {
        console.log(`${c.green}✔ You are on the latest version! (v${pkgVersion})${c.reset}\n`);
      }
    } else {
      console.log(`${c.green}✔ Current version: v${pkgVersion}${c.reset}\n`);
    }
  } catch {
    console.log(`${c.green}✔ Current version: v${pkgVersion}${c.reset}\n`);
  }
}

function showHelp() {
  banner();
  console.log(`${c.bold}Usage:${c.reset} phryvos-k9 <command> [options]`);
  console.log(`       ${c.dim}(or: phryvos k9 <command>)${c.reset}\n`);
  console.log(`${c.bold}Commands:${c.reset}`);
  console.log(`  ${c.cyan}start${c.reset}        Start Phryvos K9 server in the background`);
  console.log(`  ${c.cyan}stop${c.reset}         Stop the running Phryvos K9 server`);
  console.log(`  ${c.cyan}status${c.reset}       Check if Phryvos K9 is currently running`);
  console.log(`  ${c.cyan}logs${c.reset}         View recent server logs (tail -n 50)`);
  console.log(`  ${c.cyan}update${c.reset}       Check and apply latest updates from Git`);
  console.log(`  ${c.cyan}version${c.reset}      Show installed version`);
  console.log(`  ${c.cyan}help${c.reset}         Display this help message\n`);
  console.log(`${c.bold}Options for start:${c.reset}`);
  console.log(`  ${c.dim}--foreground, -f${c.reset}   Run in current terminal instead of background`);
  console.log(`  ${c.dim}--dev${c.reset}              Run development server with hot-reload`);
  console.log(`  ${c.dim}--port <number>${c.reset}    Set custom port (default: 3000)\n`);
}

// Main execution
let rawArgs = process.argv.slice(2);
if (rawArgs[0] === "k9") {
  rawArgs = rawArgs.slice(1);
}
const [command, ...args] = rawArgs;

switch (command) {
  case "start":
    cmdStart(args);
    break;
  case "stop":
    cmdStop();
    break;
  case "restart":
    cmdStop();
    setTimeout(() => cmdStart(args), 1000);
    break;
  case "status":
    cmdStatus();
    break;
  case "logs":
    cmdLogs(args);
    break;
  case "update":
    cmdUpdate();
    break;
  case "version":
  case "-v":
  case "--version":
    console.log(`phryvos-k9 v${pkgVersion}`);
    break;
  case "help":
  case "-h":
  case "--help":
  default:
    showHelp();
    break;
}
