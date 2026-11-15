import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CourierJob } from "@swiftdrop/contracts";
import { CourierJobs, projectedStatus } from "./pages.js";
import { createMemoryStore } from "./queue.js";
import { getCourierJobs, updateJobStatus } from "./client.js";

vi.mock("./client.js", () => ({
  getCourierJobs: vi.fn(),
  updateJobStatus: vi.fn(),
  uploadProof: vi.fn(),
  setDuty: vi.fn(),
}));
vi.mock("../auth/session.js", () => ({
  useSession: () => ({
    state: { status: "ready", user: { id: 7, role: "COURIER" } },
  }),
}));
vi.mock("../auth/client.js", () => ({
  isLogoutPending: () => false,
  errorMessage: (cause: unknown) =>
    cause instanceof Error ? cause.message : "Something went wrong.",
  ApiError: class extends Error {
    constructor(public problem: { status: number; detail: string }) {
      super(problem.detail);
    }
  },
}));

const job: CourierJob = {
  id: "11111111-1111-4111-8111-111111111111",
  trackingNumber: "SD-BBBB2222-X",
  status: "OUT_FOR_DELIVERY",
  version: 6,
  attemptCount: 1,
  originTown: "Colombo",
  destinationTown: "Kandy",
  recipientName: "Kamal Perera",
  recipientPhone: "+94771234567",
  recipientAddress: "12 Lake Road",
  assignedAt: new Date().toISOString(),
};
const profile = {
  userId: 7,
  fullName: "Rider",
  onDuty: true,
  capacity: 5,
  workload: 1,
  hasProfile: true,
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(getCourierJobs).mockResolvedValue({ items: [job], profile });
});

describe("projectedStatus", () => {
  it("uses the last queued status for the job", () => {
    expect(projectedStatus(job, [])).toBe("OUT_FOR_DELIVERY");
    expect(
      projectedStatus(job, [
        {
          key: "k",
          userId: 7,
          parcelId: job.id,
          createdAt: 1,
          state: "pending",
          body: {
            to: "DELIVERED",
            town: "Kandy",
            version: 6,
            receivedBy: "A B",
          },
        },
      ]),
    ).toBe("DELIVERED");
  });
});

describe("CourierJobs (FR-F6)", () => {
  it("lists assigned jobs and shows recipient details on selection", async () => {
    const user = userEvent.setup();
    render(<CourierJobs store={createMemoryStore()} />);
    await user.click(
      await screen.findByRole("button", { name: /SD-BBBB2222-X/ }),
    );
    expect(screen.getByText("Kamal Perera")).toBeInTheDocument();
    expect(screen.getByText("12 Lake Road")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delivered" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delivery failed" }),
    ).toBeInTheDocument();
  });

  it("requires the receiver's name and a failure reason", async () => {
    const user = userEvent.setup();
    render(<CourierJobs store={createMemoryStore()} />);
    await user.click(
      await screen.findByRole("button", { name: /SD-BBBB2222-X/ }),
    );
    await user.click(screen.getByRole("button", { name: "Delivered" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/name of the person/i);
    expect(updateJobStatus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Delivery failed" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /why the delivery failed/i,
    );
  });

  it("sends a delivery with the stable key and expected version", async () => {
    vi.mocked(updateJobStatus).mockResolvedValue({
      status: "DELIVERED",
      version: 7,
      attemptCount: 1,
      replayed: false,
    });
    const store = createMemoryStore();
    const user = userEvent.setup();
    render(<CourierJobs store={store} />);
    await user.click(
      await screen.findByRole("button", { name: /SD-BBBB2222-X/ }),
    );
    await user.click(screen.getByRole("button", { name: "Delivered" }));
    await user.type(screen.getByLabelText(/Received by/), "Nimal Perera");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(updateJobStatus).toHaveBeenCalledTimes(1));
    const [parcelId, key, body] = vi.mocked(updateJobStatus).mock.calls[0]!;
    expect(parcelId).toBe(job.id);
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body).toMatchObject({
      to: "DELIVERED",
      receivedBy: "Nimal Perera",
      version: 6,
    });
    await waitFor(async () => expect(await store.list()).toHaveLength(0));
  });

  it("keeps the update queued when the network fails and says so", async () => {
    vi.mocked(updateJobStatus).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    const store = createMemoryStore();
    const user = userEvent.setup();
    render(<CourierJobs store={store} />);
    await user.click(
      await screen.findByRole("button", { name: /SD-BBBB2222-X/ }),
    );
    await user.click(screen.getByRole("button", { name: "Delivery failed" }));
    await user.selectOptions(
      screen.getByLabelText(/Reason/),
      "RECIPIENT_ABSENT",
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(/waiting to send/i)).toBeInTheDocument();
    expect(await store.list()).toHaveLength(1);
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("falls back to the last saved list when offline and shows an empty state", async () => {
    vi.mocked(getCourierJobs).mockResolvedValueOnce({ items: [job], profile });
    const { unmount } = render(<CourierJobs store={createMemoryStore()} />);
    await screen.findByRole("button", { name: /SD-BBBB2222-X/ });
    unmount();
    vi.mocked(getCourierJobs).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    render(<CourierJobs store={createMemoryStore()} />);
    expect(
      await screen.findByRole("button", { name: /SD-BBBB2222-X/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/last saved list/i)).toBeInTheDocument();

    cleanup();
    localStorage.clear();
    vi.mocked(getCourierJobs).mockResolvedValue({ items: [], profile });
    render(<CourierJobs store={createMemoryStore()} />);
    expect(
      await screen.findByText(/No parcels are assigned/i),
    ).toBeInTheDocument();
  });
});
