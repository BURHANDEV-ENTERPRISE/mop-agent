/** Verify owner bootstrap + single-owner signup lock. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-auth-test-"));

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { auth, ownerExists, getRole } = await import("../apps/web/lib/auth.js");
const { getSqlite } = await import("../apps/web/lib/db/client.js");

await runAllMigrations();
const before = ownerExists();
console.log("ownerExists (before):", before);

const r1 = await auth.api
  .signUpEmail({ body: { email: "owner@test.my", password: "supersecret123", name: "Owner" } })
  .then(() => "created")
  .catch((e) => "ERR:" + e.message);
console.log("signup #1 (owner):", r1);
const after = ownerExists();
console.log("ownerExists (after):", after);

const r2 = await auth.api
  .signUpEmail({ body: { email: "intruder@test.my", password: "supersecret123", name: "Intruder" } })
  .then(() => "created (BAD!)")
  .catch((e) => "blocked: " + e.message);
console.log("signup #2 (should block):", r2);

const now = Date.now();
getSqlite().prepare(
  "INSERT INTO invite(email, role, expires_at, used_at, invited_by, created_at) VALUES(?, ?, ?, NULL, ?, ?)",
).run("member@test.my", "member", now + 60_000, "test-owner", now);
const r3 = await auth.api
  .signUpEmail({ body: { email: "member@test.my", password: "supersecret123", name: "Member" } })
  .then((result) => ({ created: true, role: getRole(result.user.id) }))
  .catch((e) => ({ created: false, role: "error:" + e.message }));
console.log("admin-prepared member account:", r3);

const ok = !before && r1 === "created" && after && r2.startsWith("blocked:") && r3.created && r3.role === "member";
console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
process.exit(ok ? 0 : 1);
