"use client";

import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Html } from "@react-three/drei/web/Html";
import { useRef, useState, type ComponentRef } from "react";
import type { Group } from "three";
import {
  useAnatomyAsset,
  type AnatomyAssetStatus,
  type RegionalAnatomyAssetStatus,
} from "../../anatomy/AnatomyAssetProvider";
import type { AnatomyPresentationMode } from "../../anatomy/anatomyTypes";
import {
  useSimulationStore,
  type InteractionMode,
} from "../../state/simulationStore";
import { CArmRig } from "./CArmRig";
import type { CArmCueId } from "./cArmCueHints";
import { FullBodyAnatomy } from "./FullBodyAnatomy";
import { RegionalAnatomy } from "./RegionalAnatomy";
import { AnatomyCameraFit } from "./anatomyCameraFit";
import { PatientRootManipulator } from "./PatientRootManipulator";

export const THEATRE_BACKGROUND_COLOR = "#07131f";
export const DEFAULT_THEATRE_TARGET = [0, -200, 0] satisfies [
  number,
  number,
  number,
];
const BACKGROUND_COLOR = [THEATRE_BACKGROUND_COLOR] as const;
const FLOOR_POSITION = [0, -700, 0] as const;
const FLOOR_ROTATION = [-Math.PI / 2, 0, 0] as const;
export const OPERATING_TABLE_TOP_SIZE_MM = [550, 50, 2100] as const;
export const OPERATING_TABLE_TOP_POSITION_MM = [0, -85, 0] as const;

export function orbitControlsEnabled(
  interactionMode: InteractionMode,
  cArmManipulatorActive: boolean,
  patientManipulatorActive = false,
): boolean {
  return !cArmManipulatorActive && !patientManipulatorActive;
}

function OperatingTable() {
  return (
    <mesh position={OPERATING_TABLE_TOP_POSITION_MM} receiveShadow>
      <boxGeometry args={OPERATING_TABLE_TOP_SIZE_MM} />
      <meshStandardMaterial
        color="#344a59"
        metalness={0.18}
        roughness={0.72}
      />
    </mesh>
  );
}

export function anatomyFallbackLabel(
  status: Exclude<AnatomyAssetStatus, "ready">,
): string {
  return status === "loading" ? "Anatomy loading" : "Anatomy unavailable";
}

export function AnatomyFallbackNotice({
  onRetry,
  status,
}: {
  onRetry: () => void;
  status: Exclude<AnatomyAssetStatus, "ready">;
}) {
  const label = anatomyFallbackLabel(status);
  return (
    <div
      className="anatomical-placeholder__label"
      role={status === "error" ? "alert" : "status"}
    >
      <span>{label}</span>
      {status === "error" ? (
        <button onClick={onRetry} type="button">
          Retry anatomy
        </button>
      ) : null}
    </div>
  );
}

function AnatomyFallback({
  onRetry,
  status,
}: {
  onRetry: () => void;
  status: Exclude<AnatomyAssetStatus, "ready">;
}) {
  const label = anatomyFallbackLabel(status);
  return (
    <group name={label}>
      <mesh position={[0, -180, 0]}>
        <icosahedronGeometry args={[70, 1]} />
        <meshBasicMaterial
          color="#9cb5c6"
          opacity={0.32}
          transparent
          wireframe
        />
      </mesh>
      <Html center position={[0, -70, 0]}>
        <AnatomyFallbackNotice onRetry={onRetry} status={status} />
      </Html>
    </group>
  );
}

export function HipAnatomyLayer() {
  const anatomy = useAnatomyAsset();
  const anatomyPresentationMode = useSimulationStore(
    (state) => state.anatomyPresentationMode,
  );
  if (anatomy.status === "ready" && anatomy.resource !== null) {
    const composition = anatomyLayerComposition(
      anatomyPresentationMode,
      anatomy.regional.status,
    );
    return (
      <>
        {composition.showSkeleton ? (
          <FullBodyAnatomy
            complement={
              anatomy.fullBodyComplement.status === "ready"
                ? anatomy.fullBodyComplement.resource
                : null
            }
            hip={anatomy.resource}
          />
        ) : null}
        {composition.showRegional && anatomy.regional.resource !== null ? (
          <RegionalAnatomy resource={anatomy.regional.resource} />
        ) : null}
      </>
    );
  }
  return (
    <AnatomyFallback
      onRetry={anatomy.retry}
      status={anatomy.status === "error" ? "error" : "loading"}
    />
  );
}

export function anatomyLayerComposition(
  mode: AnatomyPresentationMode,
  regionalStatus: RegionalAnatomyAssetStatus,
): { showSkeleton: true; showRegional: boolean } {
  return {
    showRegional: mode === "full-regional" && regionalStatus === "ready",
    showSkeleton: true,
  };
}

interface TheatreSceneProps {
  consumeFitAnatomyRevision: (revision: number) => boolean;
  onManipulatorHintChange?: (id: CArmCueId | null) => void;
}

const ignoreManipulatorHint = () => undefined;

export function TheatreScene({
  consumeFitAnatomyRevision,
  onManipulatorHintChange = ignoreManipulatorHint,
}: TheatreSceneProps) {
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const [cArmManipulatorActive, setCArmManipulatorActive] = useState(false);
  const [patientManipulatorActive, setPatientManipulatorActive] =
    useState(false);
  const anatomyRootRef = useRef<Group>(null);
  const orbitControlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  return (
    <>
      <color args={BACKGROUND_COLOR} attach="background" />
      <ambientLight intensity={0.75} />
      <directionalLight
        castShadow
        intensity={1.6}
        position={[700, 1000, 600]}
      />
      <mesh position={FLOOR_POSITION} receiveShadow rotation={FLOOR_ROTATION}>
        <planeGeometry args={[4200, 4200]} />
        <meshStandardMaterial color="#142a38" roughness={0.92} />
      </mesh>
      <OperatingTable />
      <group ref={anatomyRootRef}>
        <HipAnatomyLayer />
      </group>
      <CArmRig
        onManipulatorDragStateChange={setCArmManipulatorActive}
        onManipulatorHintChange={onManipulatorHintChange}
      />
      <PatientRootManipulator
        onDragStateChange={setPatientManipulatorActive}
      />
      <AnatomyCameraFit
        anatomyRootRef={anatomyRootRef}
        consumeFitAnatomyRevision={consumeFitAnatomyRevision}
        controlsRef={orbitControlsRef}
      />
      <OrbitControls
        enabled={orbitControlsEnabled(
          interactionMode,
          cArmManipulatorActive,
          patientManipulatorActive,
        )}
        enableDamping
        maxDistance={3600}
        minDistance={650}
        ref={orbitControlsRef}
        target={DEFAULT_THEATRE_TARGET}
      />
    </>
  );
}
