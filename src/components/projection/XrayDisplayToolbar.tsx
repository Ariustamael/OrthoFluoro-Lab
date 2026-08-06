"use client";

import { useSimulationStore } from "../../state/simulationStore";
import { normalizeDisplayDegrees } from "./xrayDisplayOrientation";

export function XrayDisplayToolbar() {
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
      <button
        aria-label="Rotate X-ray left 10 degrees"
        onClick={() => rotate(-1)}
        title="Rotate left 10°"
        type="button"
      >
        ↶
      </button>
      <output aria-label="X-ray rotation" aria-live="polite" role="status">
        {degrees}°
      </output>
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
  );
}
