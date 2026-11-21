import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ForgotPassword, ResetPassword } from "./recovery.js";
import { requestPasswordReset, resetPassword } from "./client.js";

vi.mock("./client.js", () => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed.",
}));

const TOKEN = "A".repeat(43);
const GENERIC =
  "If an account can be reset, an email with a reset link will arrive shortly.";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/auth/reset-password");
});

const render1 = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("forgot password", () => {
  it("shows the same message for whatever address was entered", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ message: GENERIC });
    render1(<ForgotPassword />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "anyone@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(requestPasswordReset).toHaveBeenCalledWith("anyone@example.test");
    expect(screen.getByRole("link", { name: /Back to sign in/ })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });

  it("rejects an empty or malformed address before calling the API", async () => {
    render1(<ForgotPassword />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the email address you registered with.",
    );
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("ignores a second click while the request is pending", async () => {
    let finish: (value: { message: string }) => void = () => undefined;
    vi.mocked(requestPasswordReset).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render1(<ForgotPassword />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "anyone@example.test");
    const button = screen.getByRole("button", { name: "Send reset link" });
    await user.click(button);
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sending…" }));
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);
    finish({ message: GENERIC });
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
  });

  it("shows a readable error when the service is unavailable", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(
      new Error("Cannot reach SwiftDrop."),
    );
    render1(<ForgotPassword />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "anyone@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot reach SwiftDrop.",
    );
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});

describe("reset password", () => {
  const open = () => {
    window.history.replaceState(null, "", `/auth/reset-password#token=${TOKEN}`);
    return render1(<ResetPassword />);
  };

  it("removes the token from the address bar and refuses weak or mismatched passwords", async () => {
    open();
    expect(window.location.hash).toBe("");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(
      await screen.findByText("Use at least 15 characters."),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Password"));
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Password"), "A unique new passphrase!");
    await user.type(screen.getByLabelText("Confirm password"), "A different passphrase!");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("submits the fragment token once, clears the fields and points to sign in", async () => {
    vi.mocked(resetPassword).mockResolvedValue({
      message: "Your password was changed. Sign in with the new password.",
    });
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password"), "A unique new passphrase!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "A unique new passphrase!",
    );
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(
      await screen.findByText(/Your password was changed/),
    ).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledTimes(1);
    expect(resetPassword).toHaveBeenCalledWith(TOKEN, "A unique new passphrase!");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to sign in/ })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });

  it("explains an invalid or expired link and offers a new one", async () => {
    vi.mocked(resetPassword).mockRejectedValue(
      new Error("This password reset link is invalid or expired."),
    );
    open();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password"), "A unique new passphrase!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "A unique new passphrase!",
    );
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This password reset link is invalid or expired.",
    );
    expect(screen.getByRole("link", { name: /Request a new link/ })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("shows no form when the link carries no token", () => {
    window.history.replaceState(null, "", "/auth/reset-password");
    render1(<ResetPassword />);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This reset link is missing or invalid.",
    );
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
