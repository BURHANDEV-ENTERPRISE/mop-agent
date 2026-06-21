# MOP-AGENT — Release Handoff

> Updated 2026-06-21 after the npm packaging fix. This file records what is
> ready, the exact publish sequence, and the remaining production hardening.

## Current release snapshot

- Package: `mop-agent@0.1.10` (`0.1.1` attempted an unsafe npm self-update)
- Canonical command: exactly `npx mop-agent`
- npm user on this machine: `moonwiraja`
- npm registry status: publish `0.1.10` after the release checks below
- Tarball: 96 runtime files, about 162 kB compressed / 592 kB unpacked
- Runtime backend: SQLite + sqlite-vec (PostgreSQL is not installed)
- Default durable location: `/opt/mop-agent`
- The npm package contains the application runtime; it does not clone or depend
  on access to the private GitHub repository

## Completed for npm 0.1.x

- [x] Rename root package from `mop-agent-monorepo` to `mop-agent`.
- [x] Remove `private: true`; add version, metadata, repository, keywords,
  public publish config, controlled `files`, and the correct bin entry.
- [x] Add `installer/bootstrap.mjs` as the npm executable.
- [x] Make the bootstrap copy the packaged runtime out of transient npx cache
  into `/opt/mop-agent` or `MOP_AGENT_DIR`.
- [x] Preserve `apps/web/.env` and `data/` when staging an update.
- [x] Refuse unsafe install destinations; accept normal sudo users and root VPS
  shells while ensuring the web service itself does not run as root.
- [x] Request sudo only for `/opt`, `/etc`, OS packages, nginx, Certbot, and
  systemd operations.
- [x] Include `npm-shrinkwrap.json` for reproducible application dependencies.
- [x] Add `--help`, `--version`, `--self-test`, and `--dry-run` behavior.
- [x] Select SQLite for 0.1.0 and remove unused PostgreSQL installation,
  prompts, status, and systemd dependency.
- [x] Make installer commands fail fast instead of reporting false success.
- [x] Validate domain, email, and port inputs.
- [x] Support LAN testing with a local hostname and HTTP when HTTPS is declined;
  only request a Let's Encrypt email when HTTPS is enabled.
- [x] Ask explicitly whether the installation is `public` or `local`; public
  mode offers domain/Let's Encrypt while local mode defaults to a LAN hostname
  and HTTP.
- [x] Generate secrets with `crypto.randomBytes`; write `.env` as mode `0600`
  and preserve it unless `setup --force` is explicitly used.
- [x] Keep the TUI open after each selected operation.
- [x] Use distro-specific nginx locations.
- [x] Finish standalone Certbot fallback with a TLS nginx vhost, HTTP redirect,
  config test, and reload.
- [x] Run the service as the invoking normal user instead of root in the normal
  `npx mop-agent` path.
- [x] Document Linux, Windows WSL2/native development, macOS development, and
  every installed filesystem location in README.
- [x] Add `prepublishOnly` release checks.
- [x] Patch 0.1.1: allow the common root VPS invocation while creating a
  dedicated non-root `mop-agent` system account for the running service.
- [x] Patch 0.1.2: remove global npm self-update after the real server test
  showed that mutating npm from inside npx can corrupt the active npm install.
- [x] Patch 0.1.2: reduce the TUI to Install, Update, Status, Delete; Install
  performs dependencies and complete setup in one continuous flow.
- [x] Patch 0.1.3: replace the stale Fasa 1 root page with a server-side
  Admin setup/login gate and authenticated page guards.
- [x] Patch 0.1.3: make Assistant the product home; allow chat without a linked
  project while retaining optional all-project or project-specific memory.
- [x] Patch 0.1.3: redirect a newly-created Admin directly into Assistant and
  document the first-run browser journey.
- [x] Patch 0.1.4: run idempotent app + Better Auth migrations before the web
  service accepts traffic, preventing first Admin signup from hitting missing tables.
- [x] Patch 0.1.4: stop the service during update, repair SQLite ownership after
  root migrations, clear stale `.next`, rebuild, start, and verify systemd.
