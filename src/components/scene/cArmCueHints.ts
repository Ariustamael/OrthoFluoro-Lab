export type CArmCueId =
  "orbit" | "tilt" | "swivel" | "translate-x" | "translate-y" | "translate-z";

export interface CArmCueHint {
  readonly instruction: string;
  readonly label: string;
}

const C_ARM_CUE_HINTS = {
  orbit: { label: "Orbit", instruction: "Drag along the arc" },
  tilt: { label: "Tilt", instruction: "Drag across the arc" },
  swivel: { label: "Wig-wag", instruction: "Drag around the curved cue" },
  "translate-x": { label: "Lateral", instruction: "Move across the patient" },
  "translate-y": { label: "Vertical", instruction: "Move up or down" },
  "translate-z": {
    label: "Longitudinal",
    instruction: "Move headward or footward",
  },
} as const satisfies Record<CArmCueId, CArmCueHint>;

export function cArmCueHint(id: CArmCueId): CArmCueHint {
  return C_ARM_CUE_HINTS[id];
}
