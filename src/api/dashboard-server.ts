import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { appendSignal, getSignals, getStats, type StoredSignal } from "./signals-store";

const clients = new Set<WebSocket>();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, { error: "Not found" });
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/signals") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100") || 100, 100);
    sendJson(res, 200, { signals: getSignals(limit) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    sendJson(res, 200, getStats());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, clients: clients.size, ts: Date.now() });
    return;
  }

  notFound(res);
}

export function broadcastSignal(signal: StoredSignal): void {
  const message = JSON.stringify({ type: "signal", signal });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

export function persistAndBroadcast(signal: StoredSignal): StoredSignal {
  const saved = appendSignal(signal);
  broadcastSignal(saved);
  return saved;
}

export function startDashboardServer(port = Number(process.env.DASHBOARD_PORT ?? "3001")): void {
  const server = createServer(handleRequest);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(
      JSON.stringify({
        type: "hello",
        signals: getSignals(50),
        stats: getStats(),
      })
    );

    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  server.listen(port, () => {
    console.log(`🖥️  Dashboard API: http://localhost:${port}`);
    console.log(`🔌 WebSocket:     ws://localhost:${port}/ws`);
  });
}
