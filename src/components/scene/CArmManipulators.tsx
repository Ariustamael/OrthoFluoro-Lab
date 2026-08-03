"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Group,
  MathUtils,
  Mesh,
  Quaternion,
  Vector3,
  type Intersection,
  type Raycaster,
} from "three";
import type { CArmLocalGeometry } from "../../engine/geometry/cArmRigGeometry";
import type {
  CArmGeometry,
  CArmPose,
  CArmRigPreset,
  Vec3,
} from "../../engine/geometry/geometryTypes";
import {
  useSimulationStore,
  type InteractionMode,
} from "../../state/simulationStore";
import {
  applyCArmManipulatorDelta,
  applyDragModifiers,
  captureHandlePointer,
  constantScreenScale,
  projectWorldAxisToScreen,
  projectWorldPointToScreen,
  rayPassesWithinWorldRadius,
  releaseHandlePointer,
  screenTangentDelta,
  signedScreenAngle,
  type PointerCaptureTarget,
  type ScreenPoint,
} from "./cArmManipulatorMath";
import type { CArmCueId } from "./cArmCueHints";

type ManipulatorKind = "rotation" | "translation";
type ManipulatorId = CArmCueId;

export interface CArmManipulatorControlDefinition {
  readonly color: string;
  readonly id: ManipulatorId;
  readonly kind: ManipulatorKind;
  readonly parameter: keyof CArmPose;
  readonly worldAxis?: Vec3;
}

export const C_ARM_MANIPULATOR_CONTROL_DEFINITIONS: readonly CArmManipulatorControlDefinition[] =
  Object.freeze([
    Object.freeze({
      color: "#54ddff",
      id: "orbit",
      kind: "rotation",
      parameter: "orbitDegrees",
    }),
    Object.freeze({
      color: "#ffb454",
      id: "tilt",
      kind: "rotation",
      parameter: "cranialCaudalDegrees",
    }),
    Object.freeze({
      color: "#ff7167",
      id: "translate-x",
      kind: "translation",
      parameter: "translationX",
      worldAxis: [1, 0, 0] as const,
    }),
    Object.freeze({
      color: "#79df8b",
      id: "translate-y",
      kind: "translation",
      parameter: "translationY",
      worldAxis: [0, 1, 0] as const,
    }),
    Object.freeze({
      color: "#5aa7ff",
      id: "translate-z",
      kind: "translation",
      parameter: "translationZ",
      worldAxis: [0, 0, 1] as const,
    }),
    Object.freeze({
      color: "#d58cff",
      id: "swivel",
      kind: "rotation",
      parameter: "swivelDegrees",
    }),
  ]);

export function cueAppearance(hovered: boolean, active: boolean) {
  if (active) return { glyphOpacity: 1, otherOpacity: 0.1 } as const;
  if (hovered) return { glyphOpacity: 0.92, otherOpacity: 0.18 } as const;
  return { glyphOpacity: 0.34, otherOpacity: 0.34 } as const;
}

export function isCArmCancelKey(key: string): boolean {
  return key === "Escape";
}

export type CArmDragEndReason =
  | "pointer-up"
  | "pointer-cancel"
  | "lost-capture"
  | "blur"
  | "mode-exit"
  | "escape";

export const C_ARM_CUE_GEOMETRY = Object.freeze({
  circular: Object.freeze({
    arrowHeight: 0.08,
    arrowRadius: 0.03,
    glyphRadius: 0.15,
    glyphTube: 0.03,
    hitRadius: 0.5,
    hitShape: "filled-disc",
  }),
  linear: Object.freeze({
    arrowHeight: 0.07,
    arrowOffset: 0.18,
    arrowRadius: 0.03,
    glyphLength: 0.27,
    glyphRadius: 0.035,
    hitOffset: 0.71,
    hitRadius: 0.5,
    hitShape: "paired-spheres",
  }),
} as const);

export interface CArmCueHitTargetLobe {
  readonly axis: Vec3;
  readonly controlId: CArmCueId;
  readonly id: string;
  readonly position: Vec3;
  readonly radius: number;
}

const cueHitTarget = (
  id: string,
  controlId: CArmCueId,
  axis: Vec3,
  position: Vec3,
  radius: number,
): CArmCueHitTargetLobe =>
  Object.freeze({ axis, controlId, id, position, radius });

const LINEAR_HIT_RADIUS = C_ARM_CUE_GEOMETRY.linear.hitRadius;
const LINEAR_HIT_OFFSET = C_ARM_CUE_GEOMETRY.linear.hitOffset;

