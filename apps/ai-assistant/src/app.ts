import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { SwiftDropApi } from "./rest.js";
import { createToolServer } from "./tools.js";

/** Pulls the caller's JWT from `Authorization: Bearer`. It is only ever forwarded, never decoded. */
export function bearerOf(header: string | undefined): string | undefined {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
  return match?.[1];
}

export function createApp(api: SwiftDropApi) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/readyz", (_req, res) => res.json({ status: "ready" }));

  // Stateless streamable-HTTP MCP: one server + transport per request, bound to that caller's JWT.
  app.post("/mcp", async (req, res) => {
    const server = createToolServer(api, bearerOf(req.get("authorization")));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
    }
  });
  const notAllowed = (_req: express.Request, res: express.Response) =>
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
  return app;
}
