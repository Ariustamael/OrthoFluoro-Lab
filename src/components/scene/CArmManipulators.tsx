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

export function cArmDragEndPolicy(reason: CArmDragEndReason) {
  return {
    clearHint: true,
    restoreStartPose: reason === "escape",
  } as const;
}

export const C_ARM_CUE_DIMENSIONS = Object.freeze({
  orbit: Object.freeze({
    glyphMaximumExtent: 0.36,
    hitShape: "filled-disc",
    targetMinimumExtent: 1,
  }),
  tilt: Object.freeze({
    glyphMaximumExtent: 0.43,
    hitShape: "capsule",
    targetMinimumExtent: 1.04,
  }),
  "translate-x": Object.freeze({
    glyphMaximumExtent: 0.43,
    hitShape: "capsule",
    targetMinimumExtent: 1.04,
  }),
  "translate-y": Object.freeze({
    glyphMaximumExtent: 0.43,
    hitShape: "capsule",
    targetMinimumExtent: 1.04,
  }),
  "translate-z": Object.freeze({
    glyphMaximumExtent: 0.43,
    hitShape: "capsule",
    targetMinimumExtent: 1.04,
  }),
  swivel: Object.freeze({
    glyphMaximumExtent: 0.36,
    hitShape: "filled-disc",
    targetMinimumExtent: 1,
  }),
} as const);

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

interface ActiveDrag {
  readonly captureTarget: PointerCaptureTarget;
  readonly center?: ScreenPoint;
  readonly definition: CArmManipulatorControlDefinition;
  readonly pointerId: number;
  readonly screenTangent?: ScreenPoint;
  readonly startPointer: ScreenPoint;
  readonly startPose: CArmPose;
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
const CIRCULAR_HIT_RADIUS = 0.5;
const CIRCULAR_GLYPH_RADIUS = 0.15;
const CIRCULAR_GLYPH_TUBE = 0.03;
const LINEAR_HIT_RADIUS = 0.22;
const LINEAR_HIT_LENGTH = 0.6;
const LINEAR_GLYPH_RADIUS = 0.035;
const LINEAR_GLYPH_LENGTH = 0.27;
const LINEAR_ARROW_OFFSET = 0.18;
const LINEAR_ARROW_RADIUS = 0.03;
const LINEAR_ARROW_HEIGHT = 0.07;
const CIRCULAR_ARROW_RADIUS = 0.03;
const CIRCULAR_ARROW_HEIGHT = 0.08;

const AXIS_ROTATIONS = {
  "translate-x": [0, 0, -Math.PI / 2],
  "translate-y": [0, 0, 0],
  "translate-z": [Math.PI / 2, 0, 0],
} as const;

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
  const dragRef = useRef<ActiveDrag | null>(null);
  const [activeId, setActiveId] = useState<CArmCueId | null>(null);
  const [hoveredId, setHoveredId] = useState<CArmCueId | null>(null);
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

  const finishActiveDrag = useCallback(
    (
      pointerId?: number,
      releaseCapture = true,
      reason: CArmDragEndReason = "pointer-up",
    ) => {
      const drag = dragRef.current;
      if (
        drag === null ||
        (pointerId !== undefined && drag.pointerId !== pointerId)
      ) {
        return;
      }
      const policy = cArmDragEndPolicy(reason);
      if (releaseCapture) {
        releaseHandlePointer(drag.captureTarget, drag.pointerId);
      }
      dragRef.current = null;
      setActiveId(null);
      onDragStateChange(false);
      if (policy.clearHint) onHintChange(null);
    },
    [onDragStateChange, onHintChange],
  );