- [x] Patch 0.1.4: leave the requested left-side setup panel empty.
- [x] Patch 0.1.5: add the supplied transparent SVG as the centered setup logo
  and application favicon; adopt the red/green/cream visual palette.
- [x] Patch 0.1.5: remove the expected unauthenticated `/api/me` request from
  setup by returning session state through `/api/setup/status` with HTTP 200.
- [x] Patch 0.1.6: add a global retro pixel grid, CRT scanlines, dithered
  vignette, and stepped pixel interactions across every application page.
- [x] Patch 0.1.7: force all cookie-protected routes out of the Next.js cache,
  return private/no-store setup status, and verify session cookies before redirect.
- [x] Patch 0.1.8: add a shared retro navbar/sidebar shell across Assistant,
  Brain, project chat, and Settings using the favicon logo.
- [x] Patch 0.1.8: consolidate Provider and Team into an admin-only Settings
  experience with Providers and Users sections; retain `/team` as a redirect.
- [x] Patch 0.1.9: make `/setup` a one-time Admin-only bootstrap route, add a
  dedicated `/login`, and remove the invited-account signup switch.
- [x] Patch 0.1.9: let Admin create ready-to-login accounts directly in Users.
- [x] Patch 0.1.9: restore, validate, reload, and locally probe the nginx domain
  reverse proxy after every Update.
- [x] Give the service account ownership of SQLite/model data and the mode-0600
  environment file; place the local model cache below the data directory.
- [x] Verify the real local tarball executable:
  - `--version` reports `0.1.0`
  - bootstrap self-test passes
  - tarball stages to a clean temporary durable directory
  - `npm ci` installs all workspaces from the shrinkwrap
  - staged `status --dry-run` runs successfully

## Publish sequence

Run from the repository root:

```bash
npm whoami
npm run release:check
npm pack --dry-run
npm publish
npm view mop-agent version
npx mop-agent --version
```

Expected publish identity: `mop-agent@0.1.10`. Stop if npm shows
`mop-agent-monorepo`, more than the controlled runtime files, an `.env`, a
database, cache, test fixtures, or any secret.

After publishing, test the registry artifact without relying on the checkout:

```bash
cd /tmp
npx mop-agent --version
MOP_AGENT_DIR="$HOME/mop-agent-registry-test" npx mop-agent status --dry-run
```

## Production verification still recommended

- [ ] Fresh Ubuntu VPS: `npx mop-agent` as a normal sudo user.
- [ ] Install → setup → owner signup → provider configuration.
- [ ] Reboot and confirm systemd, nginx, SQLite, and login survive.
- [ ] Link a real MOP-FLOW project and verify reverse-WSS, recall/chat, and
  approval write-back.
- [ ] Verify a real DNS domain, Certbot issuance, HTTPS, WebSocket traffic, and
  automatic certificate renewal.
- [ ] Run `npx mop-agent update`, then confirm `.env` and brain data are intact.
- [ ] Test uninstall with data preservation and `uninstall --purge` separately.
- [ ] Verify RHEL, Arch, and Alpine before removing their experimental status.

## Further hardening

- [ ] Add automatic preflight for DNS and ports 80/443 before Certbot.
- [ ] Add local/public HTTP health checks before printing setup success.
- [ ] Add backup/restore commands and rollback around failed update/migration.
- [ ] Add destructive confirmation and automatic backup for `--purge`.
- [ ] Consider a locked system account plus `/var/lib/mop-agent` and
  `/etc/mop-agent` migration for a later major deployment layout.
- [ ] Add native Windows service and macOS launchd support only if required;
  current production recommendation is Linux/WSL2.

## Application backlog

- [ ] Wire FLOW `hasValidSession` to the MOP-FLOW v1.2 session model.
- [ ] Implement `workflow_next` when merging connector changes into MOP-FLOW.
- [ ] Complete the full route-authorization audit.
- [ ] Design multi-instance/cloud sync.
- [ ] Add live Telegram and Discord token tests.
- [ ] Add voice/additional channels after deployment is stable.
- [ ] Add observability, retention controls, exports, and disaster recovery.