// These are the exact local positions consumed by the invisible hit meshes below.
// Opposing lobes meet the visible arrowheads while each control stays independent.
export const C_ARM_CUE_HIT_TARGET_LAYOUT = Object.freeze({
  orbit: Object.freeze([
    cueHitTarget(
      "orbit",
      "orbit",
      [0, 0, 1],
      [0, 0, 0],
      C_ARM_CUE_GEOMETRY.circular.hitRadius,
    ),
  ]),
  tilt: Object.freeze(
    ([-1, 1] as const).map((direction) =>
      cueHitTarget(
        `tilt-${direction > 0 ? "positive" : "negative"}`,
        "tilt",
        [0, 1, 0],
        [0.78, direction * LINEAR_HIT_OFFSET, 0],
        LINEAR_HIT_RADIUS,
      ),
    ),
  ),
  translation: Object.freeze(
    (
      [
        ["translate-x", [1, 0, 0]],
        ["translate-y", [0, 1, 0]],
        ["translate-z", [0, 0, 1]],
      ] as const
    ).flatMap(([controlId, axis]) =>
      ([-1, 1] as const).map((direction) =>
        cueHitTarget(
          `${controlId}-${direction > 0 ? "positive" : "negative"}`,
          controlId,
          axis,
          [
            axis[0] * direction * LINEAR_HIT_OFFSET,
            axis[1] * direction * LINEAR_HIT_OFFSET,
            axis[2] * direction * LINEAR_HIT_OFFSET,
          ],
          LINEAR_HIT_RADIUS,
        ),
      ),
    ),
  ),
});

export function cArmCueHitTargetContainsPoint(
  target: CArmCueHitTargetLobe,
  point: Vec3,
): boolean {
  return (
    new Vector3(...target.position).distanceTo(new Vector3(...point)) <=
    target.radius
  );
}

export function createTranslationHitTargetRaycastLayout(
  translationPosition: Vec3,
  targetScale: number,
): readonly CArmCueHitTargetLobe[] {
  return Object.freeze(
    C_ARM_CUE_HIT_TARGET_LAYOUT.translation.map((target) =>
      Object.freeze({
        ...target,
        position: [
          translationPosition[0] + target.position[0] * targetScale,
          translationPosition[1] + target.position[1] * targetScale,
          translationPosition[2] + target.position[2] * targetScale,
        ] as Vec3,
        radius: target.radius * targetScale,
      }),
    ),
  );
}

export function selectTranslationHitTargetForRay(
  raycaster: Raycaster,
  targets: readonly CArmCueHitTargetLobe[],
): CArmCueHitTargetLobe | null {
  let winner: CArmCueHitTargetLobe | null = null;
  let winnerDistance = Infinity;
  targets.forEach((target) => {
    const distance = raycaster.ray.distanceSqToPoint(
      new Vector3(...target.position),
    );
    if (distance < winnerDistance) {
      winner = target;
      winnerDistance = distance;
    }
  });
  return winner;
}

export function shouldRaycastTranslationHitTarget(
  raycaster: Raycaster,
  targets: readonly CArmCueHitTargetLobe[],
  targetId: string,
): boolean {
  return selectTranslationHitTargetForRay(raycaster, targets)?.id === targetId;
}

export function cArmCueTargetMinimumExtent(
  kind: keyof typeof C_ARM_CUE_GEOMETRY,
): number {
  if (kind === "circular") return C_ARM_CUE_GEOMETRY.circular.hitRadius * 2;
  const geometry = C_ARM_CUE_GEOMETRY.linear;
  return geometry.hitRadius * 2;
}

export function cArmCueGlyphMaximumExtent(
  kind: keyof typeof C_ARM_CUE_GEOMETRY,
): number {
  if (kind === "circular") {
    const geometry = C_ARM_CUE_GEOMETRY.circular;
    return (geometry.glyphRadius + geometry.glyphTube) * 2;
  }
  const geometry = C_ARM_CUE_GEOMETRY.linear;
  return (geometry.arrowOffset + geometry.arrowHeight / 2) * 2;
}

type ManipulatorGroupName =
  "Orbit and tilt cue" | "Wig-wag cue" | "Translation cue";

interface ManipulatorGroupModel {
  readonly name: ManipulatorGroupName;
  readonly position: Vec3;
}

