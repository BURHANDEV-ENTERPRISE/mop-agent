# MOP-AGENT — Release Handoff

> Updated 2026-06-21 after the npm packaging fix. This file records what is
> ready, the exact publish sequence, and the remaining production hardening.

## Current release snapshot

- Package: `mop-agent@0.1.0`
- Canonical command: exactly `npx mop-agent`
- npm user on this machine: `moonwiraja`
- npm registry status before release: package name returned 404 (not published)
- Tarball: 86 runtime files, about 94 kB compressed / 347 kB unpacked
- Runtime backend: SQLite + sqlite-vec (PostgreSQL is not installed)
- Default durable location: `/opt/mop-agent`
- The npm package contains the application runtime; it does not clone or depend
  on access to the private GitHub repository

## Completed for npm 0.1.0

- [x] Rename root package from `mop-agent-monorepo` to `mop-agent`.
- [x] Remove `private: true`; add version, metadata, repository, keywords,
  public publish config, controlled `files`, and the correct bin entry.
- [x] Add `installer/bootstrap.mjs` as the npm executable.
- [x] Make the bootstrap copy the packaged runtime out of transient npx cache
  into `/opt/mop-agent` or `MOP_AGENT_DIR`.
- [x] Preserve `apps/web/.env` and `data/` when staging an update.
- [x] Refuse unsafe install destinations and refuse running the whole npx
  process as root.
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

Expected publish identity: `mop-agent@0.1.0`. Stop if npm shows
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
