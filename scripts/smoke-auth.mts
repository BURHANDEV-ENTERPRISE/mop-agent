/** Verify owner bootstrap + single-owner signup lock. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-auth-test-"));

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { auth, ownerExists } = await import("../apps/web/lib/auth.js");

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

const ok = !before && r1 === "created" && after && r2.startsWith("blocked:");
console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
process.exit(ok ? 0 : 1);