  useEffect(() => {
    const handleWindowBlur = () => finishActiveDrag(undefined, true, "blur");
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      finishActiveDrag(undefined, true, "mode-exit");
    };
  }, [finishActiveDrag]);

  useEffect(() => {
    if (interactionMode !== "move-carm") {
      finishActiveDrag(undefined, true, "mode-exit");
    }
    if (interactionMode !== "move-carm") {
      setHoveredId(null);
      setActiveId(null);
      onHintChange(null);
    }
  }, [finishActiveDrag, interactionMode, onHintChange]);

  useEffect(() => {
    const cancelActiveDrag = (event: KeyboardEvent) => {
      const drag = dragRef.current;
      if (!isCArmCancelKey(event.key) || drag === null) return;
      event.preventDefault();
      const policy = cArmDragEndPolicy("escape");
      if (policy.restoreStartPose) setCArmPose(drag.startPose);
      releaseHandlePointer(drag.captureTarget, drag.pointerId);
      dragRef.current = null;
      setActiveId(null);
      onDragStateChange(false);
      if (policy.clearHint) onHintChange(null);
    };
    window.addEventListener("keydown", cancelActiveDrag);
    return () => window.removeEventListener("keydown", cancelActiveDrag);
  }, [onDragStateChange, onHintChange, setCArmPose]);

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
      captureHandlePointer(captureTarget, event.pointerId);
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
        screenTangent = projectWorldAxisToScreen(axis, camera, size, origin);
      }

      dragRef.current = {
        captureTarget,
        center,
        definition,
        pointerId: event.pointerId,
        screenTangent,
        startPointer,
        startPose: { ...useSimulationStore.getState().cArmPose },
      };
      setActiveId(definition.id);
      onHintChange(definition.id);
      onDragStateChange(true);
    },
    [camera, finishActiveDrag, model, onDragStateChange, onHintChange, size],
  );

  const moveDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const current: ScreenPoint = [event.clientX, event.clientY];
      const rawDelta =
        drag.definition.id === "swivel"
          ? signedScreenAngle(drag.center!, drag.startPointer, current)
          : screenTangentDelta(
              drag.startPointer,
              current,
              drag.screenTangent!,
            ) *
            (drag.definition.kind === "rotation"
              ? ROTATION_DEGREES_PER_PIXEL
              : TRANSLATION_MM_PER_PIXEL);
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
      if (dragRef.current?.pointerId !== event.pointerId) return;
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
      if (dragRef.current?.pointerId !== event.pointerId) return;
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
      if (dragRef.current === null) onHintChange(null);
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredId(definition.id);
      if (dragRef.current === null) onHintChange(definition.id);
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
          renderOrder={OVERLAY_RENDER_ORDER + 1}
          {...handlersFor(orbit)}
        >
          <circleGeometry args={[CIRCULAR_HIT_RADIUS, 32]} />
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
              args={[CIRCULAR_GLYPH_RADIUS, CIRCULAR_GLYPH_TUBE, 10, 32]}
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
              position={[0, direction * CIRCULAR_GLYPH_RADIUS, 0]}
              renderOrder={OVERLAY_RENDER_ORDER + 1}
              rotation={[0, 0, (direction * Math.PI) / 2]}
            >
              <coneGeometry
                args={[CIRCULAR_ARROW_RADIUS, CIRCULAR_ARROW_HEIGHT, 10]}
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
        <mesh
          name="Tilt hit target"
          position={[0.78, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER + 1}
          {...handlersFor(tilt)}
        >
          <capsuleGeometry
            args={[LINEAR_HIT_RADIUS, LINEAR_HIT_LENGTH, 5, 10]}
          />
          <meshBasicMaterial
            depthTest={false}
            depthWrite={false}
            opacity={0}
            transparent
          />
        </mesh>
        <group position={[0.78, 0, 0]}>
          <mesh name="Tilt glyph" renderOrder={OVERLAY_RENDER_ORDER + 1}>
            <capsuleGeometry
              args={[LINEAR_GLYPH_RADIUS, LINEAR_GLYPH_LENGTH, 5, 10]}
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
              position={[0, direction * LINEAR_ARROW_OFFSET, 0]}
              renderOrder={OVERLAY_RENDER_ORDER + 1}
              rotation={direction > 0 ? [0, 0, 0] : [0, 0, Math.PI]}
            >
              <coneGeometry
                args={[LINEAR_ARROW_RADIUS, LINEAR_ARROW_HEIGHT, 10]}
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
          <group
            key={definition.id}
            rotation={
              AXIS_ROTATIONS[definition.id as keyof typeof AXIS_ROTATIONS]
            }
          >
            <mesh
              name={`${definition.id} hit target`}
              renderOrder={OVERLAY_RENDER_ORDER + 3}
              {...handlersFor(definition)}
            >
              <capsuleGeometry
                args={[LINEAR_HIT_RADIUS, LINEAR_HIT_LENGTH, 5, 10]}
              />
              <meshBasicMaterial
                depthTest={false}
                depthWrite={false}
                opacity={0}
                transparent
              />
            </mesh>
            <group>
              <mesh
                name={`${definition.id} glyph`}
                renderOrder={OVERLAY_RENDER_ORDER + 3}
              >
                <capsuleGeometry
                  args={[LINEAR_GLYPH_RADIUS, LINEAR_GLYPH_LENGTH, 5, 10]}
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
                  position={[0, direction * LINEAR_ARROW_OFFSET, 0]}
                  renderOrder={OVERLAY_RENDER_ORDER + 3}
                  rotation={[0, 0, direction > 0 ? 0 : Math.PI]}
                >
                  <coneGeometry
                    args={[LINEAR_ARROW_RADIUS, LINEAR_ARROW_HEIGHT, 10]}
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
          <circleGeometry args={[CIRCULAR_HIT_RADIUS, 32]} />
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
              args={[CIRCULAR_GLYPH_RADIUS, CIRCULAR_GLYPH_TUBE, 10, 32]}
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
              position={[0, direction * CIRCULAR_GLYPH_RADIUS, 0]}
              renderOrder={OVERLAY_RENDER_ORDER}
              rotation={[0, 0, (direction * Math.PI) / 2]}
            >
              <coneGeometry
                args={[CIRCULAR_ARROW_RADIUS, CIRCULAR_ARROW_HEIGHT, 10]}
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
