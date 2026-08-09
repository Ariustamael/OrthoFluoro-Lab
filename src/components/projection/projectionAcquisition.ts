import type { QualityPreset } from "../../state/simulationStore";

const SETTLED_SIZE: Readonly<Record<QualityPreset, number>> = {
  high: 1024,
  low: 512,
  medium: 768,
};

const INTERACTIVE_SIZE: Readonly<Record<QualityPreset, number>> = {
  high: 512,
  low: 384,
  medium: 384,
};

export function detectorDimensions(
  quality: QualityPreset,
  interacting: boolean,
): { readonly width: number; readonly height: number } {
  const size = (interacting ? INTERACTIVE_SIZE : SETTLED_SIZE)[quality];
  return { height: size, width: size };
}
