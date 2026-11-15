import { describe, expect, it } from "@jest/globals";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SwiftDropApi } from "../src/rest.js";
import { createToolServer } from "../src/tools.js";
import { bearerOf } from "../src/app.js";

type Call = { url: string; method: string; authorization?: string };

function harness(routes: Record<string, unknown>, bearer?: string) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: URL, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      method: String(init.method),
      authorization: headers.authorization,
    });
    const body = routes[input.pathname];
    return body === undefined
      ? new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  const api = new SwiftDropApi("http://core:3000", fetchImpl);
  const server = createToolServer(api, bearer);
  return { calls, server };
}

async function connect(server: ReturnType<typeof createToolServer>) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}
const payload = (result: unknown) =>
  JSON.parse(
    ((result as { content: Array<{ text: string }> }).content[0] as { text: string }).text,
  );

describe("ai-assistant MCP tools (claude.md, AI assistant)", () => {
  it("exposes exactly the four read-only tools and nothing that writes", async () => {
    const { server } = harness({});
    const client = await connect(server);
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "find_zone",
      "get_parcel_status",
      "list_my_parcels",
      "quote_delivery_fee",
    ]);
  });

  it("list_my_parcels forwards the user's own JWT and only issues GET", async () => {
    const { server, calls } = harness(
      {
        "/api/v1/parcels": {
          items: [
            {
              trackingNumber: "SD-7KQ2M9XA-P",
              status: "IN_TRANSIT",
              destinationTown: "Kandy",
              feeCents: 57000,
              createdAt: "2026-11-14T00:00:00Z",
            },
          ],
        },
      },
      "user-jwt",
    );
    const client = await connect(server);
    const result = payload(await client.callTool({ name: "list_my_parcels", arguments: {} }));
    expect(result.parcels[0]).toMatchObject({ trackingNumber: "SD-7KQ2M9XA-P", feeLkr: "570.00" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", authorization: "Bearer user-jwt" });
  });

  it("list_my_parcels without a JWT never reaches the API", async () => {
    const { server, calls } = harness({});
    const client = await connect(server);
    const result = await client.callTool({ name: "list_my_parcels", arguments: {} });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("quote_delivery_fee calls the read-only estimate endpoint (no stored quote)", async () => {
    const { server, calls } = harness({
      "/api/v1/quotes/estimate": {
        feeCents: 57000,
        currency: "LKR",
        originTown: "Colombo",
        destinationTown: "Kandy",
      },
    });
    const client = await connect(server);
    const result = payload(
      await client.callTool({
        name: "quote_delivery_fee",
        arguments: { originDistrict: "Colombo", destinationDistrict: "Kandy", weightKg: 2 },
      }),
    );
    expect(result).toMatchObject({ success: true, feeCents: 57000, feeLkr: "570.00" });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("weightGrams")).toBe("2000");
    expect(calls[0]!.method).toBe("GET");
  });

  it("get_parcel_status and find_zone read through the REST API", async () => {
    const { server } = harness({
      "/api/v1/track/SD-7KQ2M9XA-P": {
        trackingNumber: "SD-7KQ2M9XA-P",
        status: "DELIVERED",
        originTown: "Colombo",
        destinationTown: "Kandy",
        history: [{ status: "DELIVERED", createdAt: "2026-11-14T10:00:00Z" }],
      },
      "/api/v1/zones": [
        { district: "Colombo", town: "Colombo", active: true },
        { district: "Kandy", town: "Kandy", active: true },
        { district: "Galle", town: "Galle", active: false },
      ],
    });
    const client = await connect(server);
    const status = payload(
      await client.callTool({ name: "get_parcel_status", arguments: { trackingNumber: "sd-7kq2m9xa-p" } }),
    );
    expect(status).toMatchObject({ success: true, status: "DELIVERED" });
    const zones = payload(await client.callTool({ name: "find_zone", arguments: { query: "kan" } }));
    expect(zones.districts).toEqual([{ district: "Kandy", town: "Kandy" }]);
  });

  it("reports REST failures as tool errors, not crashes", async () => {
    const { server } = harness({});
    const client = await connect(server);
    const result = await client.callTool({
      name: "get_parcel_status",
      arguments: { trackingNumber: "SD-UNKNOWN-X" },
    });
    expect(result.isError).toBe(true);
  });

  it("bearerOf only accepts a well-formed Bearer header", () => {
    expect(bearerOf("Bearer abc.def")).toBe("abc.def");
    expect(bearerOf("Basic abc")).toBeUndefined();
    expect(bearerOf(undefined)).toBeUndefined();
  });
});
