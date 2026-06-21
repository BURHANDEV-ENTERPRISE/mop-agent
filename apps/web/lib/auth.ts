/**
 * Better Auth — owner account + sessions + team (Fasa 7).
 *
 * Uses the SAME better-sqlite3 connection as Drizzle (its Kysely adapter detects
 * the instance). First user to register becomes the owner; further signups are
 * invite-gated (email-scoped). Roles live in app_role.
 */
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getSqlite } from "./db/client";

function userCount(): number {
  try {
    const row = getSqlite().prepare("SELECT count(*) AS c FROM user").get() as { c: number };
    return row.c;
  } catch {
    return 0; // table not migrated yet
  }
}

function validInviteFor(email: string): { role: string } | undefined {
  try {
    return getSqlite()
      .prepare("SELECT role FROM invite WHERE email = ? AND used_at IS NULL AND expires_at > ?")
      .get(email, Date.now()) as { role: string } | undefined;
  } catch {
    return undefined;
  }
}

export function getRole(userId: string): "owner" | "member" | undefined {
  try {
    const row = getSqlite().prepare("SELECT role FROM app_role WHERE user_id = ?").get(userId) as { role: string } | undefined;
    return row?.role as "owner" | "member" | undefined;
  } catch {
    return undefined;
  }
}

export const auth = betterAuth({
  database: getSqlite(),
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-insecure-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // First user = owner. Otherwise an email-scoped invite is required.
          if (userCount() === 0) return { data: user };
          if (!validInviteFor(user.email)) {
            throw new APIError("FORBIDDEN", {
              message: "Signup requires an invite for this email.",
            });
          }
          return { data: user };
        },
        after: async (user) => {
          const sqlite = getSqlite();
          let role = "member";
          if (userCount() === 1) {
            role = "owner"; // the bootstrap user
          } else {
            const inv = validInviteFor(user.email);
            if (inv) {
              role = inv.role;
              sqlite.prepare("UPDATE invite SET used_at = ? WHERE email = ?").run(Date.now(), user.email);
            }
          }
          sqlite.prepare("INSERT OR REPLACE INTO app_role(user_id, role) VALUES(?, ?)").run(user.id, role);
        },
      },
    },
  },
});

export function ownerExists(): boolean {
  return userCount() > 0;
}
