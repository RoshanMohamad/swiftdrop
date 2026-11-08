import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminZones, AdminPricing } from "./pages.js";
import {
  addPrice,
  addZone,
  deleteZone,
  listPrices,
  listZones,
  updateZone,
} from "../auth/client.js";

const sampleZones = [
  { id: 1, district: "Colombo", town: "Colombo Fort", active: true },
  { id: 2, district: "Kandy", town: "Kandy Town", active: false },
];

const samplePrices = [
  {
    id: 1,
    originZoneId: 1,
    destinationZoneId: 2,
    baseCents: 50000,
    perExtraKgCents: 10000,
    effectiveFrom: "2026-12-01T00:00:00.000Z",
  },
];

vi.mock("../auth/client.js", () => ({
  addPrice: vi.fn(),
  addZone: vi.fn(),
  deleteZone: vi.fn(),
  listPrices: vi.fn(),
  listZones: vi.fn(),
  updateZone: vi.fn(),
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(listZones).mockResolvedValue(sampleZones);
  vi.mocked(listPrices).mockResolvedValue(samplePrices);
});

describe("AdminZones page", () => {
  it("renders service districts and toggles active status", async () => {
    vi.mocked(updateZone).mockResolvedValue({
      id: 1,
      district: "Colombo",
      town: "Colombo Fort",
      active: false,
    });

    render(
      <MemoryRouter>
        <AdminZones />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Service districts")).toBeInTheDocument();
    expect(screen.getByText("Colombo")).toBeInTheDocument();
    expect(screen.getByText("Kandy")).toBeInTheDocument();

    const toggleBtn = screen.getByText("Stop serving");
    await userEvent.click(toggleBtn);

    expect(updateZone).toHaveBeenCalledWith(1, {
      district: "Colombo",
      town: "Colombo Fort",
      active: false,
    });
  });

  it("submits a new district and resets the form", async () => {
    vi.mocked(addZone).mockResolvedValue({
      id: 3,
      district: "Galle",
      town: "Galle Fort",
      active: true,
    });

    render(
      <MemoryRouter>
        <AdminZones />
      </MemoryRouter>,
    );

    const districtInput = await screen.findByLabelText("District");
    const townInput = screen.getByLabelText("Public town");
    const submitBtn = screen.getByText("Add district");

    await userEvent.type(districtInput, "Galle");
    await userEvent.type(townInput, "Galle Fort");
    await userEvent.click(submitBtn);

    expect(addZone).toHaveBeenCalledWith({
      district: "Galle",
      town: "Galle Fort",
      active: true,
    });
  });

  it("deletes a district when delete button is clicked", async () => {
    vi.mocked(deleteZone).mockResolvedValue(undefined as unknown as void);

    render(
      <MemoryRouter>
        <AdminZones />
      </MemoryRouter>,
    );

    const deleteBtns = await screen.findAllByText("Delete district");
    await userEvent.click(deleteBtns[0]);

    expect(deleteZone).toHaveBeenCalledWith(1);
  });
});

describe("AdminPricing page", () => {
  it("renders pricing rules and allows adding a new price version", async () => {
    vi.mocked(addPrice).mockResolvedValue({
      id: 2,
      originZoneId: 1,
      destinationZoneId: 1,
      baseCents: 45000,
      perExtraKgCents: 8000,
      effectiveFrom: "2026-12-15T10:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <AdminPricing />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Versioned prices")).toBeInTheDocument();
    expect(screen.getByText(/Route 1 → 2/)).toBeInTheDocument();

    const baseInput = screen.getByLabelText("Base price (LKR cents)");
    const extraInput = screen.getByLabelText("Price per extra kg (LKR cents)");
    const effectiveInput = screen.getByLabelText("Effective from");
    const submitBtn = screen.getByText("Add price version");

    await userEvent.type(baseInput, "45000");
    await userEvent.type(extraInput, "8000");
    await userEvent.type(effectiveInput, "2026-12-15T10:00");
    await userEvent.click(submitBtn);

    expect(addPrice).toHaveBeenCalled();
  });
});
