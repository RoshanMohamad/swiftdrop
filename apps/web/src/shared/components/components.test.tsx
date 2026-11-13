import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { LoadingState } from "./LoadingState.js";
import { EmptyState } from "./EmptyState.js";
import { StatusBadge } from "./StatusBadge.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Simulated component explosion!");
  }
  return <div>Component is fine.</div>;
}

beforeEach(() => {
  cleanup();
});

describe("Shared UI Components", () => {
  describe("LoadingState", () => {
    it("renders with role='status' and polite live region", () => {
      render(<LoadingState message="Fetching parcels..." />);
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("Fetching parcels...");
      expect(status).toHaveAttribute("aria-live", "polite");
    });

    it("supports inline mode", () => {
      render(<LoadingState message="Saving..." inline />);
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("Saving...");
      expect(status.tagName.toLowerCase()).toBe("span");
    });

    it("has zero axe accessibility violations", async () => {
      const { container } = render(<LoadingState message="Loading data..." />);
      const result = await axe.run(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(result.violations).toEqual([]);
    });
  });

  describe("EmptyState", () => {
    it("renders title, description, and action button", () => {
      render(
        <EmptyState
          title="No Parcels Found"
          description="You haven't booked any deliveries yet."
          action={<button type="button">Book a Delivery</button>}
        />,
      );

      expect(screen.getByRole("heading", { level: 2, name: "No Parcels Found" })).toBeInTheDocument();
      expect(screen.getByText("You haven't booked any deliveries yet.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Book a Delivery" })).toBeInTheDocument();
    });

    it("has zero axe accessibility violations", async () => {
      const { container } = render(
        <EmptyState
          title="No Records"
          description="Empty table."
          action={<button type="button">Create Record</button>}
        />,
      );
      const result = await axe.run(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(result.violations).toEqual([]);
    });
  });

  describe("StatusBadge", () => {
    it("renders appropriate class and accessible label for parcel statuses", () => {
      const { rerender } = render(<StatusBadge status="IN_TRANSIT" />);
      let badge = screen.getByText("In Transit");
      expect(badge).toHaveClass("status-in-transit");
      expect(badge).toHaveAttribute("aria-label", "Status: In Transit");

      rerender(<StatusBadge status="DELIVERED" />);
      badge = screen.getByText("Delivered");
      expect(badge).toHaveClass("status-delivered");
      expect(badge).toHaveAttribute("aria-label", "Status: Delivered");

      rerender(<StatusBadge status="FAILED" />);
      badge = screen.getByText("Delivery Failed");
      expect(badge).toHaveClass("status-failed");
      expect(badge).toHaveAttribute("aria-label", "Status: Delivery Failed");
    });

    it("renders appropriate labels for user account statuses", () => {
      const { rerender } = render(<StatusBadge status="ACTIVE" />);
      expect(screen.getByText("Active")).toHaveClass("status-delivered");

      rerender(<StatusBadge status="INVITED" />);
      expect(screen.getByText("Invited")).toHaveClass("status-created");

      rerender(<StatusBadge status="SUSPENDED" />);
      expect(screen.getByText("Suspended")).toHaveClass("status-failed");
    });

    it("has zero axe accessibility violations", async () => {
      const { container } = render(<StatusBadge status="IN_TRANSIT" />);
      const result = await axe.run(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(result.violations).toEqual([]);
    });
  });

  describe("ErrorBoundary", () => {
    it("renders children when no error occurs", () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>,
      );
      expect(screen.getByText("Component is fine.")).toBeInTheDocument();
    });

    it("catches render errors and displays accessible recovery panel with retry", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const user = userEvent.setup();
      const onReset = vi.fn();

      const { rerender } = render(
        <ErrorBoundary onReset={onReset}>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>,
      );

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText("Simulated component explosion!")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: "Try again" });
      expect(retryBtn).toBeInTheDocument();

      rerender(
        <ErrorBoundary onReset={onReset}>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>,
      );

      await user.click(retryBtn);
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Component is fine.")).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it("has zero axe accessibility violations when displaying error alert", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { container } = render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>,
      );
      const result = await axe.run(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(result.violations).toEqual([]);
      consoleErrorSpy.mockRestore();
    });
  });
});
