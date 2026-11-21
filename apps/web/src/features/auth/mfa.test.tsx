import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MfaChallengeStep, MfaSettings } from "./mfa.js";
import { ReauthDialog } from "./reauth.js";
import {
  completeMfa,
  confirmMfa,
  disableMfa,
  enrolMfa,
  getMfaStatus,
  recoverMfa,
  reauthenticate,
  regenerateRecoveryCodes,
  setReauthHandler,
  ApiError,
} from "./client.js";

vi.mock("./client.js", async () => {
  class ApiError extends Error {
    constructor(public problem: { code: string; status: number; detail: string }) {
      super(problem.detail);
    }
  }
  return {
    ApiError,
    completeMfa: vi.fn(),
    recoverMfa: vi.fn(),
    getMfaStatus: vi.fn(),
    enrolMfa: vi.fn(),
    confirmMfa: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
    disableMfa: vi.fn(),
    reauthenticate: vi.fn(),
    setReauthHandler: vi.fn(),
    errorMessage: (error: unknown) =>
      error instanceof Error ? error.message : "Request failed.",
  };
});
let sessionStatus: "authenticated" | "anonymous" = "authenticated";
vi.mock("./session.js", () => ({
  useSession: () => ({ state: { status: sessionStatus }, accept: vi.fn(), clear: vi.fn() }),
}));

