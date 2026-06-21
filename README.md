# MOP-AGENT

MOP-AGENT is a self-hosted AI brain and control plane for projects connected
through MOP-FLOW. It stores project memory, performs semantic recall and
consolidation, serves grounded chat, and can request approved actions from a
linked FLOW node.

> **Release status:** npm package `mop-agent@0.1.1` contains the root/VPS
> installer fix. After publishing 0.1.1, the canonical installation command is
> exactly `npx mop-agent`.

## Current status

The application core through Fasa 7 foundation is implemented: reverse-WSS
project links, SQLite + sqlite-vec storage, Better Auth, semantic recall,
provider settings, consolidation, approval-based write-back, Telegram and
Discord adapters, skills, graph UI, execution backends, and team invites.

The npm bootstrap stages the packaged application durably at `/opt/mop-agent`,
uses the proven SQLite + sqlite-vec backend, and asks for sudo only for specific
OS operations. Package, bootstrap, installer, and smoke verification pass
locally. A clean VPS installation remains the final production verification.

## Platform support

| Platform | Current support | Recommended use |
| --- | --- | --- |
| Debian, Ubuntu, Kali, Mint | Installer candidate | Linux VPS production target |
| Fedora, RHEL, Rocky, Alma | Installer candidate; paths need live verification | Linux VPS production target |
| Arch, Manjaro, Alpine | Installer candidate; paths need live verification | Advanced/test use |
| Windows | Native installer not available | Use WSL2 Ubuntu, or run development mode natively |
| macOS | Production installer not available | Run development mode; deploy production on Linux |

The automated installer depends on Linux facilities such as `systemd`, nginx,
Certbot, and standard Linux filesystem paths. Native Windows services/IIS and
macOS launchd/Homebrew automation have not been implemented.

## Linux installation

Prerequisites:

- A Linux VPS with root/sudo access
- Node.js 20 or newer and npm
- A domain with an `A`/`AAAA` record pointing to the server
- Inbound ports 80 and 443 allowed by the firewall/security group

Run as either your normal sudo user or directly as root on a VPS:

```bash
npx mop-agent
```

The first run copies the npm-packaged runtime from the temporary npx cache into
`/opt/mop-agent`, installs its dependencies, and opens the TUI. Choose
`install` to install nginx/Certbot, then `setup` to configure the domain,
SQLite database, HTTPS, and systemd service. The menu remains open between
steps.

During `setup`, choose one deployment mode:

- `public` — enter a public domain and optionally obtain a Let's Encrypt HTTPS
  certificate. Use this for an internet-facing server with public IP/DNS.
- `local` — use a LAN hostname such as `mop-agent.local`; the installer uses
  HTTP and does not invoke Certbot.

For a LAN-only test, map the selected hostname to the server IP in your router
DNS or client `/etc/hosts`. Let's Encrypt public mode requires a real public
domain and reachable ports 80/443.

When launched by a normal user, the installer requests `sudo` only when it
needs to write under `/opt` or `/etc`, install OS packages, or control
nginx/systemd. When launched as root, it creates a locked-down `mop-agent`
system account and runs the web service under that account—not as root.

During the `install` step, MOP-AGENT checks the installed npm version. If a
newer npm is available it displays the version and Node.js requirement, then
asks before running the global npm update. Set `MOP_AGENT_SKIP_NPM_UPDATE=1` to
skip this check.

Subsequent operations use the same command:

```bash
npx mop-agent status
npx mop-agent update
npx mop-agent uninstall
```

### Linux filesystem map

MOP-AGENT is a long-running Node.js service behind nginx, not a static website,
so it uses `/opt/mop-agent` rather than `/var/www` for application code.

| Purpose | Debian/Ubuntu | RHEL/Arch/Alpine |
| --- | --- | --- |
| Application source | `/opt/mop-agent` | `/opt/mop-agent` |
| Environment file | `/opt/mop-agent/apps/web/.env` | same |
| Brain database/data (current) | `/opt/mop-agent/data` | same |
| nginx vhost | `/etc/nginx/sites-available/mop-agent.conf` | `/etc/nginx/conf.d/mop-agent.conf` |
| nginx enable link | `/etc/nginx/sites-enabled/mop-agent.conf` | not needed (`conf.d` is included directly) |
| systemd unit | `/etc/systemd/system/mop-agent.service` | same |
| TLS certificates | `/etc/letsencrypt/live/<domain>/` | same |
| Service logs | `journalctl -u mop-agent -f` | same |
| Root-install service account | `mop-agent` | `mop-agent` |

`MOP_AGENT_DIR` can override `/opt/mop-agent`. Updates preserve
`apps/web/.env` and `data/`; uninstall preserves SQLite brain data unless the
user explicitly passes `--purge`.

Useful operations after setup:

```bash
sudo systemctl status mop-agent
sudo journalctl -u mop-agent -f
sudo nginx -t
sudo systemctl reload nginx
```

## Windows

### Recommended: WSL2

Install Ubuntu under WSL2, enable systemd in WSL, then run `npx mop-agent`
inside the WSL terminal. All paths such as `/opt/mop-agent` and `/etc/nginx/...`
exist inside the WSL filesystem, not under `C:\Program Files`.

### Native Windows development

PowerShell can run the application for development, but the Linux installer,
nginx, Certbot, and systemd steps do not apply:

```powershell
git clone https://github.com/BURHANDEV-ENTERPRISE/mop-agent.git
cd mop-agent
npm ci
Copy-Item apps/web/.env.example apps/web/.env
npm run typecheck
npm run dev:web
```

Open `http://localhost:3000/setup`. Native Windows production service and HTTPS
automation remain TODO; do not use `sudo` in PowerShell or Command Prompt.

## macOS

macOS currently supports development mode only:

```bash
git clone https://github.com/BURHANDEV-ENTERPRISE/mop-agent.git
cd mop-agent
npm ci
cp apps/web/.env.example apps/web/.env
npm run typecheck
npm run dev:web
```

Open `http://localhost:3000/setup`. A launchd/Homebrew/nginx production
installer is not implemented; use a supported Linux VPS for production.

## Development

```bash
git clone https://github.com/BURHANDEV-ENTERPRISE/mop-agent.git
cd mop-agent
npm ci
cp apps/web/.env.example apps/web/.env
npm run typecheck
npm run dev:web
```

Set at least `BETTER_AUTH_SECRET` and `MOP_AGENT_SECRET` in
`apps/web/.env`. With no Anthropic/OpenRouter key, chat falls back to the local
offline echo provider.

Repository layout:

```text
mop-agent/
├── apps/web/                 # Next.js UI, API, auth, brain, WS gateway
├── packages/link-protocol/   # shared AGENT <-> FLOW schemas
├── packages/flow-connector/  # reverse-WSS MOP-FLOW connector
├── installer/                # installer TUI and platform plans
├── scripts/                  # smoke tests
└── data/                     # runtime SQLite/brain data (gitignored)
```

## Verification

```bash
npm run typecheck
npx tsx scripts/smoke-installer.mts
# Run the remaining smoke-*.mts scripts before a release.
```

The complete npm publication checklist and installer acceptance criteria are in
[`TODO.md`](TODO.md).
