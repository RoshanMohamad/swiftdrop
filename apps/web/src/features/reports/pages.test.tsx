import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminReports } from "./pages.js";
import { getDailyReport, downloadDailyReportCsv } from "../auth/client.js";

const sampleReport = {
  from: "2026-11-01",
  to: "2026-11-02",
  totalBooked: 15,
  totalDelivered: 12,
  totalFailed: 3,
  overallSuccessRatePercent: 80.0,
  days: [
    {
      date: "2026-11-01",
      totalBooked: 8,
      totalDelivered: 7,
      totalFailed: 1,
      totalInTransit: 0,
      successRatePercent: 87.5,
    },
    {
      date: "2026-11-02",
      totalBooked: 7,
      totalDelivered: 5,
      totalFailed: 2,
      totalInTransit: 0,
      successRatePercent: 71.4,
    },
  ],
};

vi.mock("../auth/client.js", () => ({
  getDailyReport: vi.fn(),
  downloadDailyReportCsv: vi.fn(),
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(getDailyReport).mockResolvedValue(sampleReport);
});

describe("AdminReports page (FR-I7)", () => {
  it("renders summary KPI cards and daily breakdown table", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Daily Delivery Reports"),
    ).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument(); // total booked
    expect(screen.getByText("12")).toBeInTheDocument(); // delivered
    expect(screen.getByText("3")).toBeInTheDocument(); // failed
    expect(screen.getByText("80.0%")).toBeInTheDocument(); // success rate

    // Table rows
    expect(screen.getByText("2026-11-01")).toBeInTheDocument();
    expect(screen.getByText("2026-11-02")).toBeInTheDocument();
    expect(screen.getByText("87.5%")).toBeInTheDocument();
    expect(screen.getByText("71.4%")).toBeInTheDocument();
  });

  it("triggers CSV export download when button is clicked", async () => {
    vi.mocked(downloadDailyReportCsv).mockResolvedValue(
      undefined as unknown as void,
    );

    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>,
    );

    const exportBtn = await screen.findByText("Export CSV");
    await userEvent.click(exportBtn);

    expect(downloadDailyReportCsv).toHaveBeenCalled();
  });

  it("handles empty reporting data gracefully", async () => {
    vi.mocked(getDailyReport).mockResolvedValue({
      from: "2026-11-01",
      to: "2026-11-02",
      totalBooked: 0,
      totalDelivered: 0,
      totalFailed: 0,
      overallSuccessRatePercent: 0,
      days: [],
    });

    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "No delivery activity found in the selected date range.",
      ),
    ).toBeInTheDocument();
  });
});