export interface CArmManipulatorRenderModel {
  readonly localAnchors: Readonly<{
    orbitTilt: Vec3;
    swivel: Vec3;
    translation: Vec3;
  }>;
  readonly floatingOrbitTangent: Vec3;
  readonly floatingTiltAxis: Vec3;
  readonly groups: readonly ManipulatorGroupModel[];
}

const tuple = (vector: Vector3): Vec3 =>
  [vector.x, vector.y, vector.z] as const;

export const C_ARM_CUE_ANCHORS = Object.freeze({
  orbitTilt: Object.freeze({ degrees: -225, radialOffset: 36 }),
  translation: Object.freeze({ degrees: -135, radialOffset: 48 }),
} as const);

export function localArcCueAnchor(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  degrees: number,
  radialOffset: number,
): Vec3 {
  const theta = MathUtils.degToRad(degrees);
  const radius = local.arcRadius + preset.arcRadialThickness / 2 + radialOffset;
  return [radius * Math.cos(theta), radius * Math.sin(theta), 0];
}

export function createCArmManipulatorRenderModel(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  geometry: CArmGeometry,
  interactionMode: InteractionMode,
): CArmManipulatorRenderModel {
  const orbitTiltDegrees = C_ARM_CUE_ANCHORS.orbitTilt.degrees;
  const swivelDegrees = MathUtils.radToDeg(
    (local.arcStartRadians + local.arcEndRadians) / 2,
  );
  const localAnchors = Object.freeze({
    orbitTilt: localArcCueAnchor(
      local,
      preset,
      orbitTiltDegrees,
      C_ARM_CUE_ANCHORS.orbitTilt.radialOffset,
    ),
    swivel: localArcCueAnchor(
      local,
      preset,
      swivelDegrees,
      C_ARM_CUE_ANCHORS.orbitTilt.radialOffset,
    ),
    translation: localArcCueAnchor(
      local,
      preset,
      C_ARM_CUE_ANCHORS.translation.degrees,
      C_ARM_CUE_ANCHORS.translation.radialOffset,
    ),
  });
  const rigQuaternion = new Quaternion(...geometry.rigTransform.quaternion);
  const rigPosition = new Vector3(...geometry.rigTransform.position);
  const toWorldAnchor = (anchor: Vec3): Vec3 =>
    tuple(
      new Vector3(...anchor).applyQuaternion(rigQuaternion).add(rigPosition),
    );
  const orbitTiltPosition = toWorldAnchor(localAnchors.orbitTilt);
  const swivelPosition = toWorldAnchor(localAnchors.swivel);
  const translationPosition = toWorldAnchor(localAnchors.translation);
  const floatingOrbitTangent = new Vector3(
    -Math.sin(MathUtils.degToRad(orbitTiltDegrees)),
    Math.cos(MathUtils.degToRad(orbitTiltDegrees)),
    0,
  ).applyQuaternion(rigQuaternion);
  const floatingTiltAxis = new Vector3(0, 0, 1).applyQuaternion(rigQuaternion);
  const groups: ManipulatorGroupModel[] =
    interactionMode === "move-carm"
      ? [
          {
            name: "Orbit and tilt cue",
            position: orbitTiltPosition,
          },
          { name: "Wig-wag cue", position: swivelPosition },
          { name: "Translation cue", position: translationPosition },
        ]
      : [];

  return Object.freeze({
    localAnchors,
    floatingOrbitTangent: tuple(floatingOrbitTangent),
    floatingTiltAxis: tuple(floatingTiltAxis),
    groups: Object.freeze(groups),
  });
}

export interface CArmManipulatorDrag {
  readonly captureTarget: PointerCaptureTarget;
  readonly center?: ScreenPoint;
  readonly definition: CArmManipulatorControlDefinition;
  readonly pointerId: number;
  readonly screenTangent?: ScreenPoint;
  readonly startPointer: ScreenPoint;
  readonly startPose: CArmPose;
}

export interface CArmDragControllerCallbacks {
  onActiveIdChange: (id: CArmCueId | null) => void;
  onDragStateChange: (active: boolean) => void;
  onHintChange: (id: CArmCueId | null) => void;
  setCArmPose: (pose: CArmPose) => void;
}

export interface CArmDragController {
  activeDrag: () => CArmManipulatorDrag | null;
  cancelKey: (key: string) => boolean;
  clearHint: () => void;
  finish: (
    reason: CArmDragEndReason,
    pointerId?: number,
    releaseCapture?: boolean,
  ) => boolean;
  start: (drag: CArmManipulatorDrag) => void;
  updateCallbacks: (next: CArmDragControllerCallbacks) => void;
}

