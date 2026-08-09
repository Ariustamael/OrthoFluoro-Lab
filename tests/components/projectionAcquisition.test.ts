import { describe, expect, it } from "vitest";
import { detectorDimensions } from "../../src/components/projection/projectionAcquisition";

describe("detectorDimensions", () => {
  it.each([
    ["low", false, 512],
    ["medium", false, 768],
    ["high", false, 1024],
    ["low", true, 384],
    ["medium", true, 384],
    ["high", true, 512],
  ] as const)(
    "maps %s quality with interacting=%s to an explicit square detector",
    (quality, interacting, size) => {
      expect(detectorDimensions(quality, interacting)).toEqual({
        height: size,
        width: size,
      });
    },
  );
});
