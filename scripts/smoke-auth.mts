/** Verify owner bootstrap + single-owner signup lock. */
import { runAllMigrations } from "../apps/web/lib/db/migrate.js";
import { auth, ownerExists } from "../apps/web/lib/auth.js";

await runAllMigrations();
console.log("ownerExists (before):", ownerExists());

const r1 = await auth.api
  .signUpEmail({ body: { email: "owner@test.my", password: "supersecret123", name: "Owner" } })
  .then(() => "created")
  .catch((e) => "ERR:" + e.message);
console.log("signup #1 (owner):", r1);
console.log("ownerExists (after):", ownerExists());

const r2 = await auth.api
  .signUpEmail({ body: { email: "intruder@test.my", password: "supersecret123", name: "Intruder" } })
  .then(() => "created (BAD!)")
  .catch((e) => "blocked: " + e.message);
console.log("signup #2 (should block):", r2);

process.exit(0);
