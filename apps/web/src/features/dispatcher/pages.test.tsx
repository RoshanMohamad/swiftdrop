import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DispatcherConsole, courierOption } from "./pages.js";
import { assignParcel, listCouriers, listDispatchParcels } from "./client.js";

vi.mock("./client.js", () => ({
  listDispatchParcels: vi.fn(),
  listCouriers: vi.fn(),
  assignParcel: vi.fn(),
  updateCourierProfile: vi.fn(),
}));
vi.mock("../auth/client.js", () => ({
  errorMessage: (cause: unknown) =>
    cause instanceof Error ? cause.message : "Something went wrong.",
}));

const parcel = {
  id: "11111111-1111-4111-8111-111111111111",
  trackingNumber: "SD-AAAA1111-X",
  status: "CREATED" as const,
  version: 4,
  attemptCount: 0,
  originZoneId: 1,
  originTown: "Colombo",
  destinationTown: "Kandy",
  courierId: null,
  createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
};
const couriers = [
  {
    userId: 10,
    fullName: "Ready Rider",
    onDuty: true,
    capacity: 5,
    workload: 1,
    hasProfile: true,
  },
  {
    userId: 11,
    fullName: "Full Rider",
    onDuty: true,
    capacity: 2,
    workload: 2,
    hasProfile: true,
  },
  {
    userId: 12,
    fullName: "Resting Rider",
    onDuty: false,
    capacity: 5,
    workload: 0,
    hasProfile: true,
  },
];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(listDispatchParcels).mockResolvedValue({
    items: [parcel],
    nextCursor: null,
  });
  vi.mocked(listCouriers).mockResolvedValue(couriers);
});

describe("courierOption", () => {
  it("disables couriers that cannot take a parcel and says why", () => {
    expect(courierOption(couriers[0]!)).toEqual({
      label: "Ready Rider — 1/5",
      disabled: false,
    });
    expect(courierOption(couriers[1]!)).toMatchObject({ disabled: true });
    expect(courierOption(couriers[1]!).label).toContain("full");
    expect(courierOption(couriers[2]!).label).toContain("off duty");
    expect(
      courierOption({ ...couriers[0]!, hasProfile: false }).label,
    ).toContain("no profile");
  });
});

describe("DispatcherConsole (FR-F8)", () => {
  it("shows the queue, an empty state and courier workload", async () => {
    render(<DispatcherConsole />);
    expect(await screen.findByText("SD-AAAA1111-X")).toBeInTheDocument();
    expect(screen.getByText("Colombo → Kandy")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Courier workload" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Resting Rider")).toBeInTheDocument();

    cleanup();
    vi.mocked(listDispatchParcels).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    render(<DispatcherConsole />);
    expect(await screen.findByText(/queue is empty/i)).toBeInTheDocument();
  });

  it("assigns with the parcel version and confirms", async () => {
    vi.mocked(assignParcel).mockResolvedValue({
      parcelId: parcel.id,
      courierId: 10,
      version: 5,
      changed: true,
    });
    const user = userEvent.setup();
    render(<DispatcherConsole />);
    await user.click(await screen.findByRole("button", { name: "Assign" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("option", { name: /Full Rider.*full/ }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("option", { name: /Resting Rider.*off duty/ }),
    ).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText("Courier"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(assignParcel).toHaveBeenCalledWith(parcel.id, 10, 4);
    expect(
      await screen.findByText("SD-AAAA1111-X assigned."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open and shows the conflict message", async () => {
    vi.mocked(assignParcel).mockRejectedValue(
      new Error("This parcel was changed by someone else. Refresh and retry."),
    );
    const user = userEvent.setup();
    render(<DispatcherConsole />);
    await user.click(await screen.findByRole("button", { name: "Assign" }));
    await user.selectOptions(screen.getByLabelText("Courier"), "10");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /changed by someone else/,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("requires choosing a courier", async () => {
    const user = userEvent.setup();
    render(<DispatcherConsole />);
    await user.click(await screen.findByRole("button", { name: "Assign" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a courier.");
    expect(assignParcel).not.toHaveBeenCalled();
  });

  it("shows a retryable error when loading fails", async () => {
    vi.mocked(listDispatchParcels).mockRejectedValueOnce(
      new Error("Service unavailable."),
    );
    const user = userEvent.setup();
    render(<DispatcherConsole />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service unavailable.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("SD-AAAA1111-X")).toBeInTheDocument();
  });

  it("keeps Tab focus inside the dialog and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<DispatcherConsole />);
    await user.click(await screen.findByRole("button", { name: "Assign" }));
    const dialog = screen.getByRole("dialog");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    cancel.focus();
    await user.tab(); // wraps from the last control back to the first
    expect(within(dialog).getByLabelText("Courier")).toHaveFocus();
    await user.tab({ shift: true }); // and back to the last
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