const TOKEN = "B".repeat(43);
const session = { state: "authenticated", accessToken: "t" } as never;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStatus = "authenticated";
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("sign-in second step", () => {
  const show = (onSession = vi.fn(), onCancel = vi.fn()) => {
    render(<MfaChallengeStep challengeToken={TOKEN} onSession={onSession} onCancel={onCancel} />);
    return { onSession, onCancel };
  };

  it("sends a 6 digit code with the challenge and hands over the session", async () => {
    vi.mocked(completeMfa).mockResolvedValue(session);
    const { onSession } = show();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(session));
    expect(completeMfa).toHaveBeenCalledWith(TOKEN, "123456");
  });

  it("rejects a malformed code locally without calling the API", async () => {
    show();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "12ab");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the 6 digit code");
    expect(completeMfa).not.toHaveBeenCalled();
  });

  it("shows the server's refusal, clears the field and stays on the step", async () => {
    vi.mocked(completeMfa).mockRejectedValue(new Error("The code is incorrect or the sign-in expired."));
    const { onSession } = show();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("incorrect or the sign-in expired");
    expect(screen.getByLabelText("6 digit code")).toHaveValue("");
    expect(onSession).not.toHaveBeenCalled();
  });

  it("switches to a recovery code and back", async () => {
    vi.mocked(recoverMfa).mockResolvedValue(session);
    const { onSession } = show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Use a recovery code" }));
    expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Recovery code"), "ABCDE-FGHJK");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(onSession).toHaveBeenCalled());
    expect(recoverMfa).toHaveBeenCalledWith(TOKEN, "ABCDE-FGHJK");
    await user.click(screen.getByRole("button", { name: "Use an authenticator code instead" }));
    expect(screen.getByLabelText("6 digit code")).toBeInTheDocument();
  });

  it("lets the user start over", async () => {
    const { onCancel } = show();
    await userEvent.setup().click(screen.getByRole("button", { name: "Start over" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("two-step verification settings", () => {
  const off = { enabled: false, pendingEnrolment: false, recoveryCodesRemaining: 0, required: false };
  const on = { enabled: true, pendingEnrolment: false, recoveryCodesRemaining: 10, required: false };
  const codes = Array.from({ length: 10 }, (_, i) => `ABCD${i}-EFGHJ`);

  it("enrols: shows the key, confirms a code, then shows recovery codes once", async () => {
    vi.mocked(getMfaStatus).mockResolvedValueOnce(off).mockResolvedValue(on);
    vi.mocked(enrolMfa).mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/SwiftDrop:a?secret=X",
    });
    vi.mocked(confirmMfa).mockResolvedValue({ recoveryCodes: codes });
    render(<MfaSettings />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up authenticator app" }));
    expect(await screen.findByLabelText("Setup key")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");
    await user.type(screen.getByLabelText("6 digit code"), "654321");
    await user.click(screen.getByRole("button", { name: "Turn on two-step verification" }));
    expect(await screen.findByRole("list", { name: "Recovery codes" })).toBeInTheDocument();
    expect(confirmMfa).toHaveBeenCalledWith("654321");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "I have saved these codes" }));
    expect(screen.queryByRole("list", { name: "Recovery codes" })).not.toBeInTheDocument();
    expect(screen.getByText(/10 recovery codes left/)).toBeInTheDocument();
  });

  it("refuses a bad confirmation code locally", async () => {
    vi.mocked(getMfaStatus).mockResolvedValue(off);
    vi.mocked(enrolMfa).mockResolvedValue({ secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", otpauthUri: "otpauth://x" });
    render(<MfaSettings />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up authenticator app" }));
    await user.type(await screen.findByLabelText("6 digit code"), "12");
    await user.click(screen.getByRole("button", { name: "Turn on two-step verification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the 6 digit code");
    expect(confirmMfa).not.toHaveBeenCalled();
  });

  it("replaces recovery codes and turns the factor off after confirmation", async () => {
    vi.mocked(getMfaStatus).mockResolvedValueOnce(on).mockResolvedValueOnce(on).mockResolvedValue(off);
    vi.mocked(regenerateRecoveryCodes).mockResolvedValue({ recoveryCodes: codes });
    vi.mocked(disableMfa).mockResolvedValue(undefined);
    render(<MfaSettings />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Get new recovery codes" }));
    expect(await screen.findByRole("list", { name: "Recovery codes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(disableMfa).toHaveBeenCalledTimes(1));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Set up authenticator app" })).toBeInTheDocument();
  });

  it("does not turn off when the confirmation is declined, or when the role requires it", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    vi.mocked(getMfaStatus).mockResolvedValue(on);
    const { unmount } = render(<MfaSettings />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Turn off" }));
    expect(disableMfa).not.toHaveBeenCalled();
    unmount();
    vi.mocked(getMfaStatus).mockResolvedValue({ ...on, required: true });
    render(<MfaSettings />);
    expect(await screen.findByRole("button", { name: "Turn off" })).toBeDisabled();
    expect(screen.getByText(/requires two-step verification/)).toBeInTheDocument();
  });

  it("reports a failure instead of pretending it worked", async () => {
    vi.mocked(getMfaStatus).mockResolvedValue(off);
    vi.mocked(enrolMfa).mockRejectedValue(new Error("Confirm your password to continue."));
    render(<MfaSettings />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Set up authenticator app" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirm your password to continue.");
    expect(screen.queryByLabelText("Setup key")).not.toBeInTheDocument();
  });
});

describe("re-authentication dialog", () => {
  /** The handler the dialog registers with the API client. */
  const handler = () => {
    const call = vi.mocked(setReauthHandler).mock.calls.find((c) => c[0] !== null);
    expect(call).toBeDefined();
    return call![0] as () => Promise<boolean>;
  };

  it("registers only while signed in", () => {
    sessionStatus = "anonymous";
    render(<ReauthDialog />);
    expect(setReauthHandler).not.toHaveBeenCalledWith(expect.any(Function));
  });

  it("asks for the password, confirms, and lets the refused action repeat", async () => {
    vi.mocked(reauthenticate).mockResolvedValue({ reauthenticatedAt: new Date().toISOString() });
    render(<ReauthDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const outcome = handler()();
    const dialog = await screen.findByRole("dialog", { name: "Confirm it is you" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password"), "my password phrase");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await expect(outcome).resolves.toBe(true);
    expect(reauthenticate).toHaveBeenCalledWith("my password phrase", undefined);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("asks for the authenticator code when the account has one", async () => {
    vi.mocked(reauthenticate)
      .mockRejectedValueOnce(
        new ApiError({ code: "MFA_CODE_REQUIRED", status: 400, detail: "Enter the 6 digit code." } as never),
      )
      .mockResolvedValueOnce({ reauthenticatedAt: new Date().toISOString() });
    render(<ReauthDialog />);
    const outcome = handler()();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Password"), "my password phrase");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByLabelText("6 digit code")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6 digit code.");
    await user.type(screen.getByLabelText("Password"), "my password phrase");
    await user.type(screen.getByLabelText("6 digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await expect(outcome).resolves.toBe(true);
    expect(reauthenticate).toHaveBeenLastCalledWith("my password phrase", "123456");
  });

  it("cancelling, with the button or Escape, leaves the action unperformed", async () => {
    render(<ReauthDialog />);
    const first = handler()();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await expect(first).resolves.toBe(false);
    const second = handler()();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await expect(second).resolves.toBe(false);
    expect(reauthenticate).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with an error when the password is wrong", async () => {
    vi.mocked(reauthenticate).mockRejectedValue(new Error("The password or code is incorrect."));
    render(<ReauthDialog />);
    void handler()();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Password"), "not my password");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The password or code is incorrect.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("gives two simultaneous refused actions the same answer", async () => {
    vi.mocked(reauthenticate).mockResolvedValue({ reauthenticatedAt: new Date().toISOString() });
    render(<ReauthDialog />);
    const [a, b] = [handler()(), handler()()];
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Password"), "my password phrase");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(reauthenticate).toHaveBeenCalledTimes(1);
  });
});
