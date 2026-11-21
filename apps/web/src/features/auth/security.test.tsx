import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveSessions, ChangePasswordForm } from "./security.js";
import { changePassword, listSessions, revokeSession } from "./client.js";

const accept = vi.fn();
const clear = vi.fn();
vi.mock("./session.js", () => ({
  useSession: () => ({ accept, clear, state: { status: "authenticated" } }),
}));
vi.mock("./client.js", () => ({
  changePassword: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed.",
}));

const session = {
  state: "authenticated" as const,
  accessToken: "new-token",
  tokenType: "Bearer" as const,
  expiresIn: 900,
  user: { id: 1, email: "a@example.test" },
};
const stamp = "2026-11-14T10:00:00.000Z";
const item = (id: string, current: boolean) => ({
  id,
  current,
  authenticatedAt: stamp,
  lastRefreshedAt: stamp,
  idleExpiresAt: stamp,
  absoluteExpiresAt: stamp,
});
const ID_HERE = "11111111-1111-4111-8111-111111111111";
const ID_OTHER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("change password", () => {
  async function fill(current: string, next: string, confirm = next) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Current password"), current);
    await user.type(screen.getByLabelText("New password"), next);
    await user.type(screen.getByLabelText("Confirm new password"), confirm);
    await user.click(screen.getByRole("button", { name: "Change password" }));
  }

  it("adopts the new session, reloads sessions and empties the fields", async () => {
    vi.mocked(changePassword).mockResolvedValue(session as never);
    const onChanged = vi.fn();
    render(<ChangePasswordForm onChanged={onChanged} />);
    await fill("the old passphrase", "A brand new passphrase 1!");
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith(
      "the old passphrase",
      "A brand new passphrase 1!",
    );
    expect(accept).toHaveBeenCalledWith(session);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("validates before calling the API", async () => {
    render(<ChangePasswordForm onChanged={vi.fn()} />);
    await fill("the old passphrase", "short");
    expect(await screen.findByText("Use at least 15 characters.")).toBeInTheDocument();
    await fill("the old passphrase", "A brand new passphrase 1!", "A different one 2!!!");
    expect(await screen.findByText("The new passwords do not match.")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and still clears the secrets", async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new Error("The current password is incorrect."),
    );
    render(<ChangePasswordForm onChanged={vi.fn()} />);
    await fill("a wrong passphrase", "A brand new passphrase 1!");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The current password is incorrect.",
    );
    expect(accept).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
  });
});

describe("active sessions", () => {
  it("lists sessions and labels this device", async () => {
    vi.mocked(listSessions).mockResolvedValue({
      items: [item(ID_HERE, true), item(ID_OTHER, false)],
      nextCursor: null,
    });
    render(<ActiveSessions reloadKey={0} />);
    expect(await screen.findByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Another device")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(2);
  });

  it("revokes another device and refreshes the list without signing out here", async () => {
    vi.mocked(listSessions)
      .mockResolvedValueOnce({
        items: [item(ID_HERE, true), item(ID_OTHER, false)],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [item(ID_HERE, true)], nextCursor: null });
    vi.mocked(revokeSession).mockResolvedValue(undefined);
    render(<ActiveSessions reloadKey={0} />);
    const user = userEvent.setup();
    await screen.findByText("Another device");
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    await user.click(buttons[1]!);
    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith(ID_OTHER, false));
    await waitFor(() =>
      expect(screen.queryByText("Another device")).not.toBeInTheDocument(),
    );
    expect(clear).not.toHaveBeenCalled();
  });

  it("signs this browser out when its own session is revoked", async () => {
    vi.mocked(listSessions).mockResolvedValue({
      items: [item(ID_HERE, true)],
      nextCursor: null,
    });
    vi.mocked(revokeSession).mockResolvedValue(undefined);
    render(<ActiveSessions reloadKey={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith(ID_HERE, true));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the confirmation is declined", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    vi.mocked(listSessions).mockResolvedValue({
      items: [item(ID_OTHER, false)],
      nextCursor: null,
    });
    render(<ActiveSessions reloadKey={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("reports a failed revoke and keeps the list", async () => {
    vi.mocked(listSessions).mockResolvedValue({
      items: [item(ID_OTHER, false)],
      nextCursor: null,
    });
    vi.mocked(revokeSession).mockRejectedValue(new Error("Session not found."));
    render(<ActiveSessions reloadKey={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Session not found.");
    expect(screen.getByText("Another device")).toBeInTheDocument();
  });

  it("shows an error instead of an empty list when loading fails", async () => {
    vi.mocked(listSessions).mockRejectedValue(new Error("Cannot reach SwiftDrop."));
    render(<ActiveSessions reloadKey={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach SwiftDrop.");
    expect(screen.queryByText("No other active sessions.")).not.toBeInTheDocument();
  });
});

describe("active sessions pagination", () => {
  it("loads further pages on request and appends them", async () => {
    vi.mocked(listSessions)
      .mockResolvedValueOnce({ items: [item(ID_HERE, true)], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [item(ID_OTHER, false)], nextCursor: null });
    render(<ActiveSessions reloadKey={0} />);
    const user = userEvent.setup();
    await screen.findByText("This device");
    expect(screen.queryByText("Another device")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more sessions" }));
    expect(await screen.findByText("Another device")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(listSessions).toHaveBeenLastCalledWith("cursor-2");
    expect(
      screen.queryByRole("button", { name: "Show more sessions" }),
    ).not.toBeInTheDocument();
  });
});
