"use client";

import { useSimulationStore } from "../../state/simulationStore";
import { XrayAcquisitionControls } from "./XrayAcquisitionControls";
import { normalizeDisplayDegrees } from "./xrayDisplayOrientation";

export interface XrayDisplayToolbarProps {
  readonly acquisitionStatus: string;
  readonly shotPending: boolean;
}

export function XrayDisplayToolbar({
  acquisitionStatus,
  shotPending,
}: XrayDisplayToolbarProps) {
  const orientation = useSimulationStore(
    (state) => state.xrayDisplayOrientation,
  );
  const rotate = useSimulationStore((state) => state.rotateXrayDisplay);
  const toggleFlip = useSimulationStore((state) => state.toggleXrayFlip);
  const reset = useSimulationStore((state) => state.resetXrayDisplay);
  const degrees = normalizeDisplayDegrees(orientation.rotationSteps);

  return (
    <div
      aria-label="X-ray display controls"
      className="xray-display-toolbar"
      role="toolbar"
    >
      <div className="xray-display-toolbar__acquisition-row">
        <XrayAcquisitionControls shotPending={shotPending} />
        <output
          aria-atomic="true"
          aria-label="X-ray acquisition status"
          aria-live="polite"
          className="xray-acquisition-controls__status"
          role="status"
        >
          {acquisitionStatus}
        </output>
      </div>
      <div
        aria-label="X-ray display orientation"
        className="xray-display-toolbar__display-row"
        role="group"
      >
        <button
          aria-label="Rotate X-ray left 10 degrees"
          onClick={() => rotate(-1)}
          title="Rotate left 10°"
          type="button"
        >
          ↶
        </button>
        <span aria-label="X-ray rotation">{degrees}°</span>
        <button
          aria-label="Rotate X-ray right 10 degrees"
          onClick={() => rotate(1)}
          title="Rotate right 10°"
          type="button"
        >
          ↷
        </button>
        <button
          aria-label="Flip X-ray horizontally"
          aria-pressed={orientation.flipHorizontal}
          onClick={() => toggleFlip("horizontal")}
          title="Flip horizontally"
          type="button"
        >
          ↔
        </button>
        <button
          aria-label="Flip X-ray vertically"
          aria-pressed={orientation.flipVertical}
          onClick={() => toggleFlip("vertical")}
          title="Flip vertically"
          type="button"
        >
          ↕
        </button>
        <button
          aria-label="Reset X-ray display"
          onClick={reset}
          title="Reset display"
          type="button"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
