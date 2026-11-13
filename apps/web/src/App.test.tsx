import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";
import * as sessionModule from "./features/auth/session.js";
import type { PublicUser } from "@swiftdrop/contracts";

vi.mock("./features/auth/session.js", async () => {
  const actual = await vi.importActual<typeof sessionModule>(
    "./features/auth/session.js",
  );
  return {
    ...actual,
    useSession: vi.fn(),
  };
});

vi.mock("./features/assistant/index.js", () => ({
  ChatWidget: () => <div data-testid="chat-widget">Chat Widget Mock</div>,
}));

function mockSession(
  status: "loading" | "anonymous" | "authenticated" | "error",
  user: PublicUser | null = null,
  message = "",
) {
  return {
    state: { status, user, message },
    accept: vi.fn(),
    updateUser: vi.fn(),
    clear: vi.fn(),
    bootstrap: vi.fn(),
  };
}

describe("App & AppShell Root Integration", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the accessible shell with skip-link and brand home link", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("anonymous", null),
    );

    render(
      <MemoryRouter initialEntries={["/auth/login"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("Skip to content")).toHaveAttribute(
      "href",
      "#main",
    );
    expect(screen.getByLabelText("SwiftDrop home")).toBeInTheDocument();
    expect(screen.getByText("Made to move.")).toBeInTheDocument();
    expect(
      screen.getByText("Every delivery, a connection."),
    ).toBeInTheDocument();
  });

  it("renders session loading state while bootstrapping", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("loading", null),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("Restoring your session…")).toBeInTheDocument();
  });

  it("renders reconnect notice when session status is error", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("error", null, "Failed to connect to auth server."),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("Let’s reconnect.")).toBeInTheDocument();
    expect(
      screen.getByText("Failed to connect to auth server."),
    ).toBeInTheDocument();
  });

  it("renders 404 page for unmatched routes", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("anonymous", null),
    );

    render(
      <MemoryRouter initialEntries={["/some/nonexistent/page"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("Page not found.")).toBeInTheDocument();
    expect(screen.getByText("Back to SwiftDrop")).toBeInTheDocument();
  });

  it("renders sign out controls when authenticated", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("authenticated", {
        id: 1,
        email: "customer@example.test",
        fullName: "Customer Demo",
        phone: "+94771234567",
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerified: true,
        profileComplete: true,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/account"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("Sign out")).toBeInTheDocument();
    expect(screen.getByText("Sign out everywhere")).toBeInTheDocument();
  });
});
