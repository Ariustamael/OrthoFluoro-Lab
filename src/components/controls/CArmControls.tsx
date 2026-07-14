"use client";

import { useState, type KeyboardEvent } from "react";
import {
  AP_C_ARM_POSE,
  LATERAL_C_ARM_POSE,
} from "../../engine/geometry/anatomicalAxes";
import { C_ARM_POSE_BOUNDS } from "../../engine/geometry/cArmTransforms";
import type { CArmPose } from "../../engine/geometry/geometryTypes";
import { useSimulationStore } from "../../state/simulationStore";
import { InteractionMode } from "./InteractionMode";

type CArmParameter = keyof CArmPose;
const OBJECT_ROTATION_AXES = ["X", "Y", "Z"] as const;

interface ControlDefinition {
  key: CArmParameter;
  label: string;
  exactLabel: string;
  min: number;
  max: number;
  step: number;
  snap: number;
  unit: "°" | "mm";
}

const CONTROLS: readonly ControlDefinition[] = [
  {
    key: "translationX",
    label: "Horizontal translation",
    exactLabel: "Horizontal translation value",
    min: -500,
    max: 500,
    step: 1,
    snap: 5,
    unit: "mm",
  },
  {
    key: "translationY",
    label: "Vertical translation offset",
    exactLabel: "Vertical translation offset value",
    min: -500,
    max: 500,
    step: 1,
    snap: 5,
    unit: "mm",
  },
  {
    key: "translationZ",
    label: "Longitudinal translation",
    exactLabel: "Longitudinal translation value",
    min: -500,
    max: 500,
    step: 1,
    snap: 5,
    unit: "mm",
  },
  {
    key: "height",
    label: "Height",
    exactLabel: "Height value",
    min: -500,
    max: 500,
    step: 1,
    snap: 5,
    unit: "mm",
  },
  {
    key: "orbitDegrees",
    label: "Orbit",
    exactLabel: "Orbit angle",
    ...C_ARM_POSE_BOUNDS.orbitDegrees,
    step: 1,
    snap: 5,
    unit: "°",
  },
  {
    key: "obliquityDegrees",
    label: "Obliquity",
    exactLabel: "Obliquity angle",
    ...C_ARM_POSE_BOUNDS.obliquityDegrees,
    step: 1,
    snap: 5,
    unit: "°",
  },
  {
    key: "cranialCaudalDegrees",
    label: "Cranial/caudal tilt",
    exactLabel: "Cranial/caudal angle",
    ...C_ARM_POSE_BOUNDS.cranialCaudalDegrees,
    step: 1,
    snap: 5,
    unit: "°",
  },
  {
    key: "sourceDetectorDistance",
    label: "Source-detector distance",
    exactLabel: "Source-to-detector distance",
    ...C_ARM_POSE_BOUNDS.sourceDetectorDistance,
    step: 1,
    snap: 5,
    unit: "mm",
  },
  {
    key: "detectorPatientDistance",
    label: "Detector-patient distance",
    exactLabel: "Detector-to-patient distance",
    ...C_ARM_POSE_BOUNDS.detectorPatientDistance,
    step: 1,
    snap: 5,
    unit: "mm",
  },
  {
    key: "collimationWidth",
    label: "Collimation width",
    exactLabel: "Collimation width value",
    min: 1,
    max: 600,
    step: 1,
    snap: 5,
    unit: "mm",
  },
  {
    key: "collimationHeight",
    label: "Collimation height",
    exactLabel: "Collimation height value",
    min: 1,
    max: 600,
    step: 1,
    snap: 5,
    unit: "mm",
  },
];

function clampToControlRange(
  value: number,
  control: ControlDefinition,
): number {
  return Math.min(control.max, Math.max(control.min, value));
}

function directionForKey(key: string): -1 | 1 | null {
  if (key === "ArrowLeft" || key === "ArrowDown") return -1;
  if (key === "ArrowRight" || key === "ArrowUp") return 1;
  return null;
}

interface ExactValueInputProps {
  control: ControlDefinition;
  id: string;
  onCommit: (value: number) => void;
  onNudge: (delta: number, snap?: number) => void;
  unitId: string;
  value: number;
}

