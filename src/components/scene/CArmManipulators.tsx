"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Group,
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

type ManipulatorKind = "rotation" | "translation";
type ManipulatorId =
  "orbit" | "tilt" | "translate-x" | "translate-y" | "translate-z" | "swivel";

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

type ManipulatorGroupName =
  "Floating orbit and tilt handle" | "Translation handle" | "Swivel ring";

interface ManipulatorGroupModel {
  readonly name: ManipulatorGroupName;
  readonly position: Vec3;
}

export interface CArmManipulatorRenderModel {
  readonly floatingLocalRadius: number;
  readonly floatingOrbitTangent: Vec3;
  readonly floatingTiltAxis: Vec3;
  readonly groups: readonly ManipulatorGroupModel[];
}

const tuple = (vector: Vector3): Vec3 =>
  [vector.x, vector.y, vector.z] as const;

export function createCArmManipulatorRenderModel(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  geometry: CArmGeometry,
  interactionMode: InteractionMode,
): CArmManipulatorRenderModel {
  const polarAngle = (135 * Math.PI) / 180;
  const floatingLocalRadius =
    local.arcRadius + preset.arcRadialThickness / 2 + 55;
  const rigQuaternion = new Quaternion(...geometry.rigTransform.quaternion);
  const rigPosition = new Vector3(...geometry.rigTransform.position);
  const floatingPosition = new Vector3(
    floatingLocalRadius * Math.cos(polarAngle),
    floatingLocalRadius * Math.sin(polarAngle),
    0,
  )
    .applyQuaternion(rigQuaternion)
    .add(rigPosition);
  const floatingOrbitTangent = new Vector3(
    -Math.sin(polarAngle),
    Math.cos(polarAngle),
    0,
  ).applyQuaternion(rigQuaternion);
  const floatingTiltAxis = new Vector3(0, 0, 1).applyQuaternion(rigQuaternion);
  const groups: ManipulatorGroupModel[] =
    interactionMode === "move-carm"
      ? [
          {
            name: "Floating orbit and tilt handle",
            position: tuple(floatingPosition),
          },
          { name: "Translation handle", position: geometry.referenceCentre },
          { name: "Swivel ring", position: geometry.mechanicalPivot },
        ]
      : [];

  return Object.freeze({
    floatingLocalRadius,
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
  preset: CArmRigPreset;
}

const ROTATION_DEGREES_PER_PIXEL = 0.4;
const TRANSLATION_MM_PER_PIXEL = 1.5;
const FLOATING_TARGET_PIXELS = 104;
const TRANSLATION_TARGET_PIXELS = 118;
const SWIVEL_TARGET_PIXELS = 146;
const OVERLAY_RENDER_ORDER = 1200;

const AXIS_ROTATIONS = {
  "translate-x": [0, 0, -Math.PI / 2],
  "translate-y": [0, 0, 0],
  "translate-z": [Math.PI / 2, 0, 0],
} as const;

export function CArmManipulators({
  geometry,
  local,
  onDragStateChange,
  preset,
}: CArmManipulatorsProps) {
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const setCArmParameter = useSimulationStore(
    (state) => state.setCArmParameter,
  );
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const floatingRef = useRef<Group>(null);
  const translationRef = useRef<Group>(null);
  const swivelRef = useRef<Group>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
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
      if (
        translation !== null &&
        rayPassesWithinWorldRadius(
          raycaster,
          geometry.referenceCentre,
          translation.scale.x * 0.95,
        )
      ) {
        return;
      }
      Mesh.prototype.raycast.call(this, raycaster, intersections);
    },
    [geometry.referenceCentre],
  );

  const finishActiveDrag = useCallback(
    (pointerId?: number, releaseCapture = true) => {
      const drag = dragRef.current;
      if (
        drag === null ||
        (pointerId !== undefined && drag.pointerId !== pointerId)
      ) {
        return;
      }
      if (releaseCapture) {
        releaseHandlePointer(drag.captureTarget, drag.pointerId);
      }
      dragRef.current = null;
      onDragStateChange(false);
    },
    [onDragStateChange],
  );

  useEffect(() => {
    const handleWindowBlur = () => finishActiveDrag();
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      finishActiveDrag();
    };
  }, [finishActiveDrag]);

  useEffect(() => {
    if (interactionMode !== "move-carm") finishActiveDrag();
  }, [finishActiveDrag, interactionMode]);

  useFrame(() => {
    const floating = floatingRef.current;
    const translation = translationRef.current;
    const swivel = swivelRef.current;
    const floatingPosition = model.groups[0]?.position;
    const translationPosition = model.groups[1]?.position;
    const swivelPosition = model.groups[2]?.position;

    if (floating !== null && floatingPosition !== undefined) {
      floating.scale.setScalar(
        constantScreenScale(
          floatingPosition,
          camera,
          size.height,
          FLOATING_TARGET_PIXELS,
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
          TRANSLATION_TARGET_PIXELS,
        ),
      );
    }
    if (swivel !== null && swivelPosition !== undefined) {
      swivel.scale.setScalar(
        constantScreenScale(
          swivelPosition,
          camera,
          size.height,
          SWIVEL_TARGET_PIXELS,
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
          geometry.mechanicalPivot,
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
            ? geometry.referenceCentre
            : model.groups[0]!.position;
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
      onDragStateChange(true);
    },
    [camera, finishActiveDrag, geometry, model, onDragStateChange, size],
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
      finishActiveDrag(event.pointerId);
    },
    [finishActiveDrag],
  );

  const loseCapture = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      finishActiveDrag(event.pointerId, false);
    },
    [finishActiveDrag],
  );

  const handlersFor = (definition: CArmManipulatorControlDefinition) => ({
    onLostPointerCapture: loseCapture,
    onPointerCancel: endDrag,
    onPointerDown: (event: ThreeEvent<PointerEvent>) =>
      beginDrag(definition, event),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
  });

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
        name="Floating orbit and tilt handle"
        position={model.groups[0]!.position}
        ref={floatingRef}
      >
        <mesh
          name="Orbit drag target"
          renderOrder={OVERLAY_RENDER_ORDER + 1}
          {...handlersFor(orbit)}
        >
          <torusGeometry args={[0.54, 0.075, 12, 44]} />
          <meshBasicMaterial
            color={orbit.color}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh
          name="Orbit clockwise arrowhead"
          position={[0, 0.54, 0]}
          renderOrder={OVERLAY_RENDER_ORDER + 1}
          rotation={[0, 0, Math.PI / 2]}
          {...handlersFor(orbit)}
        >
          <coneGeometry args={[0.13, 0.3, 10]} />
          <meshBasicMaterial
            color={orbit.color}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh
          name="Orbit counterclockwise arrowhead"
          position={[0, -0.54, 0]}
          renderOrder={OVERLAY_RENDER_ORDER + 1}
          rotation={[0, 0, -Math.PI / 2]}
          {...handlersFor(orbit)}
        >
          <coneGeometry args={[0.13, 0.3, 10]} />
          <meshBasicMaterial
            color={orbit.color}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh
          name="Cranial caudal drag target"
          position={[0.78, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER + 1}
          {...handlersFor(tilt)}
        >
          <capsuleGeometry args={[0.11, 0.55, 5, 10]} />
          <meshBasicMaterial
            color={tilt.color}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        {([-1, 1] as const).map((direction) => (
          <mesh
            key={direction}
            name={`Cranial caudal ${direction > 0 ? "positive" : "negative"} arrowhead`}
            position={[0.78, direction * 0.48, 0]}
            renderOrder={OVERLAY_RENDER_ORDER + 1}
            rotation={direction > 0 ? [0, 0, 0] : [0, 0, Math.PI]}
            {...handlersFor(tilt)}
          >
            <coneGeometry args={[0.13, 0.3, 10]} />
            <meshBasicMaterial
              color={tilt.color}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      <group
        name="Translation handle"
        position={model.groups[1]!.position}
        ref={translationRef}
      >
        {translationDefinitions.map((definition) => (
          <group
            key={definition.id}
            rotation={
              AXIS_ROTATIONS[definition.id as keyof typeof AXIS_ROTATIONS]
            }
            {...handlersFor(definition)}
          >
            {([-1, 1] as const).map((direction) => (
              <mesh
                key={direction}
                name={`${definition.id} ${direction > 0 ? "positive" : "negative"} hit target`}
                position={[0, direction * 0.4, 0]}
                renderOrder={OVERLAY_RENDER_ORDER + 3}
              >
                <cylinderGeometry args={[0.09, 0.09, 0.42, 12]} />
                <meshBasicMaterial
                  color={definition.color}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            ))}
            <mesh
              position={[0, 0.72, 0]}
              renderOrder={OVERLAY_RENDER_ORDER + 3}
            >
              <coneGeometry args={[0.19, 0.32, 12]} />
              <meshBasicMaterial
                color={definition.color}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            <mesh
              position={[0, -0.72, 0]}
              renderOrder={OVERLAY_RENDER_ORDER + 3}
              rotation={[0, 0, Math.PI]}
            >
              <coneGeometry args={[0.19, 0.32, 12]} />
              <meshBasicMaterial
                color={definition.color}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        ))}
      </group>

      <group
        name="Swivel ring"
        position={model.groups[2]!.position}
        ref={swivelRef}
      >
        <mesh
          name="Swivel drag target"
          raycast={swivelRaycast}
          renderOrder={OVERLAY_RENDER_ORDER}
          {...handlersFor(swivel)}
        >
          <torusGeometry args={[1.08, 0.07, 12, 56]} />
          <meshBasicMaterial
            color={swivel.color}
            depthTest={false}
            depthWrite={false}
            transparent
            opacity={0.9}
          />
        </mesh>
        <mesh
          name="Swivel clockwise arrowhead"
          position={[0, 1.08, 0]}
          raycast={swivelRaycast}
          renderOrder={OVERLAY_RENDER_ORDER}
          rotation={[0, 0, Math.PI / 2]}
          {...handlersFor(swivel)}
        >
          <coneGeometry args={[0.13, 0.3, 10]} />
          <meshBasicMaterial
            color={swivel.color}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh
          name="Swivel counterclockwise arrowhead"
          position={[0, -1.08, 0]}
          raycast={swivelRaycast}
          renderOrder={OVERLAY_RENDER_ORDER}
          rotation={[0, 0, -Math.PI / 2]}
          {...handlersFor(swivel)}
        >
          <coneGeometry args={[0.13, 0.3, 10]} />
          <meshBasicMaterial
            color={swivel.color}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}
