/**
 * MOP-AGENT installer library — OS detection, config generators, and step plans.
 * Pure / side-effect-free where possible so it's unit-testable. Execution lives
 * in mop-agent.mjs (guarded by --dry-run / root check).
 */
import { readFileSync } from "node:fs";
import { platform } from "node:os";

export const colors = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
export const c = (name, v) => `${colors[name] ?? ""}${v}${colors.reset}`;

/** Detect platform + distro family + package manager commands. */
export function detectOS() {
  const plat = platform();
  if (plat !== "linux") {
    return { platform: plat, distro: plat, family: "unsupported", pkg: null };
  }
  let id = "", idLike = "", pretty = "Linux";
  try {
    const os = readFileSync("/etc/os-release", "utf8");
    id = (os.match(/^ID=(.*)$/m)?.[1] ?? "").replace(/"/g, "");
    idLike = (os.match(/^ID_LIKE=(.*)$/m)?.[1] ?? "").replace(/"/g, "");
    pretty = (os.match(/^PRETTY_NAME=(.*)$/m)?.[1] ?? "Linux").replace(/"/g, "");
  } catch {
    /* no /etc/os-release */
  }
  const hay = `${id} ${idLike}`.toLowerCase();
  let family = "unknown", pkg = null;
  if (/debian|ubuntu|kali|mint/.test(hay)) {
    family = "debian";
    pkg = { update: "apt-get update -y", install: "DEBIAN_FRONTEND=noninteractive apt-get install -y",
      pkgs: { postgres: "postgresql", nginx: "nginx", certbot: "certbot python3-certbot-nginx" },
      pgService: "postgresql", pgInit: null };
  } else if (/rhel|fedora|centos|rocky|alma/.test(hay)) {
    family = "rhel";
    pkg = { update: "dnf -y makecache", install: "dnf install -y",
      pkgs: { postgres: "postgresql-server", nginx: "nginx", certbot: "certbot python3-certbot-nginx" },
      pgService: "postgresql", pgInit: "postgresql-setup --initdb" };
  } else if (/arch|manjaro/.test(hay)) {
    family = "arch";
    pkg = { update: "pacman -Sy --noconfirm", install: "pacman -S --noconfirm",
      pkgs: { postgres: "postgresql", nginx: "nginx", certbot: "certbot certbot-nginx" },
      pgService: "postgresql", pgInit: "sudo -u postgres initdb -D /var/lib/postgres/data" };
  } else if (/alpine/.test(hay)) {
    family = "alpine";
    pkg = { update: "apk update", install: "apk add",
      pkgs: { postgres: "postgresql", nginx: "nginx", certbot: "certbot certbot-nginx" },
      pgService: "postgresql", pgInit: null };
  }
  return { platform: plat, distro: id || "linux", pretty, family, pkg };
}

/** nginx reverse-proxy vhost — includes WebSocket upgrade for /link + streaming chat. */
export function renderNginxVhost({ domain, port }) {
  return `# Managed by MOP-AGENT installer
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
`;
}

/** systemd unit — auto-start on boot + restart on crash. */
export function renderSystemdUnit({ appDir, port, user = "root", npm = "npm" }) {
  return `# Managed by MOP-AGENT installer
[Unit]
Description=MOP-AGENT (self-hostable AI brain)
After=network.target postgresql.service

[Service]
Type=simple
User=${user}
WorkingDirectory=${appDir}/apps/web
Environment=NODE_ENV=production
Environment=PORT=${port}
EnvironmentFile=${appDir}/apps/web/.env
ExecStart=${npm} run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;
}

/** Planned shell steps to install system deps (returned, not executed). */
export function planInstallDeps(os) {
  if (!os.pkg) return [];
  const p = os.pkg;
  const steps = [{ label: "Refresh package index", cmd: p.update }];
  steps.push({ label: "Install PostgreSQL", cmd: `${p.install} ${p.pkgs.postgres}` });
  if (p.pgInit) steps.push({ label: "Initialize PostgreSQL data dir", cmd: p.pgInit });
  steps.push({ label: "Enable + start PostgreSQL", cmd: `systemctl enable --now ${p.pgService}` });
  steps.push({ label: "Install nginx", cmd: `${p.install} ${p.pkgs.nginx}` });
  steps.push({ label: "Enable + start nginx", cmd: "systemctl enable --now nginx" });
  steps.push({ label: "Install certbot", cmd: `${p.install} ${p.pkgs.certbot}` });
  return steps;
}

/** Planned steps to create the Postgres role + database. */
export function planDbSetup({ dbName, dbUser, dbPass }) {
  const sql = [
    `CREATE USER ${dbUser} WITH PASSWORD '${dbPass}';`,
    `CREATE DATABASE ${dbName} OWNER ${dbUser};`,
  ].join(" ");
  return [
    { label: `Create DB role + database (${dbName})`, cmd: `sudo -u postgres psql -v ON_ERROR_STOP=0 -c "${sql}"` },
  ];
}

/** SSL via certbot with a fallback when :80 is busy. Returns ordered attempts. */
export function planSsl({ domain, email }) {
  const base = `certbot --nginx -d ${domain} --non-interactive --agree-tos -m ${email} --redirect`;
  return {
    primary: { label: "Obtain TLS cert (certbot --nginx)", cmd: base },
    // fallback: free :80, use standalone, then reload nginx
    fallback: [
      { label: "Stop nginx (free port 80)", cmd: "systemctl stop nginx" },
      { label: "Obtain cert (standalone)", cmd: `certbot certonly --standalone -d ${domain} --non-interactive --agree-tos -m ${email}` },
      { label: "Start nginx", cmd: "systemctl start nginx" },
    ],
  };
}

/** What is listening on :80 (for the fallback scan). */
export const PORT80_SCAN = "ss -ltnp 'sport = :80' 2>/dev/null || lsof -i :80 2>/dev/null || true";
