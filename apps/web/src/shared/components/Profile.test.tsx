import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { initials, Profile } from "./Profile.js";
import { updateProfile } from "../../features/auth/client.js";

const updateUser = vi.fn();
const user = {
  id: 7,
  email: "rider@example.test",
  fullName: "Rider Courier",
  phone: "+94771234567",
  role: "COURIER" as const,
  status: "ACTIVE" as const,
  emailVerified: true,
  profileComplete: true,
};
vi.mock("../../features/auth/session.js", () => ({
  useSession: () => ({ state: { status: "authenticated", user }, updateUser }),
}));
vi.mock("../../features/auth/client.js", () => ({
  updateProfile: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed.",
}));

function renderProfile() {
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Profile", () => {
  it("shows your details for any role", () => {
    renderProfile();
    expect(
      screen.getByRole("heading", { name: /your profile/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Rider Courier").length).toBeGreaterThan(0);
    expect(screen.getAllByText("rider@example.test").length).toBeGreaterThan(0);
    expect(screen.getByText("+94771234567")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getAllByText("Courier").length).toBeGreaterThan(0);
  });

  it("saves name and phone and updates the session", async () => {
    const saved = { ...user, fullName: "New Name", phone: "+94779876543" };
    vi.mocked(updateProfile).mockResolvedValue(saved);
    renderProfile();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Edit profile" }));
    await u.clear(screen.getByLabelText(/Full name/));
    await u.type(screen.getByLabelText(/Full name/), "New Name");
    await u.clear(screen.getByLabelText(/Phone/));
    await u.type(screen.getByLabelText(/Phone/), "0779876543");
    await u.click(screen.getByRole("button", { name: /Save changes/ }));
    expect(updateProfile).toHaveBeenCalledWith({
      fullName: "New Name",
      phone: "+94779876543",
    });
    expect(updateUser).toHaveBeenCalledWith(saved);
    expect(
      await screen.findByText("Your profile is saved."),
    ).toBeInTheDocument();
  });

  it("validates the phone before calling the API", async () => {
    renderProfile();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Edit profile" }));
    await u.clear(screen.getByLabelText(/Phone/));
    await u.type(screen.getByLabelText(/Phone/), "12345");
    await u.click(screen.getByRole("button", { name: /Save changes/ }));
    expect(
      await screen.findByText("Use a Sri Lankan phone number."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("shows the API error and keeps the form open", async () => {
    vi.mocked(updateProfile).mockRejectedValue(new Error("Try again later."));
    renderProfile();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Edit profile" }));
    await u.click(screen.getByRole("button", { name: /Save changes/ }));
    expect(await screen.findByText("Try again later.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save changes/ }),
    ).toBeInTheDocument();
  });
});

describe("initials", () => {
  it.each([
    ["Rider Courier", "", "RC"],
    ["Madonna", "", "MA"],
    [null, "zara@example.test", "ZA"],
    ["  Ana  de  Silva ", "", "AS"],
  ])("%s / %s -> %s", (name, email, expected) => {
    expect(initials(name, email)).toBe(expected);
  });
});
