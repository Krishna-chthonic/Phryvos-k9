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
${c.cyan}${c.bold}   ____  __                               
  / __ \\/ /_  ______  ______  ______  _____
 / /_/ / __ \\/ ___/ / / / / / / __ \\/ ___/
/ ____/ / / / /  / /_/ / /_/ / /_/ (__  ) 
/_/   /_/ /_/_/   \\__, /\\__,_/\\____/____/  
                 /____/                    ${c.reset}${c.dim}v${pkgVersion}${c.reset}
`);
}

function getRunningPid() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      if (pid && !isNaN(pid)) {
        process.kill(pid, 0);
        return pid;
      }
    } catch {
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  }

  // Fallback: check running processes via pgrep (bracket trick prevents self-matching)
  try {
    const out = execSync("pgrep -f '[n]ext-server' 2>/dev/null || pgrep -f '[n]pm run start' 2>/dev/null", { encoding: "utf-8" }).trim();
    if (out) {
      const pids = out.split("\n").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p !== process.pid);
      if (pids.length > 0) return pids[pids.length - 1];
    }
  } catch {}

  return null;
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
  const existingPid = getRunningPid();
  if (existingPid) {
    console.log(`${c.yellow}⚠️  Phryvos is already running (PID: ${existingPid})${c.reset}`);
    console.log(`Open: ${c.green}${c.bold}http://localhost:3000${c.reset}\n`);
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
  fs.writeFileSync(PID_FILE, child.pid.toString(), "utf-8");

  console.log(`${c.green}✔ Process started in background (PID: ${child.pid})${c.reset}`);
  console.log(`Logs: ${c.dim}${LOG_FILE}${c.reset}`);
  console.log(`Connecting...`);

  // Wait a moment and check status
  let attempts = 0;
  const maxAttempts = 15;
  const interval = setInterval(async () => {
    attempts++;
    const ok = await checkPortOpen(port, 1500);
    if (ok) {
      clearInterval(interval);
      console.log(`\n${c.green}${c.bold}✨ Phryvos is ready!${c.reset}`);
      console.log(`URL: ${c.cyan}${c.bold}http://localhost:${port}${c.reset}\n`);
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
  const pid = getRunningPid();
  if (!pid) {
    console.log(`${c.yellow}Phryvos is not currently running.${c.reset}\n`);
    return;
  }

  console.log(`${c.blue}Stopping Phryvos (PID: ${pid})...${c.reset}`);
  try {
    try { process.kill(pid, "SIGTERM"); } catch {}
    try { execSync(`pkill -P ${pid} 2>/dev/null || true`); } catch {}
    try { execSync("pkill -f 'next-server' 2>/dev/null || true"); } catch {}
    try { execSync("pkill -f 'npm run (start|dev)' 2>/dev/null || true"); } catch {}
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
  const ok = await checkPortOpen(3000, 1500);
  const pid = getRunningPid();

  if (!ok && !pid) {
    console.log(`Status: ${c.red}${c.bold}Stopped${c.reset}`);
    console.log(`Run ${c.bold}phryvos start${c.reset} to launch.\n`);
    return;
  }

  console.log(`Status: ${c.green}${c.bold}Running${c.reset}${pid ? ` (PID: ${pid})` : ""}`);
  if (ok) {
    console.log(`Web UI: ${c.cyan}${c.bold}http://localhost:3000${c.reset} (Responding)`);
  } else {
    console.log(`Web UI: ${c.yellow}http://localhost:3000 (Starting up...)${c.reset}`);
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
      console.log(`Fetching latest changes from git...`);
      execSync("git fetch origin", { cwd: ROOT_DIR, stdio: "inherit" });
      const status = execSync("git status -uno", { cwd: ROOT_DIR, encoding: "utf-8" });
      
      if (status.includes("Your branch is up to date")) {
        console.log(`${c.green}✔ You are already on the latest version! (v${pkgVersion})${c.reset}\n`);
        return;
      }

      console.log(`${c.yellow}Pulling updates...${c.reset}`);
      execSync("git pull", { cwd: ROOT_DIR, stdio: "inherit" });
      
      console.log(`${c.blue}Updating dependencies and rebuilding...${c.reset}`);
      const env = getGlibcEnv();
      execSync("npm install", { cwd: ROOT_DIR, env, stdio: "inherit" });
      execSync("npm run build", { cwd: ROOT_DIR, env, stdio: "inherit" });

      console.log(`\n${c.green}${c.bold}✨ Phryvos updated successfully!${c.reset}`);
      const pid = getRunningPid();
      if (pid) {
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
  console.log(`${c.bold}Usage:${c.reset} phryvos <command> [options]\n`);
  console.log(`${c.bold}Commands:${c.reset}`);
  console.log(`  ${c.cyan}start${c.reset}        Start Phryvos server in the background`);
  console.log(`  ${c.cyan}stop${c.reset}         Stop the running Phryvos server`);
  console.log(`  ${c.cyan}status${c.reset}       Check if Phryvos is currently running`);
  console.log(`  ${c.cyan}logs${c.reset}         View recent server logs (tail -n 50)`);
  console.log(`  ${c.cyan}update${c.reset}       Check and apply latest updates from Git`);
  console.log(`  ${c.cyan}version${c.reset}      Show installed version and release info`);
  console.log(`  ${c.cyan}help${c.reset}         Display this help message\n`);
  console.log(`${c.bold}Options for start:${c.reset}`);
  console.log(`  ${c.dim}--foreground, -f${c.reset}   Run in current terminal instead of background`);
  console.log(`  ${c.dim}--dev${c.reset}              Run development server with hot-reload`);
  console.log(`  ${c.dim}--port <number>${c.reset}    Set custom port (default: 3000)\n`);
}

// Main execution
const [,, command, ...args] = process.argv;

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
    console.log(`phryvos v${pkgVersion}`);
    break;
  case "help":
  case "-h":
  case "--help":
  default:
    showHelp();
    break;
}