function ExactValueInput({
  control,
  id,
  onCommit,
  onNudge,
  unitId,
  value,
}: ExactValueInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    if (draft === null || draft.trim() === "") {
      setDraft(null);
      return;
    }

    const parsedValue = Number(draft);
    if (!Number.isFinite(parsedValue)) {
      setDraft(null);
      return;
    }

    const nextValue = clampToControlRange(parsedValue, control);
    setDraft(null);
    onCommit(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      return;
    }

    const direction = directionForKey(event.key);
    if (direction === null) return;
    event.preventDefault();
    commitDraft();
    const delta = control.step * direction * (event.altKey ? 0.1 : 1);
    onNudge(delta, event.shiftKey ? control.snap : undefined);
  };

  return (
    <input
      aria-describedby={unitId}
      id={id}
      max={control.max}
      min={control.min}
      onBlur={commitDraft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
      step={control.step}
      type="number"
      value={draft ?? value}
    />
  );
}

export function CArmControls() {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const objectPose = useSimulationStore((state) => state.objectPose);
  const setCArmPose = useSimulationStore((state) => state.setCArmPose);
  const setCArmParameter = useSimulationStore(
    (state) => state.setCArmParameter,
  );
  const nudgeCArmParameter = useSimulationStore(
    (state) => state.nudgeCArmParameter,
  );
  const resetGeometry = useSimulationStore((state) => state.resetGeometry);
  const setObjectRotation = useSimulationStore(
    (state) => state.setObjectRotation,
  );
  const [captureMessage, setCaptureMessage] = useState("");

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    control: ControlDefinition,
  ) => {
    const direction = directionForKey(event.key);
    if (direction === null) return;
    event.preventDefault();
    const delta = control.step * direction * (event.altKey ? 0.1 : 1);
    nudgeCArmParameter(
      control.key,
      delta,
      event.shiftKey ? control.snap : undefined,
    );
  };

  return (
    <section
      aria-labelledby="c-arm-controls-heading"
      className="c-arm-controls"
    >
      <h2 id="c-arm-controls-heading">C-arm controls</h2>
      <InteractionMode />

      <div className="c-arm-controls__parameters">
        {CONTROLS.map((control) => {
          const rangeId = `${control.key}-range`;
          const exactId = `${control.key}-exact`;
          const unitId = `${control.key}-unit`;
          const value = cArmPose[control.key];

          return (
            <div className="c-arm-control" key={control.key}>
              <label htmlFor={rangeId}>{control.label}</label>
              <input
                id={rangeId}
                max={control.max}
                min={control.min}
                onChange={(event) =>
                  setCArmParameter(
                    control.key,
                    clampToControlRange(
                      event.currentTarget.valueAsNumber,
                      control,
                    ),
                  )
                }
                onKeyDown={(event) => handleKeyDown(event, control)}
                step={control.step}
                type="range"
                value={value}
              />
              <label className="c-arm-control__exact-label" htmlFor={exactId}>
                {control.exactLabel}
              </label>
              <span className="c-arm-control__exact">
                <ExactValueInput
                  control={control}
                  id={exactId}
                  onCommit={(nextValue) =>
                    setCArmParameter(control.key, nextValue)
                  }
                  onNudge={(delta, snap) =>
                    nudgeCArmParameter(control.key, delta, snap)
                  }
                  unitId={unitId}
                  value={value}
                />
                <span id={unitId}>{control.unit}</span>
              </span>
            </div>
          );
        })}
      </div>

      <fieldset className="object-rotation-controls">
        <legend>Object rotation</legend>
        <p>Rotate the procedural teaching object independently of the C-arm.</p>
        <div className="object-rotation-controls__fields">
          {OBJECT_ROTATION_AXES.map((axis, index) => (
            <label key={axis}>
              <span>{axis} axis</span>
              <span className="c-arm-control__exact">
                <input
                  aria-label={`Object rotation ${axis}`}
                  max={180}
                  min={-180}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(nextValue)) return;
                    const rotation = [...objectPose.rotationDegrees] as [
                      number,
                      number,
                      number,
                    ];
                    rotation[index] = Math.min(180, Math.max(-180, nextValue));
                    setObjectRotation(rotation);
                  }}
                  step={1}
                  type="number"
                  value={objectPose.rotationDegrees[index]}
                />
                <span aria-hidden="true">°</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div aria-label="Reference views" className="c-arm-controls__presets">
        <button onClick={() => setCArmPose(AP_C_ARM_POSE)} type="button">
          AP view
        </button>
        <button onClick={() => setCArmPose(LATERAL_C_ARM_POSE)} type="button">
          Lateral view
        </button>
      </div>

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
      <p aria-label="Image capture status" role="status">
        {captureMessage}
      </p>
    </section>
  );
}
