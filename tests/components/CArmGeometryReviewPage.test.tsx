import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CArmGeometryReviewPage } from "../../src/pages/CArmGeometryReviewPage";

const reviewScene = vi.hoisted(() => ({
  renders: [] as Array<{ showBeam: boolean; view: string }>,
}));

vi.mock("../../src/components/scene/CArmGeometryReview", () => ({
  CArmGeometryReview: (props: { showBeam: boolean; view: string }) => {
    reviewScene.renders.push(props);
    return (
      <div
        data-beam-visible={String(props.showBeam)}
        data-testid="review-scene"
        data-view={props.view}
      />
    );
  },
}));

describe("C-arm geometry review page", () => {
  beforeEach(() => {
    reviewScene.renders.length = 0;
  });

  it("keeps a local beam toggle active while the review view changes", async () => {
    const user = userEvent.setup();
    render(<CArmGeometryReviewPage />);

    expect(screen.getByRole("button", { name: "Beam off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-beam-visible",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Beam off" }));

    expect(screen.getByRole("button", { name: "Beam on" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-beam-visible",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Oblique" }));

    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-view",
      "oblique",
    );
    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-beam-visible",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Beam on" }));

    expect(screen.getByRole("button", { name: "Beam off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
