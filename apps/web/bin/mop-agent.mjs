#!/usr/bin/env node
/**
 * Thin `mop-agent` CLI (Fasa 3.5) — local ops against the same SQLite Brain.
 * Loads apps/web/.env so it targets the same data dir as the server.
 *
 *   mop-agent migrate
 *   mop-agent status
 *   mop-agent projects
 *   mop-agent consolidate
 *   mop-agent skills
 *   mop-agent skill-add "<name>" "<description>" "<body>"
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (existing env wins) so the CLI targets the same Brain as the server.
const envPath = join(webRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "migrate": {
      const { runAllMigrations } = await import("../lib/db/migrate.js");
      await runAllMigrations();
      console.log("✅ migrated");
      break;
    }
    case "status": {
      const { ownerExists } = await import("../lib/auth.js");
      const { listProjects } = await import("../lib/link/store.js");
      const { listSemanticNotes } = await import("../lib/brain/consolidate.js");
      const { listSkills } = await import("../lib/brain/skills.js");
      const projects = listProjects();
      console.log(`owner: ${ownerExists() ? "yes" : "no (run /setup)"}`);
      console.log(`projects: ${projects.length} (${projects.filter((p) => p.status === "online").length} online)`);
      console.log(`main-brain patterns: ${listSemanticNotes().length}`);
      console.log(`skills: ${listSkills().length}`);
      break;
    }
    case "projects": {
      const { listProjects } = await import("../lib/link/store.js");
      for (const p of listProjects()) console.log(`${p.status === "online" ? "🟢" : "⚪"} ${p.id} (${p.name})`);
      break;
    }
    case "consolidate": {
      const { consolidate } = await import("../lib/brain/consolidate.js");
      const r = await consolidate();
      console.log(`scanned ${r.scanned} → ${r.notesCreated} pattern(s)`);
      for (const n of r.notes) console.log(`  • ${n.title} (${n.confidence}%)`);
      break;
    }
    case "skills": {
      const { listSkills } = await import("../lib/brain/skills.js");
      for (const s of listSkills()) console.log(`🛠 ${s.name} — ${s.description}`);
      break;
    }
    case "skill-add": {
      const [name, description = "", body = ""] = rest;
      if (!name) return fail("usage: mop-agent skill-add \"<name>\" \"<description>\" \"<body>\"");
      const { addSkill } = await import("../lib/brain/skills.js");
      const id = await addSkill({ name, description, body: body || description || name });
      console.log(`added ${id}`);
      break;
    }
    case "gateway-link": {
      const [projectLinkId] = rest;
      if (!projectLinkId) return fail("usage: mop-agent gateway-link <projectLinkId>");
      const { linkAgent, gatewayUrl } = await import("../lib/gateway/link.js");
      const link = await linkAgent(projectLinkId);
      console.log(`🔗 linked ${link.projectLinkId} @ ${gatewayUrl()}`);
      console.log(`   channel: ${link.channel}`);
      console.log(`   realtime JWT: ${link.realtimeToken.slice(0, 24)}… (expires in ${link.expiresIn}s)`);
      break;
    }
    default:
      console.log("commands: migrate | status | projects | consolidate | skills | skill-add | gateway-link");
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
