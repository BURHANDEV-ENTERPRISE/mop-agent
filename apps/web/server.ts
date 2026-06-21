/**
 * Custom Node server: Next.js request handler + the reverse WSS gateway on one port.
 * Cross-platform (Windows + Linux). Run via `tsx server.ts`.
 */
import { createServer } from "node:http";
import next from "next";
import { attachGateway } from "./lib/ws/gateway.js";
import { startChannels } from "./lib/channels/index.js";
import { startScheduler } from "./lib/brain/scheduler.js";
import { runAllMigrations } from "./lib/db/migrate.js";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });

async function start() {
  // Never accept auth/API traffic before both application and Better Auth
  // tables exist. This also makes service restarts repair missed migrations.
  await runAllMigrations();
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer((req, res) => handle(req, res));
  attachGateway(server);
  server.listen(port, async () => {
    console.log(`MOP-AGENT → http://localhost:${port}  (link ws: /link)`);
    const channels = await startChannels();
    if (channels.length) console.log(`channels started: ${channels.join(", ")}`);
    const jobs = startScheduler();
    if (jobs.length) console.log(`scheduler: ${jobs.join(", ")}`);
  });
}

start().catch((error) => {
  console.error("MOP-AGENT failed to start:", error);
  process.exit(1);
});
