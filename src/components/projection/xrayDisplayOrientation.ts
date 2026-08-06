export interface XrayDisplayOrientation {
  readonly rotationSteps: number;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
}

export const REFERENCE_XRAY_DISPLAY_ORIENTATION: Readonly<XrayDisplayOrientation> =
  Object.freeze({
    rotationSteps: 0,
    flipHorizontal: false,
    flipVertical: false,
  });

export function normalizeDisplayDegrees(rotationSteps: number): number {
  const integerSteps = Number.isFinite(rotationSteps)
    ? Math.trunc(rotationSteps)
    : 0;
  return ((integerSteps * 10) % 360 + 360) % 360;
}

export function xrayDisplayFitScale(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  degrees: number,
): number {
  const theta = (degrees * Math.PI) / 180;
  const rotatedWidth =
    Math.abs(imageWidth * Math.cos(theta)) +
    Math.abs(imageHeight * Math.sin(theta));
  const rotatedHeight =
    Math.abs(imageWidth * Math.sin(theta)) +
    Math.abs(imageHeight * Math.cos(theta));
  return Math.min(
    1,
    viewportWidth / rotatedWidth,
    viewportHeight / rotatedHeight,
  );
}

export function xrayDisplayTransform(
  orientation: XrayDisplayOrientation,
  fitScale: number,
): string {
  const x = orientation.flipHorizontal ? -1 : 1;
  const y = orientation.flipVertical ? -1 : 1;
  return `scale(${fitScale}) scale(${x}, ${y}) rotate(${normalizeDisplayDegrees(
    orientation.rotationSteps,
  )}deg)`;
}
