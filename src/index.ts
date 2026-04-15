import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import {
  enrichDirectQuery,
  SERVICE_VERSION,
  type BattleQueryEnrichmentRequest,
} from "./battleIntel";
import { server } from "./server";

const DEFAULT_BROWSER_ORIGINS = [
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
];

function isTruthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function getAllowedBrowserOrigins(): string[] {
  const configured = process.env.BATTLELUCK_CORS_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured && configured.length > 0 ? configured : DEFAULT_BROWSER_ORIGINS;
}

function resolveCorsOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  if (isTruthy(process.env.BATTLELUCK_CORS_ALLOW_ALL_ORIGINS)) return "*";
  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedBrowserOrigins();
  if (allowedOrigins.some((candidate) => normalizeOrigin(candidate) === normalizedOrigin)) {
    return origin;
  }
  return null;
}

function appendVaryHeader(res: Response, value: string): void {
  const current = res.getHeader("Vary");
  if (!current) { res.setHeader("Vary", value); return; }
  const values = Array.isArray(current)
    ? current.flatMap((entry) => entry.toString().split(","))
    : current.toString().split(",");
  const normalized = values.map((entry) => entry.trim().toLowerCase());
  if (!normalized.includes(value.toLowerCase())) {
    values.push(value);
    res.setHeader("Vary", values.join(", "));
  }
}

function applyCorsHeaders(req: Request, res: Response): boolean {
  const origin = req.header("Origin")?.trim();
  const allowedOrigin = resolveCorsOrigin(origin);
  appendVaryHeader(res, "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-BattleLuck-Secret");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.header("Access-Control-Request-Private-Network") === "true"
      && isTruthy(process.env.BATTLELUCK_CORS_ALLOW_PRIVATE_NETWORK)) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (!origin) return true;
  if (!allowedOrigin) return false;
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  return true;
}

function handleCors(req: Request, res: Response): boolean {
  if (!applyCorsHeaders(req, res)) {
    res.status(403).json({ error: "CORS origin not allowed" });
    return false;
  }
  if (req.method === "OPTIONS") { res.status(204).end(); return false; }
  return true;
}

function isPublicHealthEnabled(): boolean {
  return isTruthy(process.env.BATTLELUCK_ALLOW_PUBLIC_HEALTH);
}

function isAuthorized(req: Request): boolean {
  const expectedSecret = process.env.BATTLELUCK_SHARED_SECRET?.trim();
  if (!expectedSecret) return true;
  const authHeader = req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return bearerToken === expectedSecret || req.header("x-battleluck-secret") === expectedSecret;
}

function ensureAuthorized(req: Request, res: Response): boolean {
  if (isAuthorized(req)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

function parseQueryRequest(body: unknown): BattleQueryEnrichmentRequest | null {
  if (!body || typeof body !== "object") return null;
  const request = body as Partial<BattleQueryEnrichmentRequest>;
  if (!request.query || typeof request.query !== "string") return null;
  if (!request.player || typeof request.player !== "object") return null;
  if (!request.player.steamId || typeof request.player.steamId !== "string") return null;
  return {
    query: request.query,
    player: {
      steamId: request.player.steamId,
      recentEvents: Array.isArray(request.player.recentEvents)
        ? request.player.recentEvents.filter((event): event is string => typeof event === "string")
        : [],
      conversationSummary:
        typeof request.player.conversationSummary === "string"
          ? request.player.conversationSummary
          : undefined,
      lastActivityUtc:
        typeof request.player.lastActivityUtc === "string"
          ? request.player.lastActivityUtc
          : undefined,
    },
    session: request.session ?? undefined,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const type = args.at(0) || "stdio";
  if (type === "http") {
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "1mb" }));
    app.use((req, res, next) => { if (!handleCors(req, res)) return; next(); });

    app.get("/", (_req, res) => {
      res.json({
        service: "BattleLuck AI Sidecar",
        version: SERVICE_VERSION,
        browserDirectMode: true,
        routes: ["GET /health", "POST /api/query/enrich", "POST /mcp"],
        publicHealth: isPublicHealthEnabled(),
        allowedBrowserOrigins: isTruthy(process.env.BATTLELUCK_CORS_ALLOW_ALL_ORIGINS)
          ? ["*"]
          : getAllowedBrowserOrigins(),
      });
    });

    app.get("/health", (req, res) => {
      if (!isPublicHealthEnabled() && !ensureAuthorized(req, res)) return;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        status: "healthy",
        service: "BattleLuck AI Sidecar",
        version: SERVICE_VERSION,
        features: ["mcp", "query-enrichment", "deterministic-simulation"],
        timestampUtc: new Date().toISOString(),
      });
    });

    app.post("/api/query/enrich", (req, res) => {
      if (!ensureAuthorized(req, res)) return;
      const request = parseQueryRequest(req.body);
      if (!request) { res.status(400).json({ error: "Invalid request payload" }); return; }
      res.json(enrichDirectQuery(request));
    });

    app.post('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    const port = parseInt(process.env.PORT || '3000');
    app.listen(port, () => {
      console.log(`BattleLuck AI sidecar running (port ${port})`);
      console.log(`Direct browser mode: ${isPublicHealthEnabled() ? "public health enabled" : "shared-secret health"}`);
      console.log(`Allowed browser origins: ${isTruthy(process.env.BATTLELUCK_CORS_ALLOW_ALL_ORIGINS) ? "*" : getAllowedBrowserOrigins().join(", ")}`);
    }).on('error', error => { console.error('Server error:', error); throw error; });
  } else if (type === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running on stdio");
  } else {
    throw new Error(`Unknown transport type: ${type}`);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
