import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MerchantWebhookHistory } from "./pages.js";
import { listMerchantWebhookDeliveries } from "../auth/client.js";

vi.mock("../auth/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/client.js")>()),
  listMerchantWebhookDeliveries: vi.fn(),
}));

const row = {
  eventId: "11111111-1111-4111-8111-111111111111",
  eventType: "parcel.created",
  status: "FAILED" as const,
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:30:00.000Z",
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(listMerchantWebhookDeliveries).mockResolvedValue({
    items: [row],
    nextCursor: null,
  });
});

describe("merchant webhook delivery history", () => {
  it("shows safe delivery summaries and status filtering", async () => {
    const user = userEvent.setup();
    render(<MerchantWebhookHistory />);
    expect(await screen.findByText("parcel.created")).toBeInTheDocument();
    expect(screen.getByText(row.eventId)).toBeInTheDocument();
    expect(screen.getAllByText("Failed")).toHaveLength(2);
    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "FAILED",
    );
    expect(listMerchantWebhookDeliveries).toHaveBeenLastCalledWith({
      status: "FAILED",
      cursor: undefined,
      limit: 25,
    });
  });

  it("shows loading, empty and recoverable error states", async () => {
    const user = userEvent.setup();
    let resolvePage!: (page: {
      items: Array<typeof row>;
      nextCursor: null;
    }) => void;
    vi.mocked(listMerchantWebhookDeliveries).mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    render(<MerchantWebhookHistory />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading webhook deliveries",
    );
    resolvePage({ items: [], nextCursor: null });
    expect(
      await screen.findByText("No webhook deliveries found."),
    ).toBeInTheDocument();

    vi.mocked(listMerchantWebhookDeliveries).mockResolvedValue({
      items: [row],
      nextCursor: null,
    });
    vi.mocked(listMerchantWebhookDeliveries).mockRejectedValueOnce(
      new Error("Delivery history unavailable."),
    );
    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "FAILED",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot reach SwiftDrop.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("parcel.created")).toBeInTheDocument();
  });

  it("supports cursor next and previous navigation", async () => {
    const user = userEvent.setup();
    vi.mocked(listMerchantWebhookDeliveries)
      .mockResolvedValueOnce({ items: [row], nextCursor: "page-two" })
      .mockResolvedValueOnce({
        items: [{ ...row, eventId: "22222222-2222-4222-8222-222222222222" }],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [row], nextCursor: "page-two" });
    render(<MerchantWebhookHistory />);
    await screen.findByText(row.eventId);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      await screen.findByText("22222222-2222-4222-8222-222222222222"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText(row.eventId)).toBeInTheDocument();
    expect(listMerchantWebhookDeliveries).toHaveBeenLastCalledWith({
      status: undefined,
      cursor: undefined,
      limit: 25,
    });
  });
});
