"use client";

import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Html } from "@react-three/drei/web/Html";
import { useMemo } from "react";
import { MathUtils } from "three";
import { useSimulationStore } from "../../state/simulationStore";
import { CArmRig } from "./CArmRig";

const BACKGROUND_COLOR = ["#07131f"] as const;
const FLOOR_POSITION = [0, -700, 0] as const;
const FLOOR_ROTATION = [-Math.PI / 2, 0, 0] as const;

function OperatingTable() {
  return (
    <group>
      <mesh position={[0, -100, 0]} receiveShadow>
        <boxGeometry args={[650, 80, 1500]} />
        <meshStandardMaterial
          color="#344a59"
          metalness={0.18}
          roughness={0.72}
        />
      </mesh>
      <mesh position={[0, -390, 0]} receiveShadow>
        <boxGeometry args={[170, 500, 500]} />
        <meshStandardMaterial
          color="#223746"
          metalness={0.45}
          roughness={0.52}
        />
      </mesh>
    </group>
  );
}

function AnatomicalPlaceholder() {
  const objectPose = useSimulationStore((state) => state.objectPose);
  const rotation = useMemo(
    () =>
      objectPose.rotationDegrees.map((degrees) =>
        MathUtils.degToRad(degrees),
      ) as [number, number, number],
    [objectPose.rotationDegrees],
  );

  return (
    <group position={objectPose.position} rotation={rotation}>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[62, 48, 520, 24]} />
        <meshStandardMaterial color="#e1b18d" roughness={0.82} />
      </mesh>
      <Html center pointerEvents="none" position={[0, 95, 0]}>
        <span className="anatomical-placeholder__label">
          Anatomical placeholder
        </span>
      </Html>
    </group>
  );
}

export function TheatreScene() {
  const interactionMode = useSimulationStore((state) => state.interactionMode);

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
      <AnatomicalPlaceholder />
      <CArmRig />
      <OrbitControls
        enabled={interactionMode === "inspect"}
        enableDamping
        maxDistance={3600}
        minDistance={650}
        target={[0, -80, 0]}
      />
    </>
  );
}
