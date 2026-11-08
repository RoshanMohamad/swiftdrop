import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SessionProvider, useSession } from "./session.js";
import { refreshSession } from "./client.js";
vi.mock("./client.js", () => ({
  refreshSession: vi.fn(),
  allowBootstrap: vi.fn(),
  clearSession: vi.fn(),
  blockBootstrap: vi.fn(),
  sessionEvents: null,
  sessionExpiredEvents: new EventTarget(),
  ApiError: class extends Error {},
  errorMessage: () => "Service unavailable.",
}));
function Probe() {
  const { state } = useSession();
  return <div role="status">{state.status}</div>;
}
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps protected content out while bootstrap is pending", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(refreshSession).mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("loading");
  reject(new Error("offline"));
  await screen.findByText("error");
});

it("removes authenticated content when this tab receives a terminal session failure", async () => {
  const { sessionExpiredEvents } = await import("./client.js");
  const { act } = await import("@testing-library/react");
  vi.mocked(refreshSession).mockResolvedValue({
    state: "authenticated",
    accessToken: "memory-token",
    tokenType: "Bearer",
    expiresIn: 900,
    user: {
      id: 1,
      email: "user@example.test",
      fullName: "Example User",
      phone: "+94771234567",
      role: "CUSTOMER",
      status: "ACTIVE",
      emailVerified: false,
      profileComplete: true,
    },
  });
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("authenticated");
  act(() => sessionExpiredEvents.dispatchEvent(new Event("expired")));
  expect(screen.getByRole("status")).toHaveTextContent("anonymous");
});
