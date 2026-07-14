"use client";

import type { KeyboardEvent } from "react";
import {
  AP_C_ARM_POSE,
  LATERAL_C_ARM_POSE,
} from "../../engine/geometry/anatomicalAxes";
import { C_ARM_POSE_BOUNDS } from "../../engine/geometry/cArmTransforms";
import type { CArmPose } from "../../engine/geometry/geometryTypes";
import { useSimulationStore } from "../../state/simulationStore";
import { InteractionMode } from "./InteractionMode";

type CArmParameter = keyof CArmPose;

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

export function CArmControls() {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const setCArmPose = useSimulationStore((state) => state.setCArmPose);
  const setCArmParameter = useSimulationStore(
    (state) => state.setCArmParameter,
  );
  const nudgeCArmParameter = useSimulationStore(
    (state) => state.nudgeCArmParameter,
  );
  const resetGeometry = useSimulationStore((state) => state.resetGeometry);

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
                <input
                  aria-describedby={unitId}
                  id={exactId}
                  max={control.max}
                  min={control.min}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(nextValue)) {
                      setCArmParameter(
                        control.key,
                        clampToControlRange(nextValue, control),
                      );
                    }
                  }}
                  onKeyDown={(event) => handleKeyDown(event, control)}
                  step={control.step}
                  type="number"
                  value={value}
                />
                <span id={unitId}>{control.unit}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div aria-label="Reference views" className="c-arm-controls__presets">
        <button onClick={() => setCArmPose(AP_C_ARM_POSE)} type="button">
          AP view
        </button>
        <button onClick={() => setCArmPose(LATERAL_C_ARM_POSE)} type="button">
          Lateral view
        </button>
      </div>

      <button onClick={resetGeometry} type="button">
        Reset geometry
      </button>
    </section>
  );
}
