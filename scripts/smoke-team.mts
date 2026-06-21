/**
 * Smoke test: team foundation — owner bootstrap, invite-gated signup, roles.
 *   npx tsx scripts/smoke-team.mts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-team-"));
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { auth, getRole, ownerExists } = await import("../apps/web/lib/auth.js");
const { getSqlite } = await import("../apps/web/lib/db/client.js");

const signup = (email: string) =>
  auth.api
    .signUpEmail({ body: { email, password: "supersecret123", name: email } })
    .then((r) => ({ ok: true as const, id: (r as { user?: { id: string } }).user?.id }))
    .catch((e) => ({ ok: false as const, err: e.message as string }));

async function main() {
  await runAllMigrations();

  const owner = await signup("owner@team.test");
  console.log(`[test] owner signup: ${owner.ok} role=${owner.ok ? getRole(owner.id!) : "-"} ownerExists=${ownerExists()}`);

  const intruder = await signup("intruder@team.test");
  console.log(`[test] no-invite signup blocked: ${!intruder.ok} (${!intruder.ok ? intruder.err : "GOT IN!"})`);

  // owner invites a specific email
  getSqlite()
    .prepare("INSERT INTO invite(email, role, expires_at, used_at, invited_by, created_at) VALUES(?,?,?,?,?,?)")
    .run("member@team.test", "member", Date.now() + 86_400_000, null, owner.id, Date.now());

  const member = await signup("member@team.test");
  console.log(`[test] invited signup: ${member.ok} role=${member.ok ? getRole(member.id!) : "-"}`);

  const inviteUsed = getSqlite().prepare("SELECT used_at FROM invite WHERE email=?").get("member@team.test") as { used_at: number | null };
  console.log(`[test] invite consumed: ${inviteUsed.used_at !== null}`);

  const reuse = await signup("member2@team.test"); // no invite for this email
  console.log(`[test] different email still blocked: ${!reuse.ok}`);

  const ok =
    owner.ok && getRole(owner.id!) === "owner" &&
    !intruder.ok &&
    member.ok && getRole(member.id!) === "member" &&
    inviteUsed.used_at !== null &&
    !reuse.ok;

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
