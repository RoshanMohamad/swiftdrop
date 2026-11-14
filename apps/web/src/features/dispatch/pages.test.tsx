import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  AssignmentModal,
  AssignmentsPage,
  DispatchHistoryPage,
} from "./pages.js";
import {
  ApiError,
  assignDispatchParcel,
  getDispatchParcelAssignment,
  listCourierCapacity,
  listDispatchAssignments,
  listDispatchHistory,
} from "../auth/client.js";

const parcel = {
  id: "11111111-1111-4111-8111-111111111111",
  trackingNumber: "SDABC12345",
  status: "CREATED" as const,
  version: 1,
  dispatchVersion: 4,
  originZoneId: 7,
  originTown: "Colombo",
  destinationTown: "Kandy",
  weightGrams: 500,
  createdAt: "2026-11-13T10:00:00.000Z",
};

const couriers = [
  {
    courierUserId: 12,
    fullName: "Courier One",
    onDuty: true,
    maxCapacity: 3,
    currentWorkload: 1,
    availableCapacity: 2,
    utilizationPercent: 33.3,
    assignments: [],
  },
  {
    courierUserId: 13,
    fullName: "Courier Two",
    onDuty: false,
    maxCapacity: 3,
    currentWorkload: 0,
    availableCapacity: 3,
    utilizationPercent: 0,
    assignments: [],
  },
  {
    courierUserId: 14,
    fullName: "Courier Full",
    onDuty: true,
    maxCapacity: 1,
    currentWorkload: 1,
    availableCapacity: 0,
    utilizationPercent: 100,
    assignments: [],
  },
];
const assignment = {
  id: "33333333-3333-4333-8333-333333333333",
  parcelId: parcel.id,
  courierUserId: 12,
  courierName: "Courier One",
  dispatchVersion: 5,
  status: "ACTIVE" as const,
  assignedAt: "2026-11-13T10:01:00.000Z",
  releasedAt: null,
  parcel,
};

vi.mock("../auth/client.js", () => ({
  ApiError: class ApiError extends Error {
    problem: { status: number; code: string; detail: string };
    constructor(problem: { status: number; code: string; detail: string }) {
      super(problem.detail);
      this.problem = problem;
    }
  },
  assignDispatchParcel: vi.fn(),
  getDispatchParcelAssignment: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed",
  listCourierCapacity: vi.fn(),
  listDispatchAssignments: vi.fn(),
  listDispatchHistory: vi.fn(),
  listDispatchParcels: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../auth/session.js", () => ({
  useSession: () => ({ clear: vi.fn() }),
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(listCourierCapacity).mockResolvedValue({ items: couriers });
  vi.mocked(assignDispatchParcel).mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    parcelId: parcel.id,
    courierUserId: 12,
    dispatchVersion: 5,
    status: "ACTIVE",
    assignedAt: "2026-11-13T10:01:00.000Z",
    releasedAt: null,
  });
  vi.mocked(getDispatchParcelAssignment).mockResolvedValue({
    parcel: { ...parcel, dispatchVersion: 5 },
    assignment: {
      ...assignment,
      dispatchVersion: 5,
      parcel: { ...parcel, dispatchVersion: 5 },
    },
  });
  vi.mocked(listDispatchAssignments).mockResolvedValue({
    items: [assignment],
    page: 1,
    limit: 10,
    totalItems: 1,
    totalPages: 1,
  });
  vi.mocked(listDispatchHistory).mockResolvedValue({
    items: [assignment],
    page: 1,
    limit: 10,
    totalItems: 1,
    totalPages: 1,
  });
});

