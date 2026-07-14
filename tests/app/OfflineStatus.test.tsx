import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OfflineStatus } from "../../src/components/common/OfflineStatus";

describe("OfflineStatus", () => {
  it("appears when the browser goes offline and clears when it reconnects", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineStatus />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Offline — the current lab remains available",
    );

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
