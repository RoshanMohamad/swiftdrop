import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NewParcel, ParcelDetail, ParcelList } from "./pages.js";
import { createParcel, createQuote } from "../auth/client.js";
import { getParcel, getParcelReceipt, listParcels } from "../auth/client.js";

vi.mock("../auth/client.js", () => ({
  ApiError: class extends Error {
    problem: { status: number };
    constructor(status: number) {
      super("Request failed");
      this.problem = { status };
    }
  },
  createParcel: vi.fn(),
  createQuote: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed",
  getParcel: vi.fn(),
  getParcelReceipt: vi.fn(),
  getTracking: vi.fn(),
  listParcels: vi.fn(),
}));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID: () => "booking-key-00000001" });
  vi.mocked(createQuote).mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    originDistrict: "Colombo",
    destinationDistrict: "Kandy",
    weightGrams: 2000,
    lengthMm: 250,
    widthMm: 180,
    heightMm: 120,
    feeCents: 57000,
    currency: "LKR",
    expiresAt: "2030-01-01T12:00:00.000Z",
    originTown: "Colombo",
    destinationTown: "Kandy",
  });
  vi.mocked(createParcel).mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    trackingNumber: "SD1234567A",
    status: "CREATED",
    feeCents: 57000,
    currency: "LKR",
    originTown: "Colombo",
    destinationTown: "Kandy",
    recipientName: "Receiver Name",
    recipientPhone: "+94771234567",
    recipientAddress: "12 Main Street, Kandy",
    createdAt: "2030-01-01T12:00:00.000Z",
    weightGrams: 2000,
    lengthMm: 250,
    widthMm: 180,
    heightMm: 120,
    history: [
      {
        status: "CREATED",
        town: "Colombo",
        createdAt: "2030-01-01T12:00:00.000Z",
      },
    ],
  });
  vi.mocked(listParcels).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(getParcel).mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    trackingNumber: "SD1234567A",
    status: "IN_TRANSIT",
    feeCents: 57000,
    currency: "LKR",
    originTown: "Colombo",
    destinationTown: "Kandy",
    recipientName: "Receiver Name",
    recipientPhone: "+94771234567",
    recipientAddress: "12 Main Street, Kandy",
    createdAt: "2030-01-01T12:00:00.000Z",
    weightGrams: 2000,
    lengthMm: 250,
    widthMm: 180,
    heightMm: 120,
    history: [
      { status: "CREATED", town: "Colombo", createdAt: "2030-01-01T12:00:00.000Z" },
      { status: "IN_TRANSIT", town: "Kandy", createdAt: "2030-01-02T12:00:00.000Z" },
    ],
  });
  vi.mocked(getParcelReceipt).mockResolvedValue({
    receiptReference: "SDR-SD1234567A",
    downloadUrl: "http://localhost:9000/swiftdrop-receipts/receipts/test.pdf",
    expiresAt: "2030-01-02T12:05:00.000Z",
  });
});

function page() {
  return render(
    <MemoryRouter>
      <NewParcel />
    </MemoryRouter>,
  );
}

async function completeParcelDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Pickup district"), "Colombo");
  await user.type(screen.getByLabelText("Delivery district"), "Kandy");
  await user.type(screen.getByLabelText("Weight (grams)"), "2000");
  await user.type(screen.getByLabelText("length (mm)"), "250");
  await user.type(screen.getByLabelText("width (mm)"), "180");
  await user.type(screen.getByLabelText("height (mm)"), "120");
}

