import type {
  DetectorSensorSize,
  ProjectionAppearance,
  ProjectionInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "./rendererTypes";

export const SIMPLIFIED_DETECTOR_SENSOR: Readonly<DetectorSensorSize> =
  Object.freeze({
    height: 400,
    width: 400,
  });

const SIMPLIFIED_PROJECTION_APPEARANCE: Readonly<ProjectionAppearance> =
  Object.freeze({
    backgroundColor: "#050505",
    detectorSensor: SIMPLIFIED_DETECTOR_SENSOR,
    primaryBoneColor: "#eeeeee",
    secondaryBoneColor: "#cfcfcf",
    softTissueColor: "#8a8a8a",
    softTissueOpacity: 0.6,
  });

const SIMPLIFIED_PROJECTION_OUTPUT: Readonly<ProjectionOutput> = Object.freeze({
  appearance: SIMPLIFIED_PROJECTION_APPEARANCE,
  description: "Educational geometric visualisation",
  textureId: "simplified-procedural",
});

export class SimplifiedProjectionRenderer implements ProjectionRenderer {
  private disposed = false;

  render(input: ProjectionInput): ProjectionOutput {
    if (this.disposed) {
      throw new Error("Cannot render with a disposed projection renderer");
    }
    void input;
    return SIMPLIFIED_PROJECTION_OUTPUT;
  }

  dispose(): void {
    this.disposed = true;
  }
}

export function createSimplifiedProjectionRenderer(): ProjectionRenderer {
  return new SimplifiedProjectionRenderer();
}
