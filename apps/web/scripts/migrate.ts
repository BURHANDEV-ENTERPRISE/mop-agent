/** Run all migrations (app tables + sqlite-vec + Better Auth). `npm run db:migrate`. */
import { runAllMigrations } from "../lib/db/migrate.js";

runAllMigrations()
  .then(() => {
    console.log("✅ migrations applied");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ migration failed:", e);
    process.exit(1);
  });
