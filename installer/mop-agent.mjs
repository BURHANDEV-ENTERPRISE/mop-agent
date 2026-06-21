#!/usr/bin/env node
/**
 * MOP-AGENT installer / operator (TUI). Self-host with one command.
 *
 *   npx mop-agent            # interactive TUI
 *   npx mop-agent install    # install system deps (nginx/certbot)
 *   npx mop-agent setup      # domain / SQLite / ssl / systemd
 *   npx mop-agent update     # migrate + build + restart staged npm version
 *   npx mop-agent status     # health
 *   npx mop-agent uninstall  # remove service + nginx vhost (keeps data unless --purge)
 *
 * Run as a normal user. Privileged OS operations request sudo individually.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  c, detectOS, renderNginxVhost, renderNginxTlsVhost, renderSystemdUnit,
  planInstallDeps, planSsl, PORT80_SCAN, isValidDomain, isValidEmail, isValidPort,
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
const DRY = !!args["dry-run"];
const managedByNpx = process.env.MOP_AGENT_MANAGED_BY_NPX === "1";

function banner() {
  console.log(c("cyan", c("bold", "\n  🧠 MOP-AGENT installer")));
  const os = detectOS();
  console.log(c("gray", `  ${os.pretty} · family=${os.family} · ${isRoot ? "root" : "normal user (sudo on demand)"}`));
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

/** Run a shell command, requesting sudo only for a privileged OS operation. */
function run(cmd, { capture = false, privileged = false, allowFailure = false } = {}) {
  const sudo = privileged && !isRoot;
  const shown = `${sudo ? "sudo " : ""}${cmd}`;
  if (DRY) { console.log(c("gray", `  [dry-run] $ ${shown}`)); return { code: 0, stdout: "" }; }
  console.log(c("dim", `  $ ${shown}`));
  const executable = sudo ? "sudo" : "sh";
  const commandArgs = sudo ? ["sh", "-c", cmd] : ["-c", cmd];
  const r = spawnSync(executable, commandArgs, {
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (!capture && r.status !== 0) console.log(c("red", `  ✗ exited ${r.status}`));
  const code = r.status ?? 1;
  if (code !== 0 && !allowFailure) throw new Error(`Command failed (${code}): ${shown}`);
  return { code, stdout: r.stdout ?? "" };
}

function runSteps(steps, options = {}) {
  for (const s of steps) {
    console.log(c("cyan", `▸ ${s.label}`));
    run(s.cmd, { ...options, ...s });
  }
}

function q(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

// ---- commands ----------------------------------------------------------

function cmdInstall() {
  banner();
  const os = detectOS();
  if (!printInstallLocations(os)) return;
  console.log(c("bold", "Installing system dependencies (nginx and Certbot)…\n"));
  runSteps(planInstallDeps(os), { privileged: true });
  console.log(c("green", "\n✓ dependencies step complete. Next: mop-agent setup\n"));
}

async function cmdSetup() {
  banner();
  const os = detectOS();
  if (!printInstallLocations(os)) return;
  const rl = createInterface({ input, output });
  const ask = async (q, def) => (await rl.question(c("cyan", `  ${q}${def ? c("gray", ` [${def}]`) : ""}: `))).trim() || def || "";

  const domain = await ask("Domain/hostname (e.g. agent.mydomain.com or mop-agent.local)");
  const port = await ask("App port", "3000");
  const wantSsl = (await ask("Obtain HTTPS cert now? (y/n)", "y")).toLowerCase().startsWith("y");
  const email = wantSsl
    ? await ask("Email for Let's Encrypt", domain ? `admin@${domain.split(".").slice(-2).join(".")}` : "")
    : "";
  rl.close();

  if (!isValidDomain(domain)) throw new Error(`Invalid domain: ${domain || "(empty)"}`);
  if (!isValidPort(port)) throw new Error(`Invalid port: ${port}`);
  if (wantSsl && !isValidEmail(email)) throw new Error(`Invalid Let's Encrypt email: ${email || "(empty)"}`);

  // 1) .env
  const secret = (n) => randomToken(n);
  const protocol = wantSsl ? "https" : "http";
  const env = [
    `PORT=${port}`,
    `BETTER_AUTH_URL=${protocol}://${domain}`,
    `BETTER_AUTH_SECRET=${secret(48)}`,
    `MOP_AGENT_SECRET=${secret(64).replace(/[^0-9a-f]/g, "").padEnd(64, "0").slice(0, 64)}`,
    `MOP_AGENT_DATA_DIR=${APP_DIR}/data`,
    `MOP_AGENT_CONSOLIDATE_CRON=0 3 * * *`,
  ].join("\n") + "\n";
  console.log(c("cyan", "\n▸ Write apps/web/.env"));
  if (DRY) console.log(c("gray", env.split("\n").map((l) => "    " + l).join("\n")));
  else if (existsSync(`${APP_DIR}/apps/web/.env`) && !args.force) {
    console.log(c("yellow", "  Existing .env preserved (pass --force to regenerate secrets)."));
  } else {
    writeFileSync(`${APP_DIR}/apps/web/.env`, env, { mode: 0o600 });
    chmodSync(`${APP_DIR}/apps/web/.env`, 0o600);
    console.log(c("green", "  ✓ wrote .env (mode 0600)"));
  }

  // 2) SQLite migration + production build
  runSteps([
    { label: "Install deps", cmd: `cd ${q(APP_DIR)} && npm ci` },
    { label: "Migrate SQLite", cmd: `cd ${q(`${APP_DIR}/apps/web`)} && npm run db:migrate` },
    { label: "Build", cmd: `cd ${q(`${APP_DIR}/apps/web`)} && npm run build` },
  ]);

  // 3) nginx vhost
  const vhost = renderNginxVhost({ domain, port });
  const nginx = nginxPaths(os.family);
  const vhostPath = nginx.conf;
  console.log(c("cyan", "▸ nginx reverse proxy"));
  writeConf(vhostPath, vhost, { privileged: true });
  runSteps([
    ...(nginx.enabled
      ? [{ label: "Enable site", cmd: `ln -sf ${vhostPath} ${nginx.enabled}` }]
      : []),
    { label: "Test nginx config", cmd: "nginx -t" },
    { label: "Reload nginx", cmd: "systemctl reload nginx" },
  ], { privileged: true });

  // 4) systemd — run the app as the invoking user, never as root by default.
  const serviceUser = isRoot ? process.env.SUDO_USER || "root" : process.env.USER || String(process.getuid?.() ?? "root");
  const unit = renderSystemdUnit({ appDir: APP_DIR, port, user: serviceUser });
  console.log(c("cyan", "▸ systemd service (auto-restart on boot)"));
  writeConf("/etc/systemd/system/mop-agent.service", unit, { privileged: true });
  runSteps([
    { label: "Reload systemd", cmd: "systemctl daemon-reload" },
    { label: "Enable + start MOP-AGENT", cmd: "systemctl enable --now mop-agent" },
  ], { privileged: true });

  // 5) SSL with a complete standalone fallback nginx configuration.
  if (wantSsl && domain) {
    console.log(c("cyan", "▸ HTTPS (Let's Encrypt)"));
    const ssl = planSsl({ domain, email });
    const { code } = run(ssl.primary.cmd, { privileged: true, allowFailure: true });
    if (code !== 0 && !DRY) {
      console.log(c("yellow", "  certbot --nginx failed. Scanning :80 and retrying standalone…"));
      const scan = run(PORT80_SCAN, { capture: true, privileged: true });
      if (scan.stdout.trim()) console.log(c("gray", "  port 80 in use by:\n" + scan.stdout.trim()));
      runSteps(ssl.fallback, { privileged: true });
      writeConf(vhostPath, renderNginxTlsVhost({ domain, port }), { privileged: true });
      runSteps([
        { label: "Test TLS nginx config", cmd: "nginx -t" },
        { label: "Reload nginx with TLS", cmd: "systemctl reload nginx" },
      ], { privileged: true });
    }
  }

  console.log(c("green", `\n✓ Setup complete. Visit ${protocol}://${domain}/setup to create the owner.\n`));
  printInstallLocations(os);
}

function cmdUpdate() {
  banner();
  if (!printInstallLocations()) return;
  console.log(c("bold", "Updating MOP-AGENT…\n"));
  runSteps([
    ...(!managedByNpx ? [{ label: "Pull latest", cmd: `cd ${q(APP_DIR)} && git pull --ff-only` }] : []),
    { label: "Install deps", cmd: `cd ${q(APP_DIR)} && npm ci` },
    { label: "Migrate SQLite", cmd: `cd ${q(`${APP_DIR}/apps/web`)} && npm run db:migrate` },
    { label: "Build", cmd: `cd ${q(`${APP_DIR}/apps/web`)} && npm run build` },
    { label: "Restart service", cmd: "systemctl restart mop-agent", privileged: true },
  ]);
  console.log(c("green", "\n✓ updated\n"));
}

function cmdStatus() {
  banner();
  if (!printInstallLocations()) return;
  const checks = [
    ["service", "systemctl is-active mop-agent 2>/dev/null || echo inactive"],
    ["nginx", "systemctl is-active nginx 2>/dev/null || echo inactive"],
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
  ], { privileged: true });
  if (args.purge) {
    console.log(c("red", "  --purge: removing SQLite brain data"));
    runSteps([{ label: "Drop data dir", cmd: `rm -rf ${q(`${APP_DIR}/data`)}` }]);
  } else {
    console.log(c("gray", "  (SQLite brain data kept; pass --purge to remove)"));
  }
  console.log(c("green", "\n✓ uninstalled\n"));
}

// ---- helpers -----------------------------------------------------------

function writeConf(path, content, { privileged = false } = {}) {
  if (DRY) {
    console.log(c("gray", `  [dry-run] write ${path}:`));
    console.log(c("gray", content.split("\n").map((l) => "    " + l).join("\n")));
    return;
  }
  if (privileged && !isRoot) {
    run(`mkdir -p ${q(dirname(path))}`, { privileged: true });
    const r = spawnSync("sudo", ["tee", path], {
      input: content,
      stdio: ["pipe", "ignore", "inherit"],
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`Unable to write ${path} with sudo.`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  console.log(c("green", `  ✓ wrote ${path}`));
}

function randomToken(n) {
  return randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);
}

async function tui() {
  banner();
  if (!supportedLinux()) return;
  if (DRY) console.log(c("yellow", "  Running in DRY-RUN (no changes).\n"));
  const rl = createInterface({ input, output });
  const menu = [
    ["1", "install", "Install system deps (nginx and Certbot)"],
    ["2", "setup", "Configure domain, SQLite, SSL, systemd service"],
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
  return tui();
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
