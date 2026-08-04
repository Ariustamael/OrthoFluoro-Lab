"use client";

import {
  useSimulationStore,
  type InteractionMode as InteractionModeValue,
} from "../../state/simulationStore";

const MODES: readonly {
  value: InteractionModeValue;
  label: string;
}[] = [
  { value: "inspect", label: "Inspect" },
  { value: "move-carm", label: "Move C-arm" },
];

export function InteractionMode() {
  const activeMode = useSimulationStore((state) => state.interactionMode);
  const setInteractionMode = useSimulationStore(
    (state) => state.setInteractionMode,
  );

  return (
    <fieldset className="interaction-mode">
      <legend>Interaction mode</legend>
      <div className="interaction-mode__options">
        {MODES.map((mode) => (
          <button
            aria-pressed={activeMode === mode.value}
            key={mode.value}
            onClick={() => setInteractionMode(mode.value)}
            type="button"
          >
            {mode.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