describe("customer parcel booking wizard", () => {
  it("validates parcel details before requesting a quote", async () => {
    page();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Continue to recipient" }));

    expect(createQuote).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Pickup district")).toBeInvalid();
  });

  it("retains entered details when moving between steps", async () => {
    page();
    const user = userEvent.setup();
    await completeParcelDetails(user);
    await user.click(screen.getByRole("button", { name: "Continue to recipient" }));

    expect(await screen.findByRole("heading", { name: "Recipient details" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByLabelText("Pickup district")).toHaveValue("Colombo");
    expect(screen.getByLabelText("Weight (grams)")).toHaveValue(2000);
    expect(createQuote).toHaveBeenCalledTimes(1);
  });

  it("invalidates a quote when quote inputs change", async () => {
    page();
    const user = userEvent.setup();
    await completeParcelDetails(user);
    await user.click(screen.getByRole("button", { name: "Continue to recipient" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.clear(screen.getByLabelText("Weight (grams)"));
    await user.type(screen.getByLabelText("Weight (grams)"), "3000");

    expect(screen.getByRole("button", { name: "Continue to recipient" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recipient details" })).not.toBeInTheDocument();
  });

  it("reviews details and prevents duplicate booking submissions", async () => {
    page();
    const user = userEvent.setup();
    await completeParcelDetails(user);
    await user.click(screen.getByRole("button", { name: "Continue to recipient" }));
    await user.type(screen.getByLabelText("Recipient name"), "Receiver Name");
    await user.type(screen.getByLabelText("Recipient phone"), "0771234567");
    await user.type(
      screen.getByLabelText("Delivery address"),
      "12 Main Street, Kandy",
    );
    await user.click(screen.getByRole("button", { name: "Review booking" }));

    expect(await screen.findByRole("heading", { name: "Review booking" })).toBeInTheDocument();
    expect(screen.getByText(/LKR.*570\.00/)).toBeInTheDocument();

    let resolve!: (value: Awaited<ReturnType<typeof createParcel>>) => void;
    vi.mocked(createParcel).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const confirm = screen.getByRole("button", { name: "Confirm booking" });
    await user.click(confirm);
    await user.click(confirm);

    expect(createParcel).toHaveBeenCalledTimes(1);
    expect(createParcel).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: "11111111-1111-4111-8111-111111111111",
        recipientPhone: "+94771234567",
      }),
      "booking-key-00000001",
    );
    resolve({
      id: "22222222-2222-4222-8222-222222222222",
      trackingNumber: "SD1234567A",
      status: "CREATED",
      feeCents: 57000,
      currency: "LKR",
      originTown: "Colombo",
      destinationTown: "Kandy",
      recipientName: "Receiver Name",
      recipientPhone: "+94771234567",
      recipientAddress: "12 Main Street, Kandy",
      createdAt: "2030-01-01T12:00:00.000Z",
      weightGrams: 2000,
      lengthMm: 250,
      widthMm: 180,
      heightMm: 120,
      history: [
        {
          status: "CREATED",
          town: "Colombo",
          createdAt: "2030-01-01T12:00:00.000Z",
        },
      ],
    });
  });

  describe("customer parcel history and details", () => {
    it("renders real booking summaries and requests the next cursor", async () => {
      vi.mocked(listParcels)
        .mockResolvedValueOnce({
          items: [{
            id: "22222222-2222-4222-8222-222222222222",
            trackingNumber: "SD1234567A",
            status: "DELIVERED",
            feeCents: 57000,
            currency: "LKR",
            originTown: "Colombo",
            destinationTown: "Kandy",
            recipientName: "Receiver Name",
            recipientPhone: "+94771234567",
            recipientAddress: "12 Main Street, Kandy",
            createdAt: "2030-01-01T12:00:00.000Z",
            weightGrams: 2000,
            lengthMm: 250,
            widthMm: 180,
            heightMm: 120,
            history: [],
          }],
          nextCursor: "next-page",
        })
        .mockResolvedValueOnce({ items: [], nextCursor: null });
      render(<MemoryRouter><ParcelList /></MemoryRouter>);

      expect(await screen.findByText("SD1234567A")).toBeInTheDocument();
      expect(screen.getByText("Delivered")).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole("button", { name: "Next page" }));
      expect(listParcels).toHaveBeenLastCalledWith("next-page");
    });

    it("renders parcel measurements, recipient details, and chronological timeline", async () => {
      render(
        <MemoryRouter initialEntries={["/parcels/22222222-2222-4222-8222-222222222222"]}>
          <Routes><Route path="/parcels/:id" element={<ParcelDetail />} /></Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByRole("heading", { name: "SD1234567A" })).toBeInTheDocument();
      expect(screen.getByText("2.00 kg")).toBeInTheDocument();
      expect(screen.getByText("250 × 180 × 120 mm")).toBeInTheDocument();
      expect(screen.getByText("Receiver Name")).toBeInTheDocument();
      expect(screen.getAllByText("In Transit")).toHaveLength(2);
      expect(screen.getByText(/Colombo.*2030/)).toBeInTheDocument();
      expect(screen.getByText(/Kandy.*2030/)).toBeInTheDocument();
      expect(getParcel).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    });

    it("explains receipt eligibility and loads a secure PDF link for delivered parcels", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/parcels/22222222-2222-4222-8222-222222222222"]}>
          <Routes><Route path="/parcels/:id" element={<ParcelDetail />} /></Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText(/available after this parcel is delivered/)).toBeInTheDocument();

      cleanup();
      vi.mocked(getParcel).mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        trackingNumber: "SD1234567A",
        status: "DELIVERED",
        feeCents: 57000,
        currency: "LKR",
        originTown: "Colombo",
        destinationTown: "Kandy",
        recipientName: "Receiver Name",
        recipientPhone: "+94771234567",
        recipientAddress: "12 Main Street, Kandy",
        createdAt: "2030-01-01T12:00:00.000Z",
        weightGrams: 2000,
        lengthMm: 250,
        widthMm: 180,
        heightMm: 120,
        history: [
          { status: "CREATED", town: "Colombo", createdAt: "2030-01-01T12:00:00.000Z" },
          { status: "DELIVERED", town: "Kandy", createdAt: "2030-01-02T12:00:00.000Z" },
        ],
      });
      render(
        <MemoryRouter initialEntries={["/parcels/22222222-2222-4222-8222-222222222222"]}>
          <Routes><Route path="/parcels/:id" element={<ParcelDetail />} /></Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByRole("button", { name: "Get PDF receipt" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Get PDF receipt" }));
      expect(await screen.findByRole("link", { name: "Download PDF receipt" })).toHaveAttribute(
        "href",
        "http://localhost:9000/swiftdrop-receipts/receipts/test.pdf",
      );
    });
  });
});