export function createCArmDragController(
  initialCallbacks: CArmDragControllerCallbacks,
): CArmDragController {
  let active: CArmManipulatorDrag | null = null;
  let callbacks = initialCallbacks;

  const clear = (drag: CArmManipulatorDrag, releaseCapture: boolean) => {
    if (releaseCapture) {
      releaseHandlePointer(drag.captureTarget, drag.pointerId);
    }
    active = null;
    callbacks.onActiveIdChange(null);
    callbacks.onDragStateChange(false);
    callbacks.onHintChange(null);
  };

  return {
    activeDrag: () => active,
    cancelKey: (key) => {
      const drag = active;
      if (!isCArmCancelKey(key) || drag === null) return false;
      callbacks.setCArmPose(drag.startPose);
      clear(drag, true);
      return true;
    },
    clearHint: () => callbacks.onHintChange(null),
    finish: (_reason, pointerId, releaseCapture = true) => {
      const drag = active;
      if (
        drag === null ||
        (pointerId !== undefined && drag.pointerId !== pointerId)
      ) {
        return false;
      }
      clear(drag, releaseCapture);
      return true;
    },
    start: (drag) => {
      captureHandlePointer(drag.captureTarget, drag.pointerId);
      active = drag;
      callbacks.onActiveIdChange(drag.definition.id);
      callbacks.onDragStateChange(true);
      callbacks.onHintChange(drag.definition.id);
    },
    updateCallbacks: (next) => {
      callbacks = next;
    },
  };
}

export function teardownCArmManipulatorInteraction(
  controller: CArmDragController,
  reason: CArmDragEndReason,
): void {
  if (!controller.finish(reason)) controller.clearHint();
}

interface CArmManipulatorsProps {
  geometry: CArmGeometry;
  local: CArmLocalGeometry;
  onDragStateChange: (active: boolean) => void;
  onHintChange: (id: CArmCueId | null) => void;
  preset: CArmRigPreset;
}

const ROTATION_DEGREES_PER_PIXEL = 0.4;
const TRANSLATION_MM_PER_PIXEL = 1.5;
const CUE_TARGET_PIXELS = 44;
const OVERLAY_RENDER_ORDER = 1200;

const AXIS_ROTATIONS = {
  "translate-x": [0, 0, -Math.PI / 2],
  "translate-y": [0, 0, 0],
  "translate-z": [Math.PI / 2, 0, 0],
} as const;

const LINEAR_SCREEN_TANGENT_FALLBACKS = {
  cranialCaudalDegrees: [0, 1],
  translationX: [1, 0],
  translationY: [0, 1],
  translationZ: [Math.SQRT1_2, Math.SQRT1_2],
} as const satisfies Partial<Record<keyof CArmPose, ScreenPoint>>;

export function resolveCArmManipulatorScreenTangent(
  definition: CArmManipulatorControlDefinition,
  projectedTangent: ScreenPoint,
): ScreenPoint {
  if (Math.hypot(...projectedTangent) > 0) return projectedTangent;
  return (
    LINEAR_SCREEN_TANGENT_FALLBACKS[definition.parameter] ?? projectedTangent
  );
}

export function cArmManipulatorScreenDragDelta(
  definition: CArmManipulatorControlDefinition,
  start: ScreenPoint,
  current: ScreenPoint,
  tangent: ScreenPoint,
): number {
  return (
    screenTangentDelta(start, current, tangent) *
    (definition.kind === "rotation"
      ? ROTATION_DEGREES_PER_PIXEL
      : TRANSLATION_MM_PER_PIXEL)
  );
}

