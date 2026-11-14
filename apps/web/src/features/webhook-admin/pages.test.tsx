import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { AdminWebhookDeliveries } from "./pages.js";
import {
  getWebhookDelivery,
  listWebhookDeliveries,
  replayWebhookDelivery,
} from "./client.js";

const failed = {
  id: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  eventType: "parcel.created",
  merchantId: 7,
  status: "FAILED" as const,
  currentRun: 0,
  lastErrorCode: "HTTP_500",
  createdAt: "2026-11-07T10:00:00.000Z",
  updatedAt: "2026-11-07T10:30:00.000Z",
};
const detail = (status: "FAILED" | "SUCCESS") => ({
  ...failed,
  status,
  attempts: [
    {
      runNumber: 0,
      attempt: 0,
      outcome: "FAILURE" as const,
      statusCode: 500,
      latencyMs: 41,
      errorCode: "HTTP_500",
      nextRetryAt: null,
      startedAt: "2026-11-07T10:00:00.000Z",
    },
  ],
  replays: [],
});

vi.mock("./client.js", () => ({
  listWebhookDeliveries: vi.fn(),
  getWebhookDelivery: vi.fn(),
  replayWebhookDelivery: vi.fn(),
}));
vi.mock("../auth/client.js", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed.",
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(listWebhookDeliveries).mockResolvedValue({
    items: [failed],
    nextCursor: null,
  });
  vi.mocked(getWebhookDelivery).mockResolvedValue(detail("FAILED"));
});

describe("admin webhook deliveries", () => {
  it("lists deliveries with a readable status and filters by status", async () => {
    render(<AdminWebhookDeliveries />);
    expect(await screen.findByText("parcel.created")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("Failed"),
    ).toBeInTheDocument();
    expect(screen.getByText("HTTP_500")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Status"), "SUCCESS");
    expect(listWebhookDeliveries).toHaveBeenLastCalledWith({
      status: "SUCCESS",
      cursor: undefined,
    });
  });

  it("shows empty and error states, and retries after a failure", async () => {
    vi.mocked(listWebhookDeliveries).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });
    const { unmount } = render(<AdminWebhookDeliveries />);
    expect(
      await screen.findByText("No webhook deliveries match this filter."),
    ).toBeInTheDocument();
    unmount();
    vi.mocked(listWebhookDeliveries).mockRejectedValueOnce(
      new Error("Cannot reach SwiftDrop."),
    );
    render(<AdminWebhookDeliveries />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot reach SwiftDrop.",
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("parcel.created")).toBeInTheDocument();
  });

  it("opens attempt details and replays a failed delivery with a required reason", async () => {
    vi.mocked(replayWebhookDelivery).mockResolvedValue({
      deliveryId: failed.id,
      runNumber: 1,
      status: "PENDING",
    });
    render(<AdminWebhookDeliveries />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "View details" }),
    );
    const panel = await screen.findByRole("region", {
      name: /Delivery parcel.created/,
    });
    expect(
      within(panel).getByText("HTTP_500", { selector: "td" }),
    ).toBeInTheDocument();
    // Validation first: nothing is sent without a reason, and focus moves to the field.
    await user.click(
      within(panel).getByRole("button", { name: "Replay delivery" }),
    );
    expect(replayWebhookDelivery).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Reason/)).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Give a short reason");
    await user.type(screen.getByLabelText(/Reason/), "Merchant fixed endpoint");
    await user.click(
      within(panel).getByRole("button", { name: "Replay delivery" }),
    );
    expect(replayWebhookDelivery).toHaveBeenCalledWith(
      failed.id,
      "Merchant fixed endpoint",
    );
    expect(await screen.findByText(/Replay run 1 queued/)).toBeInTheDocument();
  });

  it("prevents duplicate replay submissions and shows a server conflict", async () => {
    let reject: (error: Error) => void = () => undefined;
    vi.mocked(replayWebhookDelivery).mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    render(<AdminWebhookDeliveries />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "View details" }),
    );
    await user.type(
      await screen.findByLabelText(/Reason/),
      "Second look at it",
    );
    const button = screen.getByRole("button", { name: "Replay delivery" });
    await user.click(button);
    expect(
      screen.getByRole("button", { name: "Queuing replay…" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Queuing replay…" }));
    expect(replayWebhookDelivery).toHaveBeenCalledTimes(1);
    reject(
      new Error(
        "Only failed deliveries can be replayed, and only once at a time.",
      ),
    );
    expect(await screen.findByText(/only once at a time/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reason/)).toHaveFocus();
  });

  it("offers no replay for deliveries that did not fail", async () => {
    vi.mocked(getWebhookDelivery).mockResolvedValue(detail("SUCCESS"));
    render(<AdminWebhookDeliveries />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "View details" }),
    );
    expect(
      await screen.findByText("Only failed deliveries can be replayed."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Replay delivery" }),
    ).toBeNull();
  });

  it("has no detectable accessibility violations with details open", async () => {
    const { container } = render(<AdminWebhookDeliveries />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "View details" }),
    );
    await screen.findByRole("region", { name: /Delivery/ });
    const result = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
