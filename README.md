# MOP-AGENT

MOP-AGENT is a self-hosted AI brain and control plane for projects connected
through MOP-FLOW. It stores project memory, performs semantic recall and
consolidation, serves grounded chat, and can request approved actions from a
linked FLOW node.

> **Release status:** release candidate `mop-agent@0.1.16` contains the corrected VPS
> installer, one-time Admin setup/login flow, rich Assistant composer, Main Brain
> workspace, Obsidian-inspired Graph View, and encrypted Apps settings.
> The canonical installation command is exactly `npx mop-agent`.

## Current status

The application core through Fasa 7 foundation is implemented: reverse-WSS
project links, SQLite + sqlite-vec storage, Better Auth, semantic recall,
admin-only provider/user/app settings, consolidation, approval-based write-back,
Telegram and Discord adapters, skills, graph UI, execution backends, and user accounts.

The Assistant supports an autosizing prompt, image attachment/preview, voice input
(when the browser exposes Web Speech), and focused tool modes. Anthropic and
OpenRouter receive attached images as multimodal input. Brain treats Main Brain as
the primary knowledge layer and provides an interactive, searchable Graph View.
Telegram and Discord credentials can be stored encrypted under **Settings → Apps**;
their adapters become active after the service restarts. WhatsApp, Slack, and generic
webhook configuration can be stored there now while their runtime adapters remain planned.

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
`/opt/mop-agent`, installs its dependencies, and opens a four-action TUI:

- `Install` — installs nginx/Certbot and immediately continues through the
  complete domain, SQLite, HTTPS, and systemd setup.
- `Update` — migrates/builds/restarts MOP-AGENT, restores the installer-owned
  nginx vhost, reloads nginx, and verifies both local and domain proxy health.
- `Status` — reports service health and filesystem locations.
- `Delete` — removes the service and nginx configuration while preserving data
  unless purge is explicitly requested.

After installation, open the configured URL in a browser. The application flow
is intentionally separate from the server installer:

1. On a fresh database, `/setup` shows **Create Admin account** once.
2. Creating the first Admin also signs that account in.
3. After an Admin exists, `/setup` always redirects to `/login` when signed out
   or `/assistant` when already signed in.
4. Admin creates ready-to-login accounts under **Settings → Users**; there is
   no public invited-account signup link.
5. Successful setup/login opens the main **Assistant**. It can be used before
   any project is linked; Brain is the optional memory/project control surface.
6. Add OpenRouter or Anthropic under **Settings → Providers** for full model responses.
   Until then, the built-in offline echo provider confirms the chat pipeline.

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

MOP-AGENT never upgrades or modifies the system npm installation. npm and
Node.js upgrades remain an explicit server-administration task.

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

Open `http://localhost:3000`; it redirects to Admin setup on first run. Native Windows production service and HTTPS
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

Open `http://localhost:3000`; it redirects to Admin setup on first run. A launchd/Homebrew/nginx production
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
