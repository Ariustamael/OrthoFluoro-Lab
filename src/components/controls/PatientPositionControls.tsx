"use client";

import type {
  PatientPositionAxis,
  PatientPositionPreset,
  PatientRotationAxis,
} from "../../anatomy/anatomyTypes";
import {
  PATIENT_ROOT_POSITION_BOUNDS,
  PATIENT_ROOT_ROTATION_BOUNDS,
} from "../../anatomy/anatomyWorkspace";
import { useSimulationStore } from "../../state/simulationStore";

const POSITION_CONTROLS: readonly {
  axis: PatientPositionAxis;
  index: 0 | 1 | 2;
  label: string;
}[] = [
  { axis: "x", index: 0, label: "Patient lateral position" },
  { axis: "y", index: 1, label: "Patient vertical position" },
  { axis: "z", index: 2, label: "Patient longitudinal position" },
];

const ROTATION_CONTROLS: readonly {
  axis: PatientRotationAxis;
  index: 0 | 1 | 2;
  label: string;
}[] = [
  { axis: "pitch", index: 0, label: "Patient pitch" },
  { axis: "yaw", index: 1, label: "Patient yaw" },
  { axis: "roll", index: 2, label: "Patient roll" },
];

const PRESETS: readonly {
  id: PatientPositionPreset;
  label: string;
}[] = [
  { id: "supine", label: "Supine neutral" },
  { id: "prone", label: "Prone neutral" },
  { id: "left-lateral", label: "Left lateral" },
  { id: "right-lateral", label: "Right lateral" },
];

interface RootControlProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  unit: "mm" | "°";
  value: number;
}

function RootControl({
  label,
  max,
  min,
  onChange,
  step,
  unit,
  value,
}: RootControlProps) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  const commit = (nextValue: number) => {
    if (Number.isFinite(nextValue)) {
      onChange(nextValue);
    }
  };

  return (
    <div className="patient-position-control">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>
        {Math.round(value)} {unit}
      </output>
      <input
        id={id}
        max={max}
        min={min}
        onChange={(event) => commit(event.currentTarget.valueAsNumber)}
        step={step}
        type="range"
        value={value}
      />
      <label className="visually-hidden" htmlFor={`${id}-value`}>
        {label} value
      </label>
      <div className="patient-position-control__exact">
        <input
          aria-label={`${label} value`}
          id={`${id}-value`}
          max={max}
          min={min}
          onChange={(event) => commit(event.currentTarget.valueAsNumber)}
          step={step}
          type="number"
          value={value}
        />
        <span aria-hidden="true">{unit}</span>
      </div>
    </div>
  );
}

export function PatientPositionControls() {
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const setInteractionMode = useSimulationStore(
    (state) => state.setInteractionMode,
  );
  const setPatientRootPosition = useSimulationStore(
    (state) => state.setPatientRootPosition,
  );
  const setPatientRootRotation = useSimulationStore(
    (state) => state.setPatientRootRotation,
  );
  const applyPreset = useSimulationStore(
    (state) => state.applyPatientPositionPreset,
  );
  const resetPatientPosition = useSimulationStore(
    (state) => state.resetPatientPosition,
  );
  const movingPatient = interactionMode === "move-patient";

  return (
    <fieldset
      aria-label="Patient position"
      className="patient-position-controls anatomy-controls__option-group"
    >
      <legend>Patient position</legend>

      <button
        aria-pressed={movingPatient}
        className="patient-position-controls__direct"
        onClick={() =>
          setInteractionMode(movingPatient ? "inspect" : "move-patient")
        }
        type="button"
      >
        Move patient directly
      </button>

      <div className="patient-position-controls__presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset.id)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="patient-position-controls__fields">
        {POSITION_CONTROLS.map((control) => {
          const bounds = PATIENT_ROOT_POSITION_BOUNDS[control.axis];
          return (
            <RootControl
              key={control.axis}
              label={control.label}
              max={bounds.max}
              min={bounds.min}
              onChange={(value) =>
                setPatientRootPosition(control.axis, value)
              }
              step={10}
              unit="mm"
              value={pose.rootPosition[control.index]}
            />
          );
        })}
        {ROTATION_CONTROLS.map((control) => {
          const bounds = PATIENT_ROOT_ROTATION_BOUNDS[control.axis];
          return (
            <RootControl
              key={control.axis}
              label={control.label}
              max={bounds.max}
              min={bounds.min}
              onChange={(value) =>
                setPatientRootRotation(control.axis, value)
              }
              step={5}
              unit="°"
              value={pose.rootRotationDegrees[control.index]}
            />
          );
        })}
      </div>

      <button
        className="patient-position-controls__reset"
        onClick={resetPatientPosition}
        type="button"
      >
        Reset patient position
      </button>
    </fieldset>
  );
}
