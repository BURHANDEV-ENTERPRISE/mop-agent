# MOP-AGENT — Release Handoff TODO

> Updated 2026-06-21. This is the resumable source of truth for the next Codex
> session. Do not publish npm or advertise the installer as production-ready
> until every P0 release gate below is checked and verified on a clean machine.

## Snapshot

- Repository: `https://github.com/BURHANDEV-ENTERPRISE/mop-agent` (private)
- Branch: `main`
- Last pushed implementation commit before this handoff: `cbac14e`
- npm package `mop-agent`: not published (`npm view mop-agent` returned 404)
- npm authentication on this machine: absent (`npm whoami` returned 401)
- Root `package.json`: currently `private: true`, name `mop-agent-monorepo`,
  version `0.0.1`; it cannot be published in its current state
- Working tree at audit start already contained an unfinished change in
  `installer/lib.mjs` adding `nginxPaths()` and `installPaths()`; preserve it
- Current app persistence: SQLite + sqlite-vec, despite installer provisioning
  PostgreSQL
- Existing installer is Linux-only and has only been dry-run/smoke-tested
- Current verification after this audit: workspace typecheck and all 13
  `scripts/smoke-*.mts` tests pass

## P0 — npm and installer release gate

### 1. Make `npx mop-agent` install to a durable location

- [ ] The only public npm command is exactly `npx mop-agent`. Do not require
  users to add `sudo`, `--preserve-env`, `--yes`, a version, or `@latest`.
- [ ] Start as the normal user. Add an internal privilege helper that requests
  `sudo` only for the specific operations that need it (`/opt`, `/etc`, package
  manager, nginx, systemd, Certbot). Never run the complete npm/npx process as
  root and never make npm cache files root-owned.
- [ ] Do not run the service from npm's temporary `_npx` cache. The published
  bin must bootstrap/clone a pinned release into `/opt/mop-agent` (or an explicit
  `MOP_AGENT_DIR`) and then execute the installer from that durable checkout.
- [ ] Make `npx mop-agent update` operate on the durable checkout, not the cache.
- [ ] Decide and document behavior when `/opt/mop-agent` already exists:
  verify its remote, preserve `.env` and data, then fast-forward safely.
- [ ] Support `--version`, `--help`, `--yes`, `--dry-run`, and non-interactive
  failure messages.
- [ ] Verify both commands on a clean Linux VM:

  ```bash
  curl -fsSL https://raw.githubusercontent.com/BURHANDEV-ENTERPRISE/mop-agent/main/install.sh | sudo bash
  npx mop-agent
  ```

Acceptance: after npm cache cleanup, reboot, and user logout/login, the service
still starts from `/opt/mop-agent` and `mop-agent update/status` still work.

### 2. Fix npm package metadata and contents

- [ ] Change root package name to `mop-agent` only after confirming ownership.
- [ ] Remove `private: true` from the publishable installer package. Prefer a
  small dedicated package if keeping the monorepo root private is safer.
- [ ] Add correct `version`, `repository`, `homepage`, `bugs`, `license`,
  `keywords`, `files`, `bin`, and `publishConfig.access` fields.
- [ ] Ensure the package contains only the bootstrap installer files, README,
  and license—never `.env`, data, DB files, caches, or the whole private app.
- [ ] Add `prepack`/`prepublishOnly` gates for tests and package inspection.
- [ ] Run and inspect:

  ```bash
  npm pack --dry-run
  tar -tf mop-agent-*.tgz
  npm install --global ./mop-agent-*.tgz
  mop-agent --help
  ```

- [ ] Log in with the intended BURHANDEV npm owner, enable 2FA/provenance where
  possible, and confirm `npm whoami` before publication.

### 3. Resolve the PostgreSQL versus SQLite contradiction

- [ ] Choose one release behavior:
  - v0.x installer uses the already-working SQLite + sqlite-vec runtime and does
    not install/create PostgreSQL; or
  - finish the async PostgreSQL + pgvector migration and prove all features.
- [ ] Do not create a PostgreSQL role/database while leaving `DATABASE_URL`
  commented and unused.
- [ ] Update installer prompts, dependencies, status checks, uninstall/purge,
  `.env.example`, README, and tests to match the chosen database.
- [ ] Add backup/restore instructions and an update migration test using real
  pre-existing user data.

Recommended for the first release: ship the proven SQLite path, then add
PostgreSQL as a separate, tested production backend later.

### 4. Finalize Linux filesystem layout and permissions

- [ ] Decide the canonical production layout. Recommended:
  - code: `/opt/mop-agent`
  - mutable brain/database: `/var/lib/mop-agent`
  - secrets/config: `/etc/mop-agent/mop-agent.env` (`0600`)
  - nginx: distro-specific path
  - systemd: `/etc/systemd/system/mop-agent.service`
  - TLS: `/etc/letsencrypt/live/<domain>/`
  - logs: systemd journal
- [ ] If retaining `/opt/mop-agent/data` and in-repo `.env` for v0.x, state that
  explicitly and make update/uninstall preserve them.
- [ ] Create a locked-down `mop-agent` system account. Do not run the web app as
  root merely because the installer was launched with sudo.
- [ ] Set directory/file ownership and modes explicitly; test provider-key
  encryption and SQLite writes under the service account.
- [x] Print the exact resolved location map before setup and at completion.
- [x] Use `nginxPaths(os.family)` everywhere. Debian uses
  `sites-available/sites-enabled`; RHEL/Arch/Alpine use `conf.d`.
- [x] Explain that `/var/www` is not used because nginx reverse-proxies to a
  Node service rather than serving static files.

### 5. Harden installer input and execution

- [ ] Validate and safely escape domain, email, port, path, DB name/user, and all
  values inserted into shell commands or config files. Reject shell metacharacters.
