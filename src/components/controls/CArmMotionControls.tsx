"use client";

import { useState, type KeyboardEvent } from "react";
import { C_ARM_RIG_PRESETS } from "../../engine/geometry/cArmRigPresets";
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
    label: "Lateral translation",
    exactLabel: "Lateral translation value",
    ...C_ARM_POSE_BOUNDS.translationX,
    step: 1,
    snap: 10,
    unit: "mm",
  },
  {
    key: "translationY",
    label: "Vertical translation",
    exactLabel: "Vertical translation value",
    ...C_ARM_POSE_BOUNDS.translationY,
    step: 1,
    snap: 10,
    unit: "mm",
  },
  {
    key: "translationZ",
    label: "Longitudinal translation",
    exactLabel: "Longitudinal translation value",
    ...C_ARM_POSE_BOUNDS.translationZ,
    step: 1,
    snap: 10,
    unit: "mm",
  },
  {
    key: "swivelDegrees",
    label: "Swivel",
    exactLabel: "Swivel angle",
    ...C_ARM_POSE_BOUNDS.swivelDegrees,
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
    key: "orbitDegrees",
    label: "Orbit",
    exactLabel: "Orbit angle",
    ...C_ARM_POSE_BOUNDS.orbitDegrees,
    step: 1,
    snap: 5,
    unit: "°",
  },
];

const CONTROL_GROUPS = [
  {
    ariaLabel: "Translation cue",
    controls: CONTROLS.slice(0, 3),
    legend: "Position",
  },
  {
    ariaLabel: "Wig-wag cue",
    controls: CONTROLS.slice(3, 4),
    legend: "Wig-wag / swivel",
  },
  {
    ariaLabel: "Orbit and tilt cue",
    controls: CONTROLS.slice(4),
    legend: "Orbit and tilt",
  },
] as const;

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

export function CArmMotionControls() {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const cArmMode = useSimulationStore((state) => state.cArmMode);
  const showBeam = useSimulationStore((state) => state.showBeam);
  const setCArmParameter = useSimulationStore(
    (state) => state.setCArmParameter,
  );
  const nudgeCArmParameter = useSimulationStore(
    (state) => state.nudgeCArmParameter,
  );
  const setCArmMode = useSimulationStore((state) => state.setCArmMode);
  const setShowBeam = useSimulationStore((state) => state.setShowBeam);
  const preset = C_ARM_RIG_PRESETS[cArmMode];

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
    <fieldset aria-label="Move C-arm" className="control-column">
      <legend className="control-column__title">Move C-arm</legend>
      <InteractionMode />

      <fieldset className="c-arm-controls__rig-motion">
        <legend>Rig motion</legend>
        <button
          aria-pressed={cArmMode === "isocentric"}
          onClick={() => setCArmMode("isocentric")}
          type="button"
        >
          Isocentric
        </button>
        <button
          aria-pressed={cArmMode === "non-isocentric"}
          onClick={() => setCArmMode("non-isocentric")}
          type="button"
        >
          Non-isocentric
        </button>
      </fieldset>

      <label className="c-arm-controls__beam-toggle">
        <input
          checked={showBeam}
          onChange={(event) => setShowBeam(event.currentTarget.checked)}
          type="checkbox"
        />
        Show X-ray beam
      </label>

      <dl className="c-arm-controls__geometry-summary">
        <div>
          <dt>SID</dt>
          <dd>{preset.sourceDetectorDistance} mm</dd>
        </div>
        <div>
          <dt>Detector</dt>
          <dd>
            {preset.detectorWidth} × {preset.detectorHeight} mm
          </dd>
        </div>
      </dl>

      <div className="c-arm-controls__parameters">
        {CONTROL_GROUPS.map(({ ariaLabel, controls, legend }) => (
          <fieldset
            aria-label={ariaLabel}
            className="c-arm-controls__parameter-group"
            key={legend}
          >
            <legend>{legend}</legend>
            <div className="c-arm-controls__parameter-fields">
              {controls.map((control) => {
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
                    <label
                      className="c-arm-control__exact-label"
                      htmlFor={exactId}
                    >
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
          </fieldset>
        ))}
      </div>
    </fieldset>
  );
}
