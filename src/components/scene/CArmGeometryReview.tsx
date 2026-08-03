"use client";

import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { REFERENCE_C_ARM_POSE } from "../../engine/geometry/geometryTypes";
import { CArmRig } from "./CArmRig";

export type CArmReviewView = "side" | "detector" | "oblique";

export const C_ARM_REVIEW_CAMERAS = Object.freeze({
  side: Object.freeze({ position: [0, 0, 1600], target: [0, 0, 0] }),
  detector: Object.freeze({ position: [0, -1600, 0], target: [0, 0, 0] }),
  oblique: Object.freeze({ position: [1100, 650, 1100], target: [0, 0, 0] }),
} as const);

export function reviewCamera(view: CArmReviewView) {
  return C_ARM_REVIEW_CAMERAS[view];
}

function ReviewCamera({ view }: { view: CArmReviewView }) {
  const camera = useThree((state) => state.camera);
  const { position, target } = reviewCamera(view);

  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, position, target]);

  return <OrbitControls enableDamping target={target} />;
}

interface CArmGeometryReviewProps {
  view: CArmReviewView;
}

export function CArmGeometryReview({ view }: CArmGeometryReviewProps) {
  return (
    <Canvas
      camera={{ far: 8000, fov: 42, near: 1, position: reviewCamera(view).position }}
      className="c-arm-review__canvas"
    >
      <ReviewCamera view={view} />
      <color args={["#07131f"]} attach="background" />
      <ambientLight intensity={0.75} />
      <directionalLight intensity={1.6} position={[700, 1000, 600]} />
      <CArmRig
        modeOverride="isocentric"
        poseOverride={REFERENCE_C_ARM_POSE}
        showBeamOverride={false}
        showManipulators={false}
      />
    </Canvas>
  );
}
