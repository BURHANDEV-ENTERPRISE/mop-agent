/**
 * Better Auth — owner account + sessions.
 *
 * Uses the SAME better-sqlite3 connection as Drizzle (its Kysely adapter detects
 * the instance). Single-owner self-host: the first user to register becomes the
 * owner; further signups are blocked by the create hook below.
 */
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getSqlite } from "./db/client.js";

function userCount(): number {
  try {
    const row = getSqlite().prepare("SELECT count(*) AS c FROM user").get() as { c: number };
    return row.c;
  } catch {
    return 0; // table not migrated yet
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
          // Owner bootstrap: allow exactly one user (the owner).
          if (userCount() > 0) {
            throw new APIError("FORBIDDEN", {
              message: "Signups are closed — an owner already exists.",
            });
          }
          return { data: user };
        },
      },
    },
  },
});

export function ownerExists(): boolean {
  return userCount() > 0;
}
