#!/usr/bin/env node
/**
 * Dev CLI for the FLOW connector. Cross-platform (Node only).
 *
 *   mop-flow-dev link  --url <agentUrl> --code <code> --project <id> [--root <dir>]
 *   mop-flow-dev serve [--root <dir>]
 *
 * In production this folds into the published `mop-flow` binary (1.3.0).
 */
import { pair } from "../src/pair.js";
import { serve } from "../src/serve.js";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const root = typeof args.root === "string" ? args.root : process.cwd();

  if (cmd === "link") {
    if (!args.url || !args.code || !args.project) {
      console.error("usage: mop-flow-dev link --url <agentUrl> --code <code> --project <id> [--root <dir>]");
      process.exit(1);
    }
    const link = await pair({
      projectRoot: root,
      agentUrl: String(args.url),
      code: String(args.code),
      projectId: String(args.project),
      name: typeof args.name === "string" ? args.name : undefined,
    });
    console.log(`linked: project=${link.projectId} → ${link.agentUrl}`);
    console.log(`wrote ${root}/.MOP/link.json (token stored, gitignored)`);
    return;
  }

  if (cmd === "serve") {
    await serve({ projectRoot: root });
    return;
  }

  console.error("commands: link | serve");
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
