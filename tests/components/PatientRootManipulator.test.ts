import { describe, expect, it } from "vitest";
import {
  patientRootFromMatrix,
  patientRootMatrix,
} from "../../src/components/scene/PatientRootManipulator";

describe("patient-root manipulator transforms", () => {
  it("round-trips patient position and orientation through one controlled matrix", () => {
    const source = {
      rootPosition: [125, -40, 330] as const,
      rootRotationDegrees: [15, -20, 35] as const,
    };

    const result = patientRootFromMatrix(patientRootMatrix(source));

    result.position.forEach((value, index) => {
      expect(value).toBeCloseTo(source.rootPosition[index] ?? 0, 8);
    });
    result.rotationDegrees.forEach((value, index) => {
      expect(value).toBeCloseTo(source.rootRotationDegrees[index] ?? 0, 8);
    });
  });

  it("does not mutate pose tuples while producing the controlled matrix", () => {
    const position = [10, 20, 30] as const;
    const rotation = [5, 10, 15] as const;

    patientRootMatrix({
      rootPosition: position,
      rootRotationDegrees: rotation,
    });

    expect(position).toEqual([10, 20, 30]);
    expect(rotation).toEqual([5, 10, 15]);
  });
});
