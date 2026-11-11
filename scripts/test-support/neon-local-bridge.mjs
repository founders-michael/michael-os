/**
 * Test-only bridge so the application's hardcoded Neon WebSocket adapter
 * (src/lib/prisma.ts) can talk to a plain local Postgres.
 *
 * Load it with `node --import ./scripts/test-support/neon-local-bridge.mjs`
 * (or NODE_OPTIONS) BEFORE the app starts. It mutates the shared
 * `@neondatabase/serverless` module's global config, so the application's
 * PrismaNeon instance picks it up without any source change.
 *
 * It refuses to run unless DATABASE_URL points at localhost, so it can never
 * be used to aim a test run at the shared Neon dev branch.
 */
import net from "node:net";
import { WebSocketServer } from "ws";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const databaseUrl = process.env.DATABASE_URL ?? "";
let target;
try {
  target = new URL(databaseUrl);
} catch {
  throw new Error("neon-local-bridge: DATABASE_URL is missing or unparseable.");
}
if (!LOCAL_HOSTS.has(target.hostname)) {
  throw new Error(
    `neon-local-bridge: refusing to run against non-local host "${target.hostname}". ` +
      "This bridge is only for a disposable local Postgres.",
  );
}

const server = new WebSocketServer({ port: 0, perMessageDeflate: false });
await new Promise((resolve) => server.once("listening", resolve));
const { port } = server.address();

server.on("connection", (socket, request) => {
  // The driver appends ?address=host:port; relay to exactly that.
  const address = new URL(request.url, "http://localhost").searchParams.get("address") ?? "";
  const [host, rawPort] = address.split(":");
  if (!LOCAL_HOSTS.has(host)) {
    socket.close(1008, "non-local target refused");
    return;
  }

  const upstream = net.connect({ host, port: Number(rawPort) });
  const pending = [];
  let open = false;

  upstream.on("connect", () => {
    open = true;
    for (const chunk of pending) upstream.write(chunk);
    pending.length = 0;
  });
  upstream.on("data", (chunk) => {
    if (socket.readyState === socket.OPEN) socket.send(chunk);
  });

  const shutdown = () => {
    upstream.destroy();
    if (socket.readyState === socket.OPEN) socket.close();
  };
  upstream.on("error", shutdown);
  upstream.on("close", shutdown);
  socket.on("close", shutdown);
  socket.on("error", shutdown);

  socket.on("message", (data) => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (open) upstream.write(chunk);
    else pending.push(chunk);
  });
});

neonConfig.webSocketConstructor = ws;
neonConfig.wsProxy = `127.0.0.1:${port}/v2`;
neonConfig.useSecureWebSocket = false;
// Plain Postgres understands neither Neon's TLS-in-WebSocket handshake nor its
// pipelined startup/auth, so both are disabled for the local bridge.
neonConfig.pipelineTLS = false;
neonConfig.pipelineConnect = false;

// Keep the bridge from holding the process open on its own.
/** @type {{ unref?: () => void } | undefined} */
const httpServer = server._server;
httpServer?.unref?.();
