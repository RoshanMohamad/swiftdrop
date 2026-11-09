import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWidget } from "./ChatWidget.js";
import { sendAssistantMessage } from "../auth/client.js";

vi.mock("../auth/client.js", () => ({
  sendAssistantMessage: vi.fn(),
  errorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : "Error")),
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(sendAssistantMessage).mockResolvedValue({
    reply: "Estimated delivery fee for 2 kg is LKR 570.00.",
    toolsUsed: ["quote_delivery_fee"],
  });
});

describe("AI Delivery Assistant Widget (FR-F9)", () => {
  it("renders floating launcher button by default", () => {
    render(<ChatWidget />);
    expect(
      screen.getByRole("button", { name: /open ai delivery assistant/i }),
    ).toBeInTheDocument();
  });

  it("opens chat dialog when clicking floating button", async () => {
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.click(
      screen.getByRole("button", { name: /open ai delivery assistant/i }),
    );

    expect(screen.getByRole("dialog", { name: /ai delivery assistant/i })).toBeInTheDocument();
    expect(screen.getByText(/Grounded delivery tools/i)).toBeInTheDocument();
  });

  it("submits message and renders assistant reply", async () => {
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.click(
      screen.getByRole("button", { name: /open ai delivery assistant/i }),
    );

    const input = screen.getByLabelText(/message to assistant/i);
    await user.type(input, "How much to send 2 kg to Kandy?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(sendAssistantMessage).toHaveBeenCalledWith(
      "How much to send 2 kg to Kandy?",
      expect.any(Array),
    );

    expect(
      await screen.findByText(/Estimated delivery fee for 2 kg is LKR 570.00/i),
    ).toBeInTheDocument();
  });

  it("closes the chat dialog when clicking close button", async () => {
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.click(
      screen.getByRole("button", { name: /open ai delivery assistant/i }),
    );
    expect(screen.getByRole("dialog", { name: /ai delivery assistant/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close assistant/i }));
    expect(
      screen.getByRole("button", { name: /open ai delivery assistant/i }),
    ).toBeInTheDocument();
  });
});
