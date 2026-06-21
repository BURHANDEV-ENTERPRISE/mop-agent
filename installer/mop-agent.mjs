#!/usr/bin/env node
/**
 * MOP-AGENT installer / operator (TUI). Self-host with one command.
 *
 *   npx mop-agent            # interactive TUI
 *   npx mop-agent install    # dependencies + complete setup
 *   npx mop-agent update     # migrate + build + restart staged npm version
 *   npx mop-agent status     # health
 *   npx mop-agent delete     # remove service + nginx vhost (keeps data unless --purge)
 *
 * Run as a normal user. Privileged OS operations request sudo individually.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
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

function readRuntimeConfig() {
  const envPath = `${APP_DIR}/apps/web/.env`;
  if (!existsSync(envPath)) throw new Error(`Runtime environment is missing: ${envPath}`);
  const env = {};
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) continue;
    env[line.slice(0, at)] = line.slice(at + 1).replace(/^(['"])(.*)\1$/, "$2");
  }
  const port = env.PORT || "3000";
  if (!isValidPort(port)) throw new Error(`Invalid PORT in ${envPath}: ${port}`);
  let publicUrl;
  try {
    publicUrl = new URL(env.BETTER_AUTH_URL || `http://localhost:${port}`);
  } catch {
    throw new Error(`Invalid BETTER_AUTH_URL in ${envPath}`);
  }
  return { env, port, publicUrl };
}

/** Restore the installer-owned vhost after every update, including TLS. */
function reconcileNginx() {
  const os = detectOS();
  const { port, publicUrl } = readRuntimeConfig();
  const domain = publicUrl.hostname;
  if (!isValidDomain(domain) && domain !== "localhost") {
    throw new Error(`Invalid domain in BETTER_AUTH_URL: ${domain}`);
  }
  const nginx = nginxPaths(os.family);
  const certDir = `/etc/letsencrypt/live/${domain}`;
  const hasTls = publicUrl.protocol === "https:" && existsSync(`${certDir}/fullchain.pem`) && existsSync(`${certDir}/privkey.pem`);
  const vhost = hasTls ? renderNginxTlsVhost({ domain, port }) : renderNginxVhost({ domain, port });

  console.log(c("cyan", "▸ Restore nginx reverse proxy"));
  writeConf(nginx.conf, vhost, { privileged: true });
  runSteps([
    ...(nginx.enabled ? [{ label: "Enable nginx vhost", cmd: `ln -sf ${nginx.conf} ${nginx.enabled}` }] : []),
    { label: "Verify nginx configuration", cmd: "nginx -t" },
    { label: "Enable + start nginx", cmd: "systemctl enable --now nginx" },
    { label: "Reload nginx", cmd: "systemctl reload nginx" },
    { label: "Verify local application", cmd: `curl --fail --silent --show-error --max-time 15 ${q(`http://127.0.0.1:${port}/api/setup/status`)} >/dev/null` },
    {
      label: "Verify domain reverse proxy",
      cmd: `curl --fail --silent --show-error --max-time 15 --resolve ${q(`${domain}:${hasTls ? "443" : "80"}:127.0.0.1`)} ${q(`${hasTls ? "https" : "http"}://${domain}/api/setup/status`)} >/dev/null`,
    },
  ], { privileged: true });
  return { domain, port, protocol: hasTls ? "https" : "http" };
}

// ---- commands ----------------------------------------------------------

async function cmdInstall() {
  banner();
  const os = detectOS();
  if (!printInstallLocations(os)) return;
  console.log(c("bold", "Installing system dependencies (nginx and Certbot)…\n"));
  runSteps(planInstallDeps(os), { privileged: true });
  console.log(c("green", "\n✓ dependencies installed. Continuing to application setup…\n"));
  await cmdSetup({ continuation: true });
}

async function cmdSetup({ continuation = false } = {}) {
  if (!continuation) banner();
  const os = detectOS();
  if (!continuation && !printInstallLocations(os)) return;
  const rl = createInterface({ input, output });
  const ask = async (q, def) => (await rl.question(c("cyan", `  ${q}${def ? c("gray", ` [${def}]`) : ""}: `))).trim() || def || "";

  const deployMode = (await ask("Deployment mode (public/local)", "public")).toLowerCase();
  if (!new Set(["public", "local"]).has(deployMode)) {
    rl.close();
    throw new Error(`Invalid deployment mode: ${deployMode}. Use public or local.`);
  }
  const domain = await ask(
    deployMode === "public" ? "Public domain (e.g. agent.mydomain.com)" : "LAN hostname",
    deployMode === "local" ? "mop-agent.local" : "",
  );
  const port = await ask("App port", "3000");
  const wantSsl = deployMode === "public"
    ? (await ask("Obtain HTTPS cert now? (y/n)", "y")).toLowerCase().startsWith("y")
    : false;
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
    `MOP_AGENT_DEPLOY_MODE=${deployMode}`,
    `BETTER_AUTH_URL=${protocol}://${domain}`,
    `BETTER_AUTH_SECRET=${secret(48)}`,
    `MOP_AGENT_SECRET=${secret(64).replace(/[^0-9a-f]/g, "").padEnd(64, "0").slice(0, 64)}`,
    `MOP_AGENT_DATA_DIR=${APP_DIR}/data`,
    `MOP_AGENT_MODEL_CACHE=${APP_DIR}/data/models`,
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

  // 4) systemd — root installs get a dedicated locked-down service account.
  const serviceUser = isRoot
    ? ensureRootServiceUser(os)
    : process.env.USER || String(process.getuid?.() ?? "root");
  if (isRoot) {
    run(`mkdir -p ${q(`${APP_DIR}/data`)} && chown -R ${serviceUser}:${serviceUser} ${q(`${APP_DIR}/data`)} ${q(`${APP_DIR}/apps/web/.env`)}`);
  }
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

  console.log(c("green", `\n✓ ${deployMode} setup complete. Visit ${protocol}://${domain}/setup to create the owner.\n`));
  printInstallLocations(os);
}

function cmdUpdate() {
  banner();
  if (!printInstallLocations()) return;
  console.log(c("bold", "Updating MOP-AGENT…\n"));
  runSteps([
    // Close SQLite cleanly before migration/rebuild. In particular, this
    // prevents a root-run update leaving live WAL handles behind.
    { label: "Stop old service", cmd: "systemctl stop mop-agent", privileged: true, allowFailure: true },
    ...(!managedByNpx ? [{ label: "Pull latest", cmd: `cd ${q(APP_DIR)} && git pull --ff-only` }] : []),
    { label: "Install deps", cmd: `cd ${q(APP_DIR)} && npm ci` },
    { label: "Migrate SQLite", cmd: `cd ${q(`${APP_DIR}/apps/web`)} && npm run db:migrate` },
    ...(isRoot ? [{ label: "Repair runtime ownership", cmd: `chown -R mop-agent:mop-agent ${q(`${APP_DIR}/data`)}` }] : []),
    { label: "Remove stale Next.js build", cmd: `rm -rf ${q(`${APP_DIR}/apps/web/.next`)}` },
    { label: "Build", cmd: `cd ${q(`${APP_DIR}/apps/web`)} && npm run build` },
    { label: "Reload systemd", cmd: "systemctl daemon-reload", privileged: true },
    { label: "Start new service", cmd: "systemctl start mop-agent", privileged: true },
    { label: "Verify service", cmd: "sleep 2 && systemctl is-active --quiet mop-agent", privileged: true },
  ]);
  const proxy = reconcileNginx();
  console.log(c("green", `\n✓ updated and verified through ${proxy.protocol}://${proxy.domain}\n`));
}

function cmdStatus() {
  banner();
  if (!printInstallLocations()) return;
  let runtime;
  try { runtime = readRuntimeConfig(); } catch { runtime = null; }
  const os = detectOS();
  const nginx = nginxPaths(os.family);
  const checks = [
    ["service", "systemctl is-active mop-agent 2>/dev/null || echo inactive"],
    ["nginx", "systemctl is-active nginx 2>/dev/null || echo inactive"],
    ["nginx conf", `test -f ${q(nginx.conf)} && echo present || echo missing`],
    ...(nginx.enabled ? [["nginx link", `test -L ${q(nginx.enabled)} && echo present || echo missing`]] : []),
    [".env", existsSync(`${APP_DIR}/apps/web/.env`) ? "echo present" : "echo missing"],
    ...(runtime ? [["local app", `curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 ${q(`http://127.0.0.1:${runtime.port}/api/setup/status`)} || echo failed`]] : []),
  ];
  for (const [label, cmd] of checks) {
    const r = run(cmd, { capture: true });
    const val = DRY ? "(dry-run)" : r.stdout.trim();
    console.log(`  ${label.padEnd(10)} ${val === "active" || val === "present" || val === "200" ? c("green", val) : c("yellow", val)}`);
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

function ensureRootServiceUser(os) {
  const user = "mop-agent";
  const create = os.family === "alpine"
    ? `id -u ${user} >/dev/null 2>&1 || adduser -S -H -h ${q(APP_DIR)} -s /sbin/nologin ${user}`
    : `id -u ${user} >/dev/null 2>&1 || useradd --system --home-dir ${q(APP_DIR)} --shell /usr/sbin/nologin ${user}`;
  run(create);
  return user;
}

async function tui() {
  banner();
  if (!supportedLinux()) return;
  if (DRY) console.log(c("yellow", "  Running in DRY-RUN (no changes).\n"));
  const rl = createInterface({ input, output });
  const menu = [
    ["1", "install", "Install (dependencies + complete setup)"],
    ["2", "update", "Update MOP-AGENT + restart"],
    ["3", "status", "Show service health"],
    ["4", "delete", "Delete service + nginx config"],
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
