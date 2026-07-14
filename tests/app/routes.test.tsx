import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../src/app/App";

vi.mock("../../src/components/scene/TheatreCanvas", () => ({
  TheatreCanvas: () => <div aria-label="3D theatre" role="region" />,
}));

const routeHeadings = [
  ["/", "Explore fluoroscopy in three dimensions"],
  ["/lab", "Projection geometry lab"],
  ["/guided", "Guided views"],
  ["/guided/wrist-true-lateral", "Wrist true lateral"],
  ["/library", "Case library"],
  ["/library/wrist-neutral", "Wrist neutral case"],
  ["/communication", "Communication practice"],
  ["/saved", "Saved learning"],
  ["/about", "About OrthoFluoro Lab"],
  ["/settings", "Settings"],
] as const;

describe("application routes", () => {
  it.each(routeHeadings)(
    "renders %s with a unique heading",
    async (path, heading) => {
      const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
      render(<RouterProvider router={router} />);

      expect(
        await screen.findByRole("heading", { level: 1, name: heading }),
      ).toBeInTheDocument();
    },
  );

  it("does not reuse page headings across the route surface", () => {
    expect(new Set(routeHeadings.map(([, heading]) => heading)).size).toBe(
      routeHeadings.length,
    );
  });
});
