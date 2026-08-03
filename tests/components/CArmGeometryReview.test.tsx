import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  C_ARM_REVIEW_CAMERAS,
  reviewCamera,
} from "../../src/components/scene/CArmGeometryReview";

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
});
