#!/usr/bin/env node
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");

const ROOT = __dirname;
const BACKEND = path.join(ROOT, "server");
const FRONTEND = path.join(ROOT, "ui");
const VENV_PYTHON = path.join(ROOT, "server", ".venv", "Scripts", "python.exe");
const BACKEND_PORT = Number(process.env.MNEMOS_PORT || "8000");
const FRONTEND_PORT = 5173;
const IS_WIN = process.platform === "win32";
const npmCommand = IS_WIN
  ? [process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd run dev"]]
  : ["npm", ["run", "dev"]];

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => tester.once("close", () => resolve(true)).close())
      .listen(port, "127.0.0.1");
  });
}

function getListeningPids(port) {
  try {
    if (IS_WIN) {
      const out = execSync(`netstat -ano -p tcp`).toString();
      const pids = new Set();
      for (const line of out.split("\n")) {
        if (line.includes(`:${port} `) && line.includes("LISTENING")) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (/^\d+$/.test(pid)) pids.add(pid);
        }
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti:${port}`).toString().trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function commandLineOf(pid) {
  try {
    if (IS_WIN) {
      return execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`
      ).toString().trim();
    }
    return execSync(`ps -p ${pid} -o command=`).toString().trim();
  } catch {
    return "";
  }
}

function killPidTree(pid) {
  try {
    if (IS_WIN) execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    else execSync(`kill -9 ${pid}`, { stdio: "ignore" });
  } catch {
    // already gone
  }
}

async function ensurePortFree(port, label) {
  if (await isPortFree(port)) return;
  const pids = getListeningPids(port);
  const ours = pids.filter((pid) => /uvicorn|vite|start\.js|mnemos/i.test(commandLineOf(pid)));
  if (!ours.length) {
    console.log(`\x1b[31m[mnemos]\x1b[0m Port ${port} (${label}) is already in use by another process. Free it manually or set MNEMOS_PORT.`);
    return;
  }
  console.log(`\x1b[33m[mnemos]\x1b[0m Port ${port} (${label}) is held by ${ours.length} leftover process(es) from a previous run — stopping them...`);
  for (const pid of ours) killPidTree(pid);
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await isPortFree(port)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (IS_WIN) {
    try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" }); } catch {}
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
  }
}

function tag(stream, prefix) {
  stream.on("data", (d) => {
    const lines = d.toString().split("\n").filter(Boolean);
    for (const l of lines) console.log(`\x1b[90m${prefix}\x1b[0m ${l}`);
  });
}

async function main() {
  console.log("\n\x1b[1m\x1b[35m  Mnemos\x1b[0m — starting backend + frontend...\n");

  await ensurePortFree(BACKEND_PORT, "backend");
  await ensurePortFree(FRONTEND_PORT, "frontend");

  const backend = spawn(VENV_PYTHON, ["-m", "uvicorn", "app.main:app", "--reload", "--port", String(BACKEND_PORT)], {
    cwd: BACKEND,
    stdio: "pipe",
    shell: false,
    detached: !IS_WIN,
  });

  const frontend = spawn(npmCommand[0], npmCommand[1], {
    cwd: FRONTEND,
    stdio: "pipe",
    shell: false,
    detached: !IS_WIN,
  });

  tag(backend.stdout, "\x1b[33m[backend]\x1b[0m");
  tag(backend.stderr, "\x1b[33m[backend]\x1b[0m");
  tag(frontend.stdout, "\x1b[36m[frontend]\x1b[0m");
  tag(frontend.stderr, "\x1b[36m[frontend]\x1b[0m");

  let exiting = false;
  function stop(exitCode = 0) {
    if (exiting) return;
    exiting = true;
    killTree(backend);
    killTree(frontend);
    setTimeout(() => process.exit(exitCode), 500);
  }

  for (const [name, child] of [["backend", backend], ["frontend", frontend]]) {
    child.on("error", (error) => {
      console.error(`\x1b[31m[${name}] failed to start:\x1b[0m ${error.message}`);
      stop(1);
    });
    child.on("exit", (code, signal) => {
      if (exiting) return;
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      console.error(`\x1b[31m[${name}] exited unexpectedly with ${reason}.\x1b[0m`);
      stop(code || 1);
    });
  }

  process.on("SIGINT", () => stop());
  process.on("SIGTERM", () => stop());
}

main();
