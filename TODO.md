# MOP-AGENT — Build TODO (resumable)

> Single source of truth for what's done and what's next. Update as you go.
> Specs: `../myney.core v2.0.0 copy/planning/MOP-AGENT-PRD.md` + `MOP-FLOW-vNext.md`.

## ✅ Done

- **Fasa 0** — monorepo (workspaces, tsconfig, gitignore/gitattributes), `@mop/link-protocol` (shared types).
- **Fasa 1** — `@mop/flow-connector` (pair / serve reverse-WSS / snapshot+redact / tools+capability-guard / CLI); `@mop/web` Next.js skeleton (custom server + ws gateway + link store + brain mirror + pair/code/projects API + status page). E2E link-loop smoke PASS.
- **Fasa 2** — DB (better-sqlite3 + drizzle + sqlite-vec), schema + migrate; embeddings (dummy) + KNN search; link store + mirror DB-backed (token hashed, secrets redacted); Better Auth (owner bootstrap + single-owner lock, setup page, gated link/code). Smoke + auth tests PASS.
- **Fasa 3** — provider hub (Anthropic + OpenRouter + offline echo + env-driven `resolveProvider`); memory broker (`recall` + judgment layer + `ContextPack`); grounded chat route (`/api/chat` streaming); brain read endpoints (`/api/projects/[id]/memory|state`); Brain UI (`/brain`, `/brain/[id]`, `/chat/[id]`). smoke-chat PASS (recall + grounded answer).
  - Deferred: provider keys are env-driven for now — encrypted `provider_config` table + settings UI still TODO (backlog).
- **Fasa 4** — **manual consolidation** (episodic → semantic): cluster recurring memories across projects → promote anonymized `Pattern:` notes to Main Brain + embed; `/api/consolidate` + `/api/semantic`; Brain Consolidate button + Main Brain section. **Live write-back + approval**: gateway registry on `globalThis` (works across Next bundle split); approval queue (`lib/brain/approvals.ts`); `/api/actions` + `/approve` + `/deny`; Approvals panel on `/brain` + "Save to memory" in chat. FLOW enforces capability on execute (approval flag never trusted). smoke-consolidate + smoke-actions PASS.

Verify anytime: `npm run typecheck --workspaces` · then each `npx tsx scripts/smoke-{link,auth,chat,consolidate,actions}.mts`

Run live: set `BETTER_AUTH_SECRET` (32+) in `apps/web/.env`, then `npm run dev:web` → open `/setup` → create owner → `/brain` → link a project → chat. (No provider key = offline echo answers.)

---

## 🧹 Other TODOs / backlog

- [ ] **git init** `mop-agent` + first commit (then enable autosync).
- [ ] **.env** — generate real `BETTER_AUTH_SECRET` (32+) + `MOP_AGENT_SECRET` (fix low-entropy warning).
- [ ] **provider_config** — per-owner encrypted keys (AES-GCM via `MOP_AGENT_SECRET`) + settings UI (replaces env-driven).
- [ ] **Real embedder** (open decision #6) — swap dummy for local model (`@xenova/transformers` MiniLM 384d) or provider embeddings; keep `EMBED_DIM` in sync (recreate `vec_memory` if dim changes). Fixes ranking quality (dummy = keyword-hash only).
- [ ] **flow-connector → real `.MOP`** — wire `hasValidSession` to mop-flow v1.2.0 session model; finish `list_artifacts`/`workflow_status`/`search_project_context`/`workflow_next` stubs in `tools.ts`.
- [ ] **Production data dir** — set `MOP_AGENT_USE_OS_DIR=1` for installed/Docker runs.
- [ ] **Live browser test** — full setup→link→chat flow via real `npm run dev:web` (not just smoke scripts).

## ⏭️ Later phases (from PRD roadmap)

- **Fasa 4** — ✅ done (consolidation + live write-back + approval).
- **Fasa 4.5** — ✅ done (channels: Telegram `grammy` + Discord `discord.js`, channel↔project binding, commands /projects /use; grounded answers). Live bot needs a token (`TELEGRAM_BOT_TOKEN` / `DISCORD_BOT_TOKEN` in `.env`). smoke-channels PASS.
- **Live-verified** — git repo init'd; real `npm run dev:web` end-to-end via curl: owner signup → link real project (reverse WSS) → grounded chat → write-back w/ approval persisted to project `.MOP/memory`. (Fixed: Next needs extensionless relative imports.)
- **Fasa 3.5** — ✅ cron scheduler (`croner`) → scheduled consolidation (`MOP_AGENT_CONSOLIDATE_CRON`, wired into server.ts); thin `mop-agent` CLI (`npm run cli -- <migrate|status|projects|consolidate|skills|skill-add>`); daemon = run `npm run start` under PM2/systemd/Task. smoke-fasa5 PASS.
- **Fasa 5** — ✅ skills registry (`skill` table, addSkill/listSkills, `/api/skills`, **procedural recall** layer in broker/ContextPack); graph API `/api/graph` + React Flow page `/brain/graph` (projects⟷patterns⟷skills). Scheduled consolidation (above). smoke-fasa5 PASS.
- **Fasa 6** — more channels, voice, sandboxing backends (Docker/SSH) for `runShell`/`editCode`.
- **Fasa 7** — multi-user/team, Postgres option, cloud sync.
