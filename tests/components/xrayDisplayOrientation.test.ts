import { describe, expect, it } from "vitest";
import {
  normalizeDisplayDegrees,
  xrayDisplayFitScale,
  xrayDisplayTransform,
} from "../../src/components/projection/xrayDisplayOrientation";

describe("X-ray display orientation", () => {
  it.each([
    [0, 0],
    [1, 10],
    [36, 0],
    [-1, 350],
    [-37, 350],
  ])("normalizes %i steps to %i degrees", (steps, degrees) => {
    expect(normalizeDisplayDegrees(steps)).toBe(degrees);
  });

  it("fits every rotated square without enlarging it", () => {
    expect(xrayDisplayFitScale(500, 500, 500, 500, 0)).toBe(1);
    expect(xrayDisplayFitScale(500, 500, 500, 500, 45)).toBeCloseTo(
      Math.SQRT1_2,
    );
    expect(xrayDisplayFitScale(500, 500, 500, 500, 90)).toBeCloseTo(1);
  });

  it("applies rotation before screen-horizontal and screen-vertical flips", () => {
    expect(
      xrayDisplayTransform(
        { rotationSteps: 1, flipHorizontal: true, flipVertical: false },
        1,
      ),
    ).toBe("scale(1) scale(-1, 1) rotate(10deg)");
  });
});
