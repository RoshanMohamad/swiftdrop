import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = {
  state: "authenticated",
  accessToken: "access-in-memory",
  tokenType: "Bearer",
  expiresIn: 900,
  user: {
    id: 1,
    email: "c@example.test",
    fullName: "Customer",
    phone: "+94771234567",
    role: "CUSTOMER",
    status: "ACTIVE",
    emailVerified: false,
    profileComplete: true,
  },
};
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("BroadcastChannel", undefined);
  fetcher = vi.fn(
    async (req: Request) =>
      new Response(
        JSON.stringify(
          req.url.endsWith("/csrf") ? { csrfToken: "csrf-token" } : session,
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: vi.fn((_name, callback) => callback()) },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("session transport", () => {
  it("single-flights refresh, obtains CSRF inside the lock, and never stores credentials", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const client = await import("./client.js");
    const first = client.refreshSession();
    const second = client.refreshSession();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual(session);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const refresh = fetcher.mock.calls[1][0] as Request;
    expect(refresh.headers.get("X-CSRF-Token")).toBe("csrf-token");
    expect(refresh.credentials).toBe("same-origin");
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });
  it("does not loop on terminal refresh failure", async () => {
    fetcher.mockImplementation(
      async (req: Request) =>
        new Response(
          JSON.stringify(
            req.url.endsWith("/csrf")
              ? { csrfToken: "csrf" }
              : { code: "UNAUTHENTICATED", detail: "Sign in again." },
          ),
          {
            status: req.url.endsWith("/csrf") ? 200 : 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    const client = await import("./client.js");
    await expect(client.refreshSession()).rejects.toMatchObject({
      problem: { status: 401 },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("clears local credentials and blocks automatic cookie login after failed logout", async () => {
    const client = await import("./client.js");
    await client.refreshSession();
    fetcher.mockRejectedValue(new TypeError("offline"));
    await expect(client.logout()).rejects.toThrow();
    const count = fetcher.mock.calls.length;
    await expect(client.refreshSession()).rejects.toThrow(
      "Sign-out is pending",
    );
    expect(fetcher).toHaveBeenCalledTimes(count);
  });
});

it("refreshes a protected read once and validates the all-role nullable user list", async () => {
  const client = await import("./client.js");
  await client.refreshSession();
  let reads = 0;
  fetcher.mockImplementation(async (req: Request) => {
    if (req.url.includes("/admin/users")) {
      reads++;
      return Response.json(
        reads === 1
          ? { detail: "Expired" }
          : {
              items: [
                {
                  id: 3,
                  email: "google@example.test",
                  fullName: null,
                  phone: null,
                  role: "CUSTOMER",
                  status: "ACTIVE",
                  createdAt: "2026-11-06T00:00:00.000Z",
                  invitationExpiresAt: null,
                },
              ],
              nextCursor: null,
            },
        { status: reads === 1 ? 401 : 200 },
      );
    }
    return Response.json(
      req.url.endsWith("/csrf") ? { csrfToken: "csrf" } : session,
    );
  });
  expect((await client.listUsers({ role: "CUSTOMER" })).items[0]).toMatchObject(
    { role: "CUSTOMER", fullName: null },
  );
  expect(reads).toBe(2);
});

it("never replays a status mutation even when refresh succeeds", async () => {
  const client = await import("./client.js");
  await client.refreshSession();
  let patches = 0;
  fetcher.mockImplementation(async (req: Request) => {
    if (req.method === "PATCH") {
      patches++;
      expect(await req.json()).toEqual({ status: "SUSPENDED" });
      expect(req.headers.get("X-CSRF-Token")).toBe("csrf");
      return Response.json({ detail: "Expired" }, { status: 401 });
    }
    return Response.json(
      req.url.endsWith("/csrf") ? { csrfToken: "csrf" } : session,
    );
  });
  await expect(client.updateUserStatus(3, "SUSPENDED")).rejects.toMatchObject({
    problem: { status: 401 },
  });
  expect(patches).toBe(1);
  expect(client.isLogoutPending()).toBe(false);
});

it("announces terminal expiry in the same tab, blocks bootstrap and clears suspended sessions", async () => {
  const client = await import("./client.js");
  await client.refreshSession();
  const expired = vi.fn();
  client.sessionExpiredEvents.addEventListener("expired", expired);
  fetcher.mockImplementation(async (req: Request) =>
    Response.json(
      req.url.endsWith("/csrf")
        ? { csrfToken: "csrf" }
        : { detail: "Sign in again" },
      { status: req.url.endsWith("/csrf") ? 200 : 401 },
    ),
  );
  await expect(client.listUsers({})).rejects.toMatchObject({
    problem: { status: 401 },
  });
  expect(expired).toHaveBeenCalledTimes(1);
  const count = fetcher.mock.calls.length;
  await expect(client.listUsers({})).rejects.toThrow("Sign-out is pending");
  expect(fetcher).toHaveBeenCalledTimes(count);
});

it("does not refresh or discard the session on permission and offline errors", async () => {
  const client = await import("./client.js");
  await client.refreshSession();
  const expired = vi.fn();
  client.sessionExpiredEvents.addEventListener("expired", expired);
  fetcher.mockResolvedValue(
    Response.json({ detail: "Forbidden" }, { status: 403 }),
  );
  const count = fetcher.mock.calls.length;
  await expect(client.listUsers({})).rejects.toMatchObject({
    problem: { status: 403 },
  });
  expect(fetcher).toHaveBeenCalledTimes(count + 1);
  fetcher.mockRejectedValue(new TypeError("offline"));
  await expect(client.listUsers({})).rejects.toThrow("offline");
  expect(expired).not.toHaveBeenCalled();
});
