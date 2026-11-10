import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminUsers, NewStaff } from "./pages.js";
import {
  ApiError,
  createStaff,
  listUsers,
  updateInvitation,
  updateUserStatus,
} from "../auth/client.js";

const invited = {
  id: 4,
  fullName: "Dispatch Staff",
  email: "dispatch@example.test",
  phone: "+94771234567",
  role: "DISPATCHER" as const,
  status: "INVITED" as const,
  createdAt: "2026-10-30T00:00:00.000Z",
  invitationExpiresAt: "2026-10-31T00:00:00.000Z",
};

vi.mock("../auth/client.js", () => ({
  createStaff: vi.fn(),
  listUsers: vi.fn(),
  updateInvitation: vi.fn(),
  updateUserStatus: vi.fn(),
  ApiError: class extends Error {
    constructor(public problem: { status: number; detail: string }) {
      super(problem.detail);
    }
  },
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed.",
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(listUsers).mockResolvedValue({
    items: [invited],
    nextCursor: null,
  });
});

function page() {
  return render(
    <MemoryRouter>
      <AdminUsers />
    </MemoryRouter>,
  );
}

describe("admin staff users", () => {
  it("shows invitation state and refreshes after resend", async () => {
    vi.mocked(updateInvitation).mockResolvedValue({
      user: invited,
      delivery: "failed",
    });
    page();
    expect(await screen.findByText("Dispatch Staff")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Resend" }));
    expect(await screen.findByText(/could not be sent/)).toBeInTheDocument();
    expect(updateInvitation).toHaveBeenCalledWith(4, "resend");
  });

  it("offers an empty state and recovers from list failure", async () => {
    vi.mocked(listUsers).mockRejectedValue(
      new Error("Cannot reach SwiftDrop."),
    );
    page();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot reach SwiftDrop.",
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("links create validation to fields and focuses the first error", async () => {
    render(
      <MemoryRouter>
        <NewStaff />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(screen.getByLabelText("Full name")).toHaveFocus();
    expect(screen.getByText("Enter your full name.")).toBeInTheDocument();
    expect(createStaff).not.toHaveBeenCalled();
  });
});

it("lists all roles, shows incomplete profiles and confirms suspension with session consequences", async () => {
  const { updateUserStatus } = await import("../auth/client.js");
  const active = {
    ...invited,
    id: 5,
    role: "CUSTOMER" as const,
    status: "ACTIVE" as const,
    fullName: null,
    phone: null,
    invitationExpiresAt: null,
  };
  vi.mocked(listUsers).mockResolvedValue({ items: [active], nextCursor: null });
  vi.mocked(updateUserStatus).mockResolvedValue({
    ...active,
    status: "SUSPENDED",
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  page();
  expect(await screen.findByText("Profile incomplete")).toBeInTheDocument();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Role"), "CUSTOMER");
  await user.click(await screen.findByRole("button", { name: "Suspend" }));
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining("All their sessions"),
  );
  expect(updateUserStatus).toHaveBeenCalledWith(5, "SUSPENDED");
  expect(await screen.findByText(/all sessions revoked/)).toBeInTheDocument();
  expect(listUsers).toHaveBeenLastCalledWith(
    expect.objectContaining({ role: "CUSTOMER" }),
  );
  expect(
    screen.queryByRole("button", { name: "Resend" }),
  ).not.toBeInTheDocument();
  confirm.mockRestore();
});

it("supports cancellation, prevents duplicate submission and explains reactivation", async () => {
  const { updateUserStatus } = await import("../auth/client.js");
  const suspended = {
    ...invited,
    status: "SUSPENDED" as const,
    invitationExpiresAt: null,
  };
  vi.mocked(listUsers).mockResolvedValue({
    items: [suspended],
    nextCursor: null,
  });
  let resolve!: (value: typeof suspended) => void;
  vi.mocked(updateUserStatus).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  page();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Reactivate" }));
  expect(updateUserStatus).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await user.dblClick(screen.getByRole("button", { name: "Reactivate" }));
  expect(updateUserStatus).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenLastCalledWith(
    expect.stringContaining("Old sessions will remain revoked"),
  );
  resolve(suspended);
  await screen.findByRole("button", { name: "Reactivate" });
  confirm.mockRestore();
});

it("retains controls and shows an alert after a failed mutation", async () => {
  const { updateUserStatus } = await import("../auth/client.js");
  vi.mocked(listUsers).mockResolvedValue({
    items: [{ ...invited, status: "ACTIVE" }],
    nextCursor: null,
  });
  vi.mocked(updateUserStatus).mockRejectedValue(
    new Error("Cannot reach SwiftDrop."),
  );
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  page();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Suspend" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cannot reach SwiftDrop.",
  );
  expect(screen.getByRole("button", { name: "Suspend" })).toBeEnabled();
  confirm.mockRestore();
});

it("keeps the users screen accessible to assistive technology", async () => {
  const { default: axe } = await import("axe-core");
  const view = page();
  await screen.findByText("Dispatch Staff");
  expect(
    (
      await axe.run(view.container, {
        rules: { "color-contrast": { enabled: false } },
      })
    ).violations,
  ).toEqual([]);
});

it("returns to the first page when a status change empties the current filtered page", async () => {
  const active = {
    ...invited,
    status: "ACTIVE" as const,
    invitationExpiresAt: null,
  };
  vi.mocked(listUsers)
    .mockResolvedValueOnce({ items: [active], nextCursor: "page-two" })
    .mockResolvedValueOnce({ items: [active], nextCursor: null })
    .mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(updateUserStatus).mockResolvedValue({
    ...active,
    status: "SUSPENDED",
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  page();
  const user = userEvent.setup();
  await screen.findByText("Dispatch Staff");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(await screen.findByRole("button", { name: "Suspend" }));
  expect(
    await screen.findByText("No users match these filters."),
  ).toBeInTheDocument();
  expect(listUsers).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: undefined }),
  );
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  confirm.mockRestore();
});

it("reconciles a state conflict against the current list and keeps the error visible", async () => {
  const active = {
    ...invited,
    status: "ACTIVE" as const,
    invitationExpiresAt: null,
  };
  vi.mocked(listUsers)
    .mockResolvedValueOnce({ items: [active], nextCursor: null })
    .mockResolvedValue({
      items: [{ ...active, status: "SUSPENDED" }],
      nextCursor: null,
    });
  vi.mocked(updateUserStatus).mockRejectedValue(
    new ApiError({
      type: "about:blank",
      title: "Rejected",
      status: 409,
      detail: "Account state changed.",
      code: "INVITATION_REQUIRED",
      correlationId: "test",
    }),
  );
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  page();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Suspend" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Account state changed.",
  );
  expect(
    await screen.findByRole("button", { name: "Reactivate" }),
  ).toBeEnabled();
  expect(listUsers).toHaveBeenCalledTimes(2);
  confirm.mockRestore();
});
