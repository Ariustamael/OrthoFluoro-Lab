"use client";

import { useState } from "react";
import {
  AP_C_ARM_POSE,
  LATERAL_C_ARM_POSE,
} from "../../engine/geometry/anatomicalAxes";
import type {
  CArmApproachSide,
  CArmTubeOrientation,
} from "../../engine/geometry/geometryTypes";
import {
  useSimulationStore,
  type QualityPreset,
} from "../../state/simulationStore";

const APPROACH_OPTIONS: readonly {
  label: string;
  value: CArmApproachSide;
}[] = [
  { label: "Left approach", value: "left" },
  { label: "Right approach", value: "right" },
];

const TUBE_OPTIONS: readonly {
  label: string;
  value: CArmTubeOrientation;
}[] = [
  { label: "Detector over source", value: "detector-over" },
  { label: "Source over detector", value: "source-over" },
];

const QUALITY_OPTIONS: readonly QualityPreset[] = ["low", "medium", "high"];

export function CArmSetupControls() {
  const [captureMessage, setCaptureMessage] = useState("");
  const setup = useSimulationStore((state) => state.cArmPhysicalSetup);
  const quality = useSimulationStore((state) => state.quality);
  const setApproachSide = useSimulationStore((state) => state.setApproachSide);
  const setTubeOrientation = useSimulationStore(
    (state) => state.setTubeOrientation,
  );
  const setCArmPose = useSimulationStore((state) => state.setCArmPose);
  const setQuality = useSimulationStore((state) => state.setQuality);
  const resetGeometry = useSimulationStore((state) => state.resetGeometry);

  return (
    <fieldset aria-label="Rig setup" className="control-column">
      <legend className="control-column__title">Rig setup</legend>

      <fieldset className="setup-control-group">
        <legend>Approach side</legend>
        <div className="setup-control-options setup-control-options--schematic">
          {APPROACH_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                checked={setup.approachSide === option.value}
                name="approach-side"
                onChange={() => setApproachSide(option.value)}
                type="radio"
              />
              <span
                aria-hidden="true"
                className={`rig-schematic rig-schematic--approach-${option.value}`}
              >
                <i className="rig-schematic__patient" />
                <i className="rig-schematic__arc" />
              </span>
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="setup-control-group">
        <legend>Tube orientation</legend>
        <div className="setup-control-options setup-control-options--schematic">
          {TUBE_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                checked={setup.tubeOrientation === option.value}
                name="tube-orientation"
                onChange={() => setTubeOrientation(option.value)}
                type="radio"
              />
              <span
                aria-hidden="true"
                className={`rig-schematic rig-schematic--tube-${option.value}`}
              >
                <i className="rig-schematic__detector" />
                <i className="rig-schematic__beam" />
                <i className="rig-schematic__source" />
              </span>
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="setup-control-group">
        <legend>Reference views</legend>
        <div aria-label="Reference views" className="c-arm-controls__presets">
          <button onClick={() => setCArmPose(AP_C_ARM_POSE)} type="button">
            AP view
          </button>
          <button onClick={() => setCArmPose(LATERAL_C_ARM_POSE)} type="button">
            Lateral view
          </button>
        </div>
      </fieldset>

      <fieldset className="setup-control-group">
        <legend>Rendering quality</legend>
        <div className="setup-control-options setup-control-options--quality">
          {QUALITY_OPTIONS.map((option) => (
            <label key={option}>
              <input
                checked={quality === option}
                name="rendering-quality"
                onChange={() => setQuality(option)}
                type="radio"
              />
              <span>{`${option[0].toUpperCase()}${option.slice(1)} quality`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="c-arm-controls__actions">
        <button
          onClick={() => setCaptureMessage("Synthetic image captured")}
          type="button"
        >
          Take simulated image
        </button>
        <button
          onClick={() => {
            resetGeometry();
            setCaptureMessage("");
          }}
          type="button"
        >
          Reset geometry
        </button>
      </div>
      <p
        aria-label="Image capture status"
        className="c-arm-controls__capture-status"
        role="status"
      >
        {captureMessage}
      </p>
    </fieldset>
  );
}
