import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Guard } from "./Guard.js";
import * as sessionModule from "../../features/auth/session.js";
import type { PublicUser } from "@swiftdrop/contracts";

vi.mock("../../features/auth/session.js", async () => {
  const actual = await vi.importActual<typeof sessionModule>(
    "../../features/auth/session.js",
  );
  return {
    ...actual,
    useSession: vi.fn(),
  };
});

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

describe("Guard Route Protection (RequireRole)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated user to /auth/login", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("anonymous", null),
    );

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <Guard role="CUSTOMER">
                <div>Protected Content</div>
              </Guard>
            }
          />
          <Route path="/auth/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("redirects user with incomplete profile to /auth/complete-profile", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("authenticated", {
        id: 1,
        email: "user@example.test",
        fullName: "Pending User",
        phone: "+94771234567",
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerified: false,
        profileComplete: false,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <Guard role="CUSTOMER">
                <div>Protected Content</div>
              </Guard>
            }
          />
          <Route
            path="/auth/complete-profile"
            element={<div>Complete Profile Page</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Complete Profile Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("redirects user to their role home if role does not match single required role", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("authenticated", {
        id: 2,
        email: "merchant@example.test",
        fullName: "Merchant User",
        phone: "+94771234567",
        role: "MERCHANT",
        status: "ACTIVE",
        emailVerified: true,
        profileComplete: true,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/admin-only"]}>
        <Routes>
          <Route
            path="/admin-only"
            element={
              <Guard role="ADMIN">
                <div>Admin Content</div>
              </Guard>
            }
          />
          <Route
            path="/merchant/onboarding"
            element={<div>Merchant Workspace</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Merchant Workspace")).toBeInTheDocument();
    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
  });

  it("renders protected content when role matches single required role", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("authenticated", {
        id: 3,
        email: "admin@example.test",
        fullName: "Admin User",
        phone: "+94771234567",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerified: true,
        profileComplete: true,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/admin-only"]}>
        <Routes>
          <Route
            path="/admin-only"
            element={
              <Guard role="ADMIN">
                <div>Admin Content</div>
              </Guard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Admin Content")).toBeInTheDocument();
  });

  it("renders protected content when role is included in allowed roles array", () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(
      mockSession("authenticated", {
        id: 4,
        email: "dispatcher@example.test",
        fullName: "Dispatcher User",
        phone: "+94771234567",
        role: "DISPATCHER",
        status: "ACTIVE",
        emailVerified: true,
        profileComplete: true,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <Routes>
          <Route
            path="/reports"
            element={
              <Guard roles={["ADMIN", "DISPATCHER"]}>
                <div>Operational Reports Content</div>
              </Guard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Operational Reports Content"),
    ).toBeInTheDocument();
  });
});
