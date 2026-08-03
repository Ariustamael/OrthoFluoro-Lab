import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CArmGeometryReview,
  C_ARM_REVIEW_CAMERAS,
  reviewCamera,
} from "../../src/components/scene/CArmGeometryReview";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ className }: { className?: string }) => (
    <div className={className} data-testid="r3f-canvas" />
  ),
  useThree: vi.fn(),
}));

const appCss = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

describe("C-arm geometry review cameras", () => {
  it("defines deterministic side, detector-facing, and oblique views", () => {
    expect(Object.keys(C_ARM_REVIEW_CAMERAS)).toEqual([
      "side",
      "detector",
      "oblique",
    ]);
    expect(reviewCamera("side")).toEqual({
      position: [0, 0, 1600],
      target: [0, 0, 0],
    });
    expect(reviewCamera("detector")).toEqual({
      position: [0, -1600, 0],
      target: [0, 0, 0],
    });
    expect(reviewCamera("oblique")).toEqual({
      position: [1100, 650, 1100],
      target: [0, 0, 0],
    });
  });

  it("gives the review canvas an explicit desktop block size", () => {
    const canvasRule = appCss.match(
      /\.c-arm-review__canvas\s*\{(?<declarations>[^}]*)\}/,
    );

    expect(canvasRule?.groups?.declarations).toMatch(
      /(?:^|\r?\n)\s*(?:block-size|height)\s*:/,
    );
  });

  it("contains the R3F canvas surface inside the sized review canvas container", () => {
    render(<CArmGeometryReview view="side" />);

    const reviewCanvasContainer = document.querySelector(
      ".c-arm-review__canvas",
    );
    const canvasSurface = screen.getByTestId("r3f-canvas");

    expect(reviewCanvasContainer).not.toBe(canvasSurface);
    expect(reviewCanvasContainer).toContainElement(canvasSurface);
  });
});
