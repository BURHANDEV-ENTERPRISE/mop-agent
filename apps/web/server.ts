/**
 * Custom Node server: Next.js request handler + the reverse WSS gateway on one port.
 * Cross-platform (Windows + Linux). Run via `tsx server.ts`.
 */
import { createServer } from "node:http";
import next from "next";
import { attachGateway } from "./lib/ws/gateway.js";
import { startChannels } from "./lib/channels/index.js";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  attachGateway(server);
  server.listen(port, async () => {
    console.log(`MOP-AGENT → http://localhost:${port}  (link ws: /link)`);
    const channels = await startChannels();
    if (channels.length) console.log(`channels started: ${channels.join(", ")}`);
  });
});