## Implemented application foundation

- [x] Fasa 0–3: monorepo, protocol, reverse-WSS, SQLite/sqlite-vec, Better Auth,
  provider hub, grounded recall and chat.
- [x] Fasa 3.5: CLI and scheduled consolidation.
- [x] Fasa 4–4.5: consolidation, approval write-back, Telegram and Discord.
- [x] Fasa 5: skills/procedural recall and graph UI.
- [x] Fasa 6: host/docker/ssh execution with capability and approval guards.
- [x] Fasa 7 foundation: roles, invites, Team UI, and sensitive-route gates.
- [x] Local MiniLM embeddings and encrypted provider configuration.
- [x] FLOW artifact, workflow-status, and project-context tools.

## UI fixes requested (do these next — for Codex)

Palette: ink `#2d4a3e`, cream `#fef9e1`/`#fffdf2`, accent red `#742220`, muted `#7f8da2`.

- [ ] **Assistant toolbar text invisible** (`.mop-assistant-toolbar`). The
  `LIVE ASSISTANT` / `offline demo` / `MEMORY SCOPE` + `<select>` render with
  dark text on a dark surface (low/no contrast). Fix: give the toolbar an
  explicit light surface OR set readable colors against its actual parent;
  force the dropdown readable with `.mop-assistant-toolbar select,
  .mop-assistant-toolbar option { background:#fffdf2; color:#2d4a3e; }`.
  Verify all four labels are legible in both light and dark surrounding panels.
  (Inline styles live on the elements; the surrounding surface comes from the
  global stylesheet — fix at the CSS rule for `.mop-assistant-toolbar`, don't
  rely on inline overrides alone.)
- [ ] **Settings sidebar should match the main app sidebar.** Make
  `.mop-settings-nav` / `.mop-settings-sidebar` (Providers/Users `<button>`s)
  render identically to `.mop-app-sidebar` (`.mop-nav-section` with a `<p>`
  section heading, `<nav>` of items, `.mop-nav-icon`, `.is-active`,
  `.mop-sidebar-spacer`, `.mop-account-card`). Recommended: reuse the shared
  sidebar shell/classes so Providers/Users look like Assistant/Brain/Settings
  items; keep "← BACK TO WORKSPACE" styled as a nav item. Files: settings
  layout/page under `apps/web/app/settings/` + the shared sidebar component +
  global CSS.

## Answer: "dah lengkap ke?"

Functionally **yes** for a single-node self-host (SQLite): install → setup →
admin → providers/users → link project → grounded chat → consolidation →
approval write-back → channels → execution backends. Remaining before calling it
"done":
1. **Publish** — run the "Publish sequence" above (`npm publish` → `mop-agent@0.1.10`).
2. **Two UI fixes** above.
3. **Production verification** checklist above (real VPS + DNS + Certbot reboot test).
4. Deferred infra (only if scaling): PostgreSQL/pgvector, multi-instance cloud sync.

## Install commands (also in README)

- Linux (recommended): `curl -fsSL https://raw.githubusercontent.com/BURHANDEV-ENTERPRISE/mop-agent/main/install.sh | bash` or `sudo npx mop-agent`
- macOS: dev only — `npx mop-agent` for local; production = Linux/WSL2.
- Windows: use **WSL2** (Ubuntu) then the Linux command; native Windows not a production target.

## Filesystem locations (per OS — keep README + installer `installPaths()` in sync)

- app code: `/opt/mop-agent` (or `$MOP_AGENT_DIR`)
- env: `/opt/mop-agent/apps/web/.env` (mode 0600)
- brain + DB: `/opt/mop-agent/data` (`MOP_AGENT_DATA_DIR`)
- nginx vhost: debian `/etc/nginx/sites-available/mop-agent.conf` (+ `sites-enabled` symlink); rhel/arch/alpine `/etc/nginx/conf.d/mop-agent.conf`
- systemd unit: `/etc/systemd/system/mop-agent.service`
- TLS certs: `/etc/letsencrypt/live/<domain>/`
- logs: `journalctl -u mop-agent -f`
