#!/usr/bin/env node
/**
 * MOP-AGENT installer / operator (TUI). Self-host with one command.
 *
 *   curl -fsSL https://raw.githubusercontent.com/BURHANDEV-ENTERPRISE/mop-agent/main/install.sh | bash
 *   npx mop-agent            # interactive TUI
 *   npx mop-agent install    # install system deps (postgres/nginx/certbot)
 *   npx mop-agent setup      # domain / db / ssl / systemd
 *   npx mop-agent update     # git pull + npm ci + migrate + restart
 *   npx mop-agent status     # health
 *   npx mop-agent uninstall  # remove service + nginx vhost (keeps data unless --purge)
 *
 * Safety: real execution needs root. When not root (or with --dry-run) it prints
 * the exact commands + generated configs instead of running them.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  c, detectOS, renderNginxVhost, renderSystemdUnit,
  planInstallDeps, planDbSetup, planSsl, PORT80_SCAN,
  nginxPaths, installPaths,
} from "./lib.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const [k, inline] = a.slice(2).split("=", 2);
    if (inline !== undefined) out[k] = inline;
    else if (!argv[i + 1] || argv[i + 1].startsWith("--")) out[k] = true;
    else { out[k] = argv[++i]; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const DRY = !!args["dry-run"] || (!isRoot && !args.force);

function banner() {
  console.log(c("cyan", c("bold", "\n  🧠 MOP-AGENT installer")));
  const os = detectOS();
  console.log(c("gray", `  ${os.pretty} · family=${os.family} · ${isRoot ? "root" : c("yellow", "not root → dry-run")}`));
  console.log("");
}

function supportedLinux(os = detectOS()) {
  if (os.family !== "unsupported" && os.family !== "unknown" && os.pkg) return true;
  console.log(c("red", `  Automated production install is not supported on ${os.pretty || os.platform}.`));
  if (os.platform === "win32") {
    console.log(c("yellow", "  Windows: use WSL2 Ubuntu for production, or native PowerShell for development."));
  } else if (os.platform === "darwin") {
    console.log(c("yellow", "  macOS: development mode only; deploy production on a supported Linux host."));
  } else {
    console.log(c("yellow", "  Supported Linux families: Debian/Ubuntu, RHEL/Fedora, Arch, and Alpine."));
  }
  console.log(c("gray", "  Guide: https://github.com/BURHANDEV-ENTERPRISE/mop-agent#platform-support\n"));
  return false;
}

function printInstallLocations(os = detectOS()) {
  if (!supportedLinux(os)) return false;
  console.log(c("bold", "Installation locations"));
  for (const [label, value] of Object.entries(installPaths(APP_DIR, os.family))) {
    console.log(`  ${label.padEnd(15)} ${value}`);
  }
  console.log(c("gray", "  /var/www is not used: nginx reverse-proxies to this Node.js service.\n"));
  return true;
}

/** Run a shell command (or print it in dry-run). Returns {code, stdout}. */
function run(cmd, { capture = false } = {}) {
  if (DRY) { console.log(c("gray", `  [dry-run] $ ${cmd}`)); return { code: 0, stdout: "" }; }
  console.log(c("dim", `  $ ${cmd}`));
  const r = spawnSync("sh", ["-c", cmd], { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8" });
  if (!capture && r.status !== 0) console.log(c("red", `  ✗ exited ${r.status}`));
  return { code: r.status ?? 1, stdout: r.stdout ?? "" };
}

function runSteps(steps) {
  for (const s of steps) {
    console.log(c("cyan", `▸ ${s.label}`));
    const { code } = run(s.cmd);
    if (code !== 0 && !DRY) {
      console.log(c("yellow", `  (continuing despite non-zero exit)`));
    }
  }
}

// ---- commands ----------------------------------------------------------

function cmdInstall() {
  banner();
  const os = detectOS();
  if (!printInstallLocations(os)) return;
  console.log(c("bold", "Installing system dependencies (PostgreSQL, nginx, certbot)…\n"));
  runSteps(planInstallDeps(os));
  console.log(c("green", "\n✓ dependencies step complete. Next: mop-agent setup\n"));
}

async function cmdSetup() {
  banner();
  const os = detectOS();
  if (!printInstallLocations(os)) return;
  const rl = createInterface({ input, output });
  const ask = async (q, def) => (await rl.question(c("cyan", `  ${q}${def ? c("gray", ` [${def}]`) : ""}: `))).trim() || def || "";

  const domain = await ask("Domain (e.g. agent.mydomain.com)");
  const port = await ask("App port", "3000");
  const email = await ask("Email for Let's Encrypt", domain ? `admin@${domain.split(".").slice(-2).join(".")}` : "");
  const dbName = await ask("DB name", "mopagent");
  const dbUser = await ask("DB user", "mopagent");
  const dbPass = await ask("DB password", randomToken(16));
  const wantSsl = (await ask("Obtain HTTPS cert now? (y/n)", "y")).toLowerCase().startsWith("y");
  rl.close();

  // 1) .env
  const secret = (n) => randomToken(n);
  const env = [
    `PORT=${port}`,
    `BETTER_AUTH_URL=https://${domain}`,
    `BETTER_AUTH_SECRET=${secret(48)}`,
    `MOP_AGENT_SECRET=${secret(64).replace(/[^0-9a-f]/g, "").padEnd(64, "0").slice(0, 64)}`,
    `MOP_AGENT_DATA_DIR=${APP_DIR}/data`,
    `MOP_AGENT_CONSOLIDATE_CRON=0 3 * * *`,
    `# DATABASE_URL=postgres://${dbUser}:${dbPass}@127.0.0.1:5432/${dbName}  # (Postgres path; SQLite default for now)`,
  ].join("\n") + "\n";
  console.log(c("cyan", "\n▸ Write apps/web/.env"));
  if (DRY) console.log(c("gray", env.split("\n").map((l) => "    " + l).join("\n")));
  else { writeFileSync(`${APP_DIR}/apps/web/.env`, env); console.log(c("green", "  ✓ wrote .env")); }

  // 2) Postgres role + db
  console.log(c("cyan", "▸ Database"));
  runSteps(planDbSetup({ dbName, dbUser, dbPass }));

  // 3) migrate + build
  runSteps([
    { label: "Install deps", cmd: `cd ${APP_DIR} && npm ci` },
    { label: "Migrate DB", cmd: `cd ${APP_DIR}/apps/web && npm run db:migrate` },
    { label: "Build", cmd: `cd ${APP_DIR}/apps/web && npm run build` },
  ]);

  // 4) nginx vhost
  const vhost = renderNginxVhost({ domain, port });
  const nginx = nginxPaths(os.family);
  const vhostPath = nginx.conf;
  console.log(c("cyan", "▸ nginx reverse proxy"));
  writeConf(vhostPath, vhost);
  runSteps([
    ...(nginx.enabled
      ? [{ label: "Enable site", cmd: `ln -sf ${vhostPath} ${nginx.enabled}` }]
      : []),
    { label: "Test nginx config", cmd: "nginx -t" },
    { label: "Reload nginx", cmd: "systemctl reload nginx" },
  ]);

  // 5) systemd
  const unit = renderSystemdUnit({ appDir: APP_DIR, port, user: isRoot ? "root" : process.env.USER || "root" });
  console.log(c("cyan", "▸ systemd service (auto-restart on boot)"));
  writeConf("/etc/systemd/system/mop-agent.service", unit);
  runSteps([
    { label: "Reload systemd", cmd: "systemctl daemon-reload" },
    { label: "Enable + start MOP-AGENT", cmd: "systemctl enable --now mop-agent" },
  ]);

  // 6) SSL with fallback
  if (wantSsl && domain) {
    console.log(c("cyan", "▸ HTTPS (Let's Encrypt)"));
    const ssl = planSsl({ domain, email });
    const { code } = run(ssl.primary.cmd);
    if (code !== 0 && !DRY) {
      console.log(c("yellow", "  certbot --nginx failed. Scanning :80 and retrying standalone…"));
      const scan = run(PORT80_SCAN, { capture: true });
      if (scan.stdout.trim()) console.log(c("gray", "  port 80 in use by:\n" + scan.stdout.trim()));
      runSteps(ssl.fallback);
    }
  }

  console.log(c("green", `\n✓ Setup complete. Visit ${domain ? `https://${domain}` : `http://localhost:${port}`}/setup to create the owner.\n`));
  printInstallLocations(os);
}

function cmdUpdate() {
  banner();
  if (!printInstallLocations()) return;
  console.log(c("bold", "Updating MOP-AGENT…\n"));
  runSteps([
    { label: "Pull latest", cmd: `cd ${APP_DIR} && git pull --ff-only` },
    { label: "Install deps", cmd: `cd ${APP_DIR} && npm ci` },
    { label: "Migrate DB", cmd: `cd ${APP_DIR}/apps/web && npm run db:migrate` },
    { label: "Build", cmd: `cd ${APP_DIR}/apps/web && npm run build` },
    { label: "Restart service", cmd: "systemctl restart mop-agent" },
  ]);
  console.log(c("green", "\n✓ updated\n"));
}

function cmdStatus() {
  banner();
  if (!printInstallLocations()) return;
  const checks = [
    ["service", "systemctl is-active mop-agent 2>/dev/null || echo inactive"],
    ["nginx", "systemctl is-active nginx 2>/dev/null || echo inactive"],
    ["postgres", "systemctl is-active postgresql 2>/dev/null || echo inactive"],
    [".env", existsSync(`${APP_DIR}/apps/web/.env`) ? "echo present" : "echo missing"],
  ];
  for (const [label, cmd] of checks) {
    const r = run(cmd, { capture: true });
    const val = DRY ? "(dry-run)" : r.stdout.trim();
    console.log(`  ${label.padEnd(10)} ${val === "active" || val === "present" ? c("green", val) : c("yellow", val)}`);
  }
  console.log("");
}

function cmdUninstall() {
  banner();
  const os = detectOS();
  if (!printInstallLocations(os)) return;
  const nginx = nginxPaths(os.family);
  const nginxRemove = [nginx.enabled, nginx.conf].filter(Boolean).join(" ");
  console.log(c("bold", "Removing MOP-AGENT service + nginx vhost…\n"));
  runSteps([
    { label: "Stop + disable service", cmd: "systemctl disable --now mop-agent 2>/dev/null || true" },
    { label: "Remove unit", cmd: "rm -f /etc/systemd/system/mop-agent.service && systemctl daemon-reload" },
    { label: "Remove nginx vhost", cmd: `rm -f ${nginxRemove} && (systemctl reload nginx || true)` },
  ]);
  if (args.purge) {
    console.log(c("red", "  --purge: removing data + database"));
    runSteps([{ label: "Drop data dir", cmd: `rm -rf ${APP_DIR}/data` }]);
  } else {
    console.log(c("gray", "  (data + database kept; pass --purge to remove)"));
  }
  console.log(c("green", "\n✓ uninstalled\n"));
}

// ---- helpers -----------------------------------------------------------

function writeConf(path, content) {
  if (DRY) {
    console.log(c("gray", `  [dry-run] write ${path}:`));
    console.log(c("gray", content.split("\n").map((l) => "    " + l).join("\n")));
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(c("green", `  ✓ wrote ${path}`));
}

function randomToken(n) {
  const b = Buffer.alloc(Math.ceil(n / 2));
  for (let i = 0; i < b.length; i += 1) b[i] = Math.floor(Math.random() * 256);
  return b.toString("hex").slice(0, n);
}

async function tui() {
  banner();
  if (!supportedLinux()) return;
  if (DRY) console.log(c("yellow", "  Running in DRY-RUN (no changes). Re-run as root to apply.\n"));
  const rl = createInterface({ input, output });
  const menu = [
    ["1", "install", "Install system deps (PostgreSQL, nginx, certbot)"],
    ["2", "setup", "Configure domain, DB, SSL, systemd service"],
    ["3", "status", "Show service health"],
    ["4", "update", "Update to latest + restart"],
    ["5", "uninstall", "Remove service + nginx vhost"],
    ["q", "quit", "Exit"],
  ];
  for (const [k, , desc] of menu) console.log(`  ${c("cyan", k)}  ${desc}`);
  const choice = (await rl.question(c("bold", "\n  Select: "))).trim().toLowerCase();
  rl.close();
  const picked = menu.find((m) => m[0] === choice || m[1] === choice);
  if (!picked || picked[1] === "quit") return;
  await dispatch(picked[1]);
}

async function dispatch(cmd) {
  switch (cmd) {
    case "install": return cmdInstall();
    case "setup": return cmdSetup();
    case "update": return cmdUpdate();
    case "status": case "doctor": return cmdStatus();
    case "uninstall": case "delete": return cmdUninstall();
    default: return tui();
  }
}

const command = args._[0];
(command ? dispatch(command) : tui()).catch((e) => {
  console.error(c("red", e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
