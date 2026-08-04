import { describe, expect, it } from "vitest";
import {
  appPointFromSource,
  fitSphere,
  mirrorPointAndTriangle,
  selectFemoralHeadCandidates,
} from "../../scripts/anatomy/anatomy-build-logic.mjs";
import { SOURCE_ASSETS } from "../../scripts/anatomy/source-registry.mjs";

describe("anatomy build rules", () => {
  it("pins the two approved source archives", () => {
    expect(SOURCE_ASSETS.map((source) => source.sha256)).toEqual([
      "A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364",
      "E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416",
    ]);
  });

  it("maps Open3DModel metres into the app's millimetre axes", () => {
    expect(appPointFromSource([-0.1, 0.8, 0.02])).toEqual([-100, 20, 800]);
  });

  it("mirrors x and reverses winding", () => {
    expect(
      mirrorPointAndTriangle(
        [
          [-3, 2, 1],
          [0, 0, 0],
          [2, 1, 0],
        ],
        [0, 1, 2],
      ),
    ).toEqual({
      points: [
        [3, 2, 1],
        [0, 0, 0],
        [-2, 1, 0],
      ],
      triangle: [0, 2, 1],
    });
  });

  it("fits a known sphere and selects only proximal-medial femur samples", () => {
    const sphere = [
      [7, 20, 30],
      [-3, 20, 30],
      [2, 25, 30],
      [2, 15, 30],
      [2, 20, 35],
      [2, 20, 25],
    ] as const;
    expect(fitSphere(sphere)).toEqual({ center: [2, 20, 30], radius: 5 });

    const candidates = selectFemoralHeadCandidates([
      [-148, -59, 432],
      [-100, 0, 850],
      [-30, 18, 880],
      [-50, 10, 870],
    ]);
    expect(candidates).toEqual([
      [-30, 18, 880],
      [-50, 10, 870],
    ]);
  });
});
