import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../src/app/App";

vi.mock("../../src/components/scene/TheatreCanvas", () => ({
  TheatreCanvas: ({ surface }: { surface?: string }) => (
    <div
      aria-label={surface === "projection" ? "Simulated X-ray view" : "3D theatre"}
      role="region"
    />
  ),
}));

describe("one-page application routes", () => {
  it("renders the simulator at the root", async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Projection geometry lab",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    "/lab",
    "/guided",
    "/guided/wrist-true-lateral",
    "/library",
    "/library/wrist-neutral",
    "/communication",
    "/saved",
    "/about",
    "/settings",
    "/lab/c-arm-review",
    "/lab/projection-renderer-smoke",
  ])("redirects %s to the root simulator", async (path) => {
    const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", {
      level: 1,
      name: "Projection geometry lab",
    });
    expect(router.state.location.pathname).toBe("/");
  });

  it("does not render site navigation", async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", {
      level: 1,
      name: "Projection geometry lab",
    });
    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" }),
    ).not.toBeInTheDocument();
  });
});