export function CArmManipulators({
  geometry,
  local,
  onDragStateChange,
  onHintChange,
  preset,
}: CArmManipulatorsProps) {
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const setCArmParameter = useSimulationStore(
    (state) => state.setCArmParameter,
  );
  const setCArmPose = useSimulationStore((state) => state.setCArmPose);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const floatingRef = useRef<Group>(null);
  const translationRef = useRef<Group>(null);
  const swivelRef = useRef<Group>(null);
  const translationHitTargetRefs = useRef(new Map<string, Mesh>());
  const [activeId, setActiveId] = useState<CArmCueId | null>(null);
  const [hoveredId, setHoveredId] = useState<CArmCueId | null>(null);
  const dragControllerRef = useRef<CArmDragController | null>(null);
  const dragControllerCallbacks: CArmDragControllerCallbacks = {
    onActiveIdChange: setActiveId,
    onDragStateChange,
    onHintChange,
    setCArmPose,
  };
  if (dragControllerRef.current === null) {
    dragControllerRef.current = createCArmDragController(
      dragControllerCallbacks,
    );
  } else {
    dragControllerRef.current.updateCallbacks(dragControllerCallbacks);
  }
  const model = useMemo(
    () =>
      createCArmManipulatorRenderModel(
        local,
        preset,
        geometry,
        interactionMode,
      ),
    [geometry, interactionMode, local, preset],
  );
  const swivelRaycast = useCallback(
    function (this: Mesh, raycaster: Raycaster, intersections: Intersection[]) {
      const translation = translationRef.current;
      const translationPosition = model.groups.find(
        ({ name }) => name === "Translation cue",
      )?.position;
      if (
        translation !== null &&
        translationPosition !== undefined &&
        rayPassesWithinWorldRadius(
          raycaster,
          translationPosition,
          translation.scale.x * 0.95,
        )
      ) {
        return;
      }
      Mesh.prototype.raycast.call(this, raycaster, intersections);
    },
    [model],
  );
  const setTranslationHitTargetRef = useCallback(
    (id: string, mesh: Mesh | null) => {
      if (mesh === null) translationHitTargetRefs.current.delete(id);
      else translationHitTargetRefs.current.set(id, mesh);
    },
    [],
  );
  const translationHitTargetRaycast = useCallback(function (
    this: Mesh,
    raycaster: Raycaster,
    intersections: Intersection[],
  ) {
    const targets = C_ARM_CUE_HIT_TARGET_LAYOUT.translation.flatMap(
      (target) => {
        const mesh = translationHitTargetRefs.current.get(target.id);
        if (mesh === undefined) return [];
        const position = tuple(mesh.getWorldPosition(new Vector3()));
        return [{ ...target, position }];
      },
    );
    if (
      !shouldRaycastTranslationHitTarget(
        raycaster,
        targets,
        this.userData.cArmCueHitTargetId as string,
      )
    ) {
      return;
    }
    Mesh.prototype.raycast.call(this, raycaster, intersections);
  }, []);

  const finishActiveDrag = useCallback(
    (
      pointerId?: number,
      releaseCapture = true,
      reason: CArmDragEndReason = "pointer-up",
    ) => {
      dragControllerRef.current!.finish(reason, pointerId, releaseCapture);
    },
    [],
  );

  useEffect(() => {
    const handleWindowBlur = () => finishActiveDrag(undefined, true, "blur");
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      teardownCArmManipulatorInteraction(
        dragControllerRef.current!,
        "mode-exit",
      );
    };
  }, [finishActiveDrag]);

  useEffect(() => {
    if (interactionMode !== "move-carm") {
      teardownCArmManipulatorInteraction(
        dragControllerRef.current!,
        "mode-exit",
      );
      setHoveredId(null);
      setActiveId(null);
    }
  }, [interactionMode]);

  useEffect(() => {
    const cancelActiveDrag = (event: KeyboardEvent) => {
      if (!dragControllerRef.current!.cancelKey(event.key)) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", cancelActiveDrag);
    return () => window.removeEventListener("keydown", cancelActiveDrag);
  }, []);

  useFrame(() => {
    const floating = floatingRef.current;
    const translation = translationRef.current;
    const swivel = swivelRef.current;
    const floatingPosition = model.groups.find(
      ({ name }) => name === "Orbit and tilt cue",
    )?.position;
    const translationPosition = model.groups.find(
      ({ name }) => name === "Translation cue",
    )?.position;
    const swivelPosition = model.groups.find(
      ({ name }) => name === "Wig-wag cue",
    )?.position;

    if (floating !== null && floatingPosition !== undefined) {
      floating.scale.setScalar(
        constantScreenScale(
          floatingPosition,
          camera,
          size.height,
          CUE_TARGET_PIXELS,
        ),
      );
      floating.quaternion.copy(camera.quaternion);
    }
    if (translation !== null && translationPosition !== undefined) {
      translation.scale.setScalar(
        constantScreenScale(
          translationPosition,
          camera,
          size.height,
          CUE_TARGET_PIXELS,
        ),
      );
    }
    if (swivel !== null && swivelPosition !== undefined) {
      swivel.scale.setScalar(
        constantScreenScale(
          swivelPosition,
          camera,
          size.height,
          CUE_TARGET_PIXELS,
        ),
      );
      swivel.quaternion.copy(camera.quaternion);
    }
  });

  const beginDrag = useCallback(
    (
      definition: CArmManipulatorControlDefinition,
      event: ThreeEvent<PointerEvent>,
    ) => {
      event.stopPropagation();
      finishActiveDrag();
      const captureTarget = event.target as unknown as PointerCaptureTarget;
      const startPointer: ScreenPoint = [event.clientX, event.clientY];
      let screenTangent: ScreenPoint | undefined;
      let center: ScreenPoint | undefined;

      if (definition.id === "swivel") {
        center = projectWorldPointToScreen(
          model.groups.find(({ name }) => name === "Wig-wag cue")!.position,
          camera,
          size,
        );
      } else {
        const axis =
          definition.id === "orbit"
            ? model.floatingOrbitTangent
            : definition.id === "tilt"
              ? model.floatingTiltAxis
              : definition.worldAxis!;
        const origin =
          definition.kind === "translation"
            ? model.groups.find(({ name }) => name === "Translation cue")!
                .position
            : model.groups.find(({ name }) => name === "Orbit and tilt cue")!
                .position;
        screenTangent = resolveCArmManipulatorScreenTangent(
          definition,
          projectWorldAxisToScreen(axis, camera, size, origin),
        );
      }

      dragControllerRef.current!.start({
        captureTarget,
        center,
        definition,
        pointerId: event.pointerId,
        screenTangent,
        startPointer,
        startPose: { ...useSimulationStore.getState().cArmPose },
      });
    },
    [camera, finishActiveDrag, model, size],
  );

  const moveDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragControllerRef.current!.activeDrag();
      if (drag === null || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const current: ScreenPoint = [event.clientX, event.clientY];
      const rawDelta =
        drag.definition.id === "swivel"
          ? signedScreenAngle(drag.center!, drag.startPointer, current)
          : cArmManipulatorScreenDragDelta(
              drag.definition,
              drag.startPointer,
              current,
              drag.screenTangent!,
            );
      const delta = applyDragModifiers(rawDelta, drag.definition.kind, event);
      const nextPose = applyCArmManipulatorDelta(
        drag.startPose,
        drag.definition.parameter,
        delta,
      );
      setCArmParameter(
        drag.definition.parameter,
        nextPose[drag.definition.parameter],
      );
    },
    [setCArmParameter],
  );

  const endDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (
        dragControllerRef.current!.activeDrag()?.pointerId !== event.pointerId
      ) {
        return;
      }
      event.stopPropagation();
      finishActiveDrag(event.pointerId, true, "pointer-up");
    },
    [finishActiveDrag],
  );

  const loseCapture = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      finishActiveDrag(event.pointerId, false, "lost-capture");
    },
    [finishActiveDrag],
  );

  const cancelDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (
        dragControllerRef.current!.activeDrag()?.pointerId !== event.pointerId
      ) {
        return;
      }
      event.stopPropagation();
      finishActiveDrag(event.pointerId, true, "pointer-cancel");
    },
    [finishActiveDrag],
  );

  const handlersFor = (definition: CArmManipulatorControlDefinition) => ({
    onLostPointerCapture: loseCapture,
    onPointerCancel: cancelDrag,
    onPointerDown: (event: ThreeEvent<PointerEvent>) =>
      beginDrag(definition, event),
    onPointerMove: moveDrag,
    onPointerOut: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredId((current) => (current === definition.id ? null : current));
      if (dragControllerRef.current!.activeDrag() === null) onHintChange(null);
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredId(definition.id);
      if (dragControllerRef.current!.activeDrag() === null) {
        onHintChange(definition.id);
      }
    },
    onPointerUp: endDrag,
  });

  const glyphOpacity = (id: CArmCueId): number => {
    const foregroundId = activeId ?? hoveredId;
    const appearance = cueAppearance(foregroundId === id, activeId === id);
    return foregroundId === null || foregroundId === id
      ? appearance.glyphOpacity
      : appearance.otherOpacity;
  };

  if (interactionMode !== "move-carm") return null;

  const orbit = C_ARM_MANIPULATOR_CONTROL_DEFINITIONS[0];
  const tilt = C_ARM_MANIPULATOR_CONTROL_DEFINITIONS[1];
  const translationDefinitions = C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.slice(
    2,
    5,
  );
  const swivel = C_ARM_MANIPULATOR_CONTROL_DEFINITIONS[5];

  return (
    <>
      <group
        name="Orbit and tilt cue"
        position={model.groups[0]!.position}
        ref={floatingRef}
      >
        <mesh
          name="Orbit hit target"
          position={C_ARM_CUE_HIT_TARGET_LAYOUT.orbit[0]!.position}
          renderOrder={OVERLAY_RENDER_ORDER + 1}
          {...handlersFor(orbit)}
        >
          <circleGeometry args={[C_ARM_CUE_GEOMETRY.circular.hitRadius, 32]} />
          <meshBasicMaterial
            depthTest={false}
            depthWrite={false}
            opacity={0}
            transparent
          />
        </mesh>
        <group>
          <mesh name="Orbit glyph" renderOrder={OVERLAY_RENDER_ORDER + 1}>
            <torusGeometry
              args={[
                C_ARM_CUE_GEOMETRY.circular.glyphRadius,
                C_ARM_CUE_GEOMETRY.circular.glyphTube,
                10,
                32,
              ]}
            />
            <meshBasicMaterial
              color={orbit.color}
              depthTest={false}
              depthWrite={false}
              opacity={glyphOpacity(orbit.id)}
              transparent
            />
          </mesh>
          {([-1, 1] as const).map((direction) => (
            <mesh
              key={direction}
              name={`Orbit ${direction > 0 ? "clockwise" : "counterclockwise"} arrowhead`}
              position={[
                0,
                direction * C_ARM_CUE_GEOMETRY.circular.glyphRadius,
                0,
              ]}
              renderOrder={OVERLAY_RENDER_ORDER + 1}
              rotation={[0, 0, (direction * Math.PI) / 2]}
            >
              <coneGeometry
                args={[
                  C_ARM_CUE_GEOMETRY.circular.arrowRadius,
                  C_ARM_CUE_GEOMETRY.circular.arrowHeight,
                  10,
                ]}
              />
              <meshBasicMaterial
                color={orbit.color}
                depthTest={false}
                depthWrite={false}
                opacity={glyphOpacity(orbit.id)}
                transparent
              />
            </mesh>
          ))}
        </group>
        {C_ARM_CUE_HIT_TARGET_LAYOUT.tilt.map((target, index) => (
          <mesh
            key={index}
            name="Tilt hit target"
            position={target.position}
            renderOrder={OVERLAY_RENDER_ORDER + 1}
            {...handlersFor(tilt)}
          >
            <sphereGeometry args={[target.radius, 10, 10]} />
            <meshBasicMaterial
              depthTest={false}
              depthWrite={false}
              opacity={0}
              transparent
            />
          </mesh>
        ))}
        <group position={[0.78, 0, 0]}>
          <mesh name="Tilt glyph" renderOrder={OVERLAY_RENDER_ORDER + 1}>
            <capsuleGeometry
              args={[
                C_ARM_CUE_GEOMETRY.linear.glyphRadius,
                C_ARM_CUE_GEOMETRY.linear.glyphLength,
                5,
                10,
              ]}
            />
            <meshBasicMaterial
              color={tilt.color}
              depthTest={false}
              depthWrite={false}
              opacity={glyphOpacity(tilt.id)}
              transparent
            />
          </mesh>
          {([-1, 1] as const).map((direction) => (
            <mesh
              key={direction}
              name={`Tilt ${direction > 0 ? "positive" : "negative"} arrowhead`}
              position={[
                0,
                direction * C_ARM_CUE_GEOMETRY.linear.arrowOffset,
                0,
              ]}
              renderOrder={OVERLAY_RENDER_ORDER + 1}
              rotation={direction > 0 ? [0, 0, 0] : [0, 0, Math.PI]}
            >
              <coneGeometry
                args={[
                  C_ARM_CUE_GEOMETRY.linear.arrowRadius,
                  C_ARM_CUE_GEOMETRY.linear.arrowHeight,
                  10,
                ]}
              />
              <meshBasicMaterial
                color={tilt.color}
                depthTest={false}
                depthWrite={false}
                opacity={glyphOpacity(tilt.id)}
                transparent
              />
            </mesh>
          ))}
        </group>
      </group>

      <group
        name="Translation cue"
        position={model.groups[2]!.position}
        ref={translationRef}
      >
        {translationDefinitions.map((definition) => (
          <group key={definition.id}>
            {C_ARM_CUE_HIT_TARGET_LAYOUT.translation
              .filter((target) => target.controlId === definition.id)
              .map((target, index) => (
                <mesh
                  key={index}
                  name={`${definition.id} hit target`}
                  position={target.position}
                  raycast={translationHitTargetRaycast}
                  ref={(mesh) => setTranslationHitTargetRef(target.id, mesh)}
                  renderOrder={OVERLAY_RENDER_ORDER + 3}
                  userData={{ cArmCueHitTargetId: target.id }}
                  {...handlersFor(definition)}
                >
                  <sphereGeometry args={[target.radius, 10, 10]} />
                  <meshBasicMaterial
                    depthTest={false}
                    depthWrite={false}
                    opacity={0}
                    transparent
                  />
                </mesh>
              ))}
            <group
              rotation={
                AXIS_ROTATIONS[definition.id as keyof typeof AXIS_ROTATIONS]
              }
            >
              <mesh
                name={`${definition.id} glyph`}
                renderOrder={OVERLAY_RENDER_ORDER + 3}
              >
                <capsuleGeometry
                  args={[
                    C_ARM_CUE_GEOMETRY.linear.glyphRadius,
                    C_ARM_CUE_GEOMETRY.linear.glyphLength,
                    5,
                    10,
                  ]}
                />
                <meshBasicMaterial
                  color={definition.color}
                  depthTest={false}
                  depthWrite={false}
                  opacity={glyphOpacity(definition.id)}
                  transparent
                />
              </mesh>
              {([-1, 1] as const).map((direction) => (
                <mesh
                  key={direction}
                  name={`${definition.id} ${direction > 0 ? "positive" : "negative"} arrowhead`}
                  position={[
                    0,
                    direction * C_ARM_CUE_GEOMETRY.linear.arrowOffset,
                    0,
                  ]}
                  renderOrder={OVERLAY_RENDER_ORDER + 3}
                  rotation={[0, 0, direction > 0 ? 0 : Math.PI]}
                >
                  <coneGeometry
                    args={[
                      C_ARM_CUE_GEOMETRY.linear.arrowRadius,
                      C_ARM_CUE_GEOMETRY.linear.arrowHeight,
                      10,
                    ]}
                  />
                  <meshBasicMaterial
                    color={definition.color}
                    depthTest={false}
                    depthWrite={false}
                    opacity={glyphOpacity(definition.id)}
                    transparent
                  />
                </mesh>
              ))}
            </group>
          </group>
        ))}
      </group>

      <group
        name="Wig-wag cue"
        position={model.groups[1]!.position}
        ref={swivelRef}
      >
        <mesh
          name="Swivel hit target"
          raycast={swivelRaycast}
          renderOrder={OVERLAY_RENDER_ORDER}
          {...handlersFor(swivel)}
        >
          <circleGeometry args={[C_ARM_CUE_GEOMETRY.circular.hitRadius, 32]} />
          <meshBasicMaterial
            depthTest={false}
            depthWrite={false}
            transparent
            opacity={0}
          />
        </mesh>
        <group>
          <mesh name="Swivel glyph" renderOrder={OVERLAY_RENDER_ORDER}>
            <torusGeometry
              args={[
                C_ARM_CUE_GEOMETRY.circular.glyphRadius,
                C_ARM_CUE_GEOMETRY.circular.glyphTube,
                10,
                32,
              ]}
            />
            <meshBasicMaterial
              color={swivel.color}
              depthTest={false}
              depthWrite={false}
              transparent
              opacity={glyphOpacity(swivel.id)}
            />
          </mesh>
          {([-1, 1] as const).map((direction) => (
            <mesh
              key={direction}
              name={`Swivel ${direction > 0 ? "clockwise" : "counterclockwise"} arrowhead`}
              position={[
                0,
                direction * C_ARM_CUE_GEOMETRY.circular.glyphRadius,
                0,
              ]}
              renderOrder={OVERLAY_RENDER_ORDER}
              rotation={[0, 0, (direction * Math.PI) / 2]}
            >
              <coneGeometry
                args={[
                  C_ARM_CUE_GEOMETRY.circular.arrowRadius,
                  C_ARM_CUE_GEOMETRY.circular.arrowHeight,
                  10,
                ]}
              />
              <meshBasicMaterial
                color={swivel.color}
                depthTest={false}
                depthWrite={false}
                transparent
                opacity={glyphOpacity(swivel.id)}
              />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}
