# MOP-AGENT

MOP-AGENT is a self-hosted AI brain and control plane for projects connected
through MOP-FLOW. It stores project memory, performs semantic recall and
consolidation, serves grounded chat, and can request approved actions from a
linked FLOW node.

> **Pre-release warning:** MOP-AGENT is not published on npm yet. Do not use
> `npx mop-agent` for a production installation until the npm-readiness items in
> [`TODO.md`](TODO.md) are complete. The current stable installation path is a
> source checkout for development and testing.

## Current status

The application core through Fasa 7 foundation is implemented: reverse-WSS
project links, SQLite + sqlite-vec storage, Better Auth, semantic recall,
provider settings, consolidation, approval-based write-back, Telegram and
Discord adapters, skills, graph UI, execution backends, and team invites.

The production installer exists, but is still **release-candidate quality**.
Known blockers include durable `npx` installation, the PostgreSQL/SQLite
mismatch, non-root service ownership, SSL fallback completion, and live VPS
verification. See [`TODO.md`](TODO.md) for the release gate.

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

## Linux production installation (after release gate)

Prerequisites:

- A Linux VPS with root/sudo access
- Node.js 20 or newer, npm, and Git
- A domain with an `A`/`AAAA` record pointing to the server
- Inbound ports 80 and 443 allowed by the firewall/security group

The intended one-command flows are:

```bash
# Option A: clone the durable installation into /opt/mop-agent
curl -fsSL https://raw.githubusercontent.com/BURHANDEV-ENTERPRISE/mop-agent/main/install.sh | sudo bash

# Option B: after the package is published and the npx bootstrap is fixed
sudo --preserve-env=PATH npx --yes mop-agent@latest
```

The TUI separates system dependency installation from application setup. Run
both `install` and `setup` when prompted. Until the P0 installer tasks are
complete, treat these commands as testing instructions, not a production SLA.

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

`MOP_AGENT_DIR` can override `/opt/mop-agent` for the curl installer. The final
production layout may move mutable data to `/var/lib/mop-agent` and secrets to
`/etc/mop-agent/mop-agent.env`; that decision is a P0 release task and must be
implemented, migrated, tested, and reflected here before npm publication.

Useful operations after setup:

```bash
sudo systemctl status mop-agent
sudo journalctl -u mop-agent -f
sudo nginx -t
sudo systemctl reload nginx
```

## Windows

### Recommended: WSL2

Install Ubuntu under WSL2, enable systemd in WSL, then follow the Linux flow
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