- [ ] Require a non-empty valid domain for HTTPS; support an explicit localhost
  / HTTP-only mode instead of generating `https://` with an empty domain.
- [ ] Fail fast on a failed command. Current `runSteps()` continues after errors,
  which can report success for a broken installation.
- [ ] Check/install Git and other prerequisites, not only Node.
- [ ] Make the TUI complete the whole flow or loop back after `install`; currently
  selecting `install` exits and requires a second invocation for `setup`.
- [ ] Make repeated setup idempotent: existing role/database, vhost, unit, env,
  certificate, and checkout must not corrupt or destroy an installation.
- [ ] Back up `.env`, database/data, nginx config, and unit before update.
- [ ] Add rollback behavior if migration/build/restart fails.
- [ ] Ensure `uninstall --purge` truthfully removes every documented mutable
  resource; require explicit destructive confirmation and offer a backup first.

### 6. Finish HTTPS/nginx behavior

- [ ] Keep WebSocket upgrade and long read timeout for the reverse-WSS gateway.
- [ ] Verify nginx config locations on every supported distro.
- [ ] Fix standalone Certbot fallback: obtaining a cert alone is insufficient.
  Install the certificate into a 443 nginx server block, redirect port 80, run
  `nginx -t`, reload, and prove renewal works.
- [ ] Verify DNS resolution and port 80/443 reachability before Certbot.
- [ ] Print actionable firewall guidance without silently changing firewall
  policy.
- [ ] Add `curl` health checks through local app HTTP and public HTTPS before
  printing "Setup complete".

### 7. Cross-platform contract

- [ ] Linux production: verify Debian/Ubuntu first; mark RHEL, Arch, Alpine
  experimental until each has a real clean-VM test.
- [ ] Windows: officially support WSL2 for the Linux production flow. Keep native
  PowerShell as development-only until Windows service/IIS/Caddy automation exists.
- [ ] macOS: keep development-only until Homebrew + launchd + reverse proxy/TLS
  automation exists; recommend Linux for production.
- [x] The installer detects unsupported native Windows/macOS immediately and
  print the appropriate README section and commands.
- [ ] Remove the old README claim that the installer is fully cross-platform.

### 8. Documentation release gate

- [x] README now distinguishes Linux production, Windows WSL2/native development,
  and macOS development.
- [x] README now records the current filesystem paths and explains `/opt` versus
  `/var/www`.
- [x] README warns that npm/npx is not ready or published.
- [ ] Once implementation choices above are final, reconcile every README path,
  command, prompt, status statement, and screenshot with actual output.
- [ ] Add upgrade, backup/restore, uninstall, troubleshooting, reverse proxy,
  DNS/firewall, and security sections.
- [ ] Replace/remove repository links that point to a sibling local directory;
  published docs must resolve on GitHub and npm.
- [ ] Add a LICENSE and release support policy.

### 9. Tests required before publish

- [ ] Extend `smoke-installer.mts` to cover Debian and non-Debian nginx paths,
  install location maps, unsupported Windows/macOS messaging, invalid inputs,
  idempotency plans, and SSL fallback config.
- [ ] Run typecheck and all 13+ smoke tests in a clean checkout.
- [ ] Test `npm pack` tarball locally without the repository present.
- [ ] Test curl and npx paths on fresh Ubuntu VMs/containers as root and a normal
  sudo user.
- [ ] Test install → setup → reboot → status → update → reboot → uninstall.
- [ ] Test a failed build/migration and confirm rollback/preserved data.
- [ ] Perform the real browser flow after install: owner signup, provider setting,
  FLOW pairing, reverse-WSS online, recall/chat, approval write-back, channels.
- [ ] Scan the Git history and npm tarball for secrets.

## P1 — application completion after installer release

- [ ] Wire FLOW `hasValidSession` to the MOP-FLOW v1.2 session model.
- [ ] Implement `workflow_next` when merging connector changes into MOP-FLOW.
- [ ] Complete full route authorization review, not only sensitive writes.
- [ ] Decide and implement real multi-instance/cloud-sync architecture.
- [ ] Add live Telegram and Discord tests with real bot tokens.
- [ ] Add voice and additional channels only after core deployment is stable.
- [ ] Add observability, retention controls, exports, and disaster recovery.

## Already implemented (do not redo)

- [x] Fasa 0–3: monorepo, protocol, reverse-WSS link, SQLite/sqlite-vec,
  Better Auth, provider hub, grounded recall/chat.
- [x] Fasa 3.5: CLI and scheduled consolidation.
- [x] Fasa 4: semantic consolidation, approvals, live write-back.
- [x] Fasa 4.5: Telegram/Discord adapters and channel-project binding.
- [x] Fasa 5: skills/procedural recall and React Flow graph.
- [x] Fasa 6 foundation: host/docker/ssh execution, capability guards,
  approval gate, path traversal protection.
- [x] Fasa 7 foundation: owner/member roles, email invites, Team UI, sensitive
  route gates.
- [x] Local MiniLM embedder and encrypted per-owner provider configuration.
- [x] FLOW tools: `list_artifacts`, `workflow_status`,
  `search_project_context`.
- [x] Installer generators and initial smoke test exist.

## Suggested next-session order

1. Read this file and `git diff`; preserve the existing `installer/lib.mjs` work.
2. Decide SQLite-first and the canonical filesystem layout.
3. Implement durable npx bootstrap plus non-root systemd service.
4. Fix nginx distro paths, SSL fallback, fail-fast/idempotency, and path display.
5. Update tests and run the complete suite.
6. Reconcile README with verified output.
7. Prepare npm metadata, inspect tarball, authenticate, publish a prerelease
   (`next` tag), install it on a clean VM, then promote to `latest` only after
   successful end-to-end verification.