function renderModal() {
  return render(
    <MemoryRouter>
      <AssignmentModal
        parcel={parcel}
        onClose={vi.fn()}
        onConflict={vi.fn()}
        onSuccess={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("AssignmentModal", () => {
  it("keeps confirmation disabled until an eligible courier is selected", async () => {
    renderModal();
    expect(await screen.findByText("Courier One")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm assignment/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /courier two/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /courier full/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /courier one/i }));
    expect(screen.getByRole("button", { name: /confirm assignment/i })).toBeEnabled();
  });

  it("submits the selected courier with the parcel dispatchVersion", async () => {
    const onSuccess = vi.fn();
    render(
      <MemoryRouter>
        <AssignmentModal
          parcel={parcel}
          onClose={vi.fn()}
          onConflict={vi.fn()}
          onSuccess={onSuccess}
        />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("radio", { name: /courier one/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm assignment/i }));

    expect(assignDispatchParcel).toHaveBeenCalledWith(parcel.id, {
      courierUserId: 12,
      dispatchVersion: 4,
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("prevents duplicate submissions while assignment is pending", async () => {
    let resolve: (() => void) | undefined;
    vi.mocked(assignDispatchParcel).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = () => done({
            id: "22222222-2222-4222-8222-222222222222",
            parcelId: parcel.id,
            courierUserId: 12,
            dispatchVersion: 5,
            status: "ACTIVE",
            assignedAt: "2026-11-13T10:01:00.000Z",
            releasedAt: null,
          });
        }),
    );
    renderModal();
    await userEvent.click(await screen.findByRole("radio", { name: /courier one/i }));
    const confirm = screen.getByRole("button", { name: /confirm assignment/i });
    await userEvent.click(confirm);
    await userEvent.click(confirm);
    expect(assignDispatchParcel).toHaveBeenCalledOnce();
    resolve?.();
  });

  it("refreshes and does not retry when the parcel revision is stale", async () => {
    const onConflict = vi.fn();
    vi.mocked(assignDispatchParcel).mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        code: "VERSION_CONFLICT",
        detail: "The parcel changed.",
        correlationId: "test",
      }),
    );
    render(
      <MemoryRouter>
        <AssignmentModal
          parcel={parcel}
          onClose={vi.fn()}
          onConflict={onConflict}
          onSuccess={vi.fn()}
        />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("radio", { name: /courier one/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm assignment/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/parcel changed/i);
    expect(onConflict).toHaveBeenCalledOnce();
    expect(assignDispatchParcel).toHaveBeenCalledOnce();
  });

  it("loads the latest revision and reassigns away from the current courier", async () => {
    vi.mocked(listCourierCapacity).mockResolvedValue({
      items: [
        ...couriers,
        {
          courierUserId: 15,
          fullName: "Courier Three",
          onDuty: true,
          maxCapacity: 3,
          currentWorkload: 0,
          availableCapacity: 3,
          utilizationPercent: 0,
          assignments: [],
        },
      ],
    });
    render(
      <MemoryRouter>
        <AssignmentModal
          parcel={parcel}
          currentAssignment={assignment}
          mode="reassign"
          onClose={vi.fn()}
          onConflict={vi.fn()}
          onSuccess={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Reassign Courier" })).toBeInTheDocument();
    expect(await screen.findByText("Courier One")).toBeInTheDocument();
    expect(getDispatchParcelAssignment).toHaveBeenCalledWith(parcel.id);
    expect(screen.getByRole("radio", { name: /courier one/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /courier three/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm reassignment/i }));

    expect(assignDispatchParcel).toHaveBeenCalledWith(parcel.id, {
      courierUserId: 15,
      dispatchVersion: 5,
    });
  });

  describe("dispatch assignment pages", () => {
    it("renders current assignments and exposes reassignment", async () => {
      render(
        <MemoryRouter>
          <AssignmentsPage />
        </MemoryRouter>,
      );
      expect(await screen.findByRole("heading", { name: "Assignments" })).toBeInTheDocument();
      expect(screen.getByText(parcel.trackingNumber)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reassign" })).toBeInTheDocument();
    });

    it("renders real dispatch history records", async () => {
      render(
        <MemoryRouter>
          <DispatchHistoryPage />
        </MemoryRouter>,
      );
      expect(await screen.findByRole("heading", { name: "Dispatch History" })).toBeInTheDocument();
      expect(screen.getByText(parcel.trackingNumber)).toBeInTheDocument();
      expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    });
  });
});
