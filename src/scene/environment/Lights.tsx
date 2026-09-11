import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { DirectionalLight, Vector3 } from 'three';
import { PALETTE } from '../../lib/constants';
import { STAGE_FRAME, stageToWorld } from '../../lib/stageFrame';
import { isCockpitScene, useApp } from '../../state/store';

/**
 * Scene lighting. The star itself carries a point light for the orbital bodies; this
 * component adds the surface key light (shadow-casting, aligned star → stage), a faint
 * cool rim from the opposite side, and a very low hemisphere fill.
 */
export function Lights() {
  const keyRef = useRef<DirectionalLight>(null);
  const rimRef = useRef<DirectionalLight>(null);
  const fillRef = useRef<DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const quality = useApp((s) => s.quality);
  const appScene = useApp((s) => s.scene);
  // Inside the cockpit the room is lit by its own practicals; the exterior key would
  // otherwise wash the interior to a flat warm grey.
  const interior = isCockpitScene(appScene);
  // Inside, the star reaches the cabin only through the forward window, so the exterior key
  // is a shaft rather than a room light. At 0.22 it was still lifting every wall to a flat
  // warm grey and cancelling the practicals it was supposed to sit behind.
  const k = interior ? 0.09 : 1;

  useEffect(() => {
    const key = keyRef.current;
    const rim = rimRef.current;
    const fill = fillRef.current;
    if (!key || !rim || !fill) return;
    // Light travels from the star toward the stage; place the light "at the star side".
    const stageCenter = stageToWorld([0.5, 0, -4]);
    const toStar = new Vector3(0, 0, 0).sub(stageCenter).normalize();
    key.position.copy(stageCenter).addScaledVector(toStar, 60);
    key.target.position.copy(stageCenter);
    scene.add(key.target);
    // Rim comes from behind-left of the camera, low and cool.
    const rimDir = STAGE_FRAME.forward.clone().negate().addScaledVector(STAGE_FRAME.right, -0.8).addScaledVector(STAGE_FRAME.up, 0.6).normalize();
    rim.position.copy(stageCenter).addScaledVector(rimDir, 40);
    rim.target.position.copy(stageCenter);
    scene.add(rim.target);
    // Warm bounce from the lit ground behind the camera so suits and hulls read as white.
    const fillDir = STAGE_FRAME.forward.clone().negate().addScaledVector(STAGE_FRAME.right, 0.35).addScaledVector(STAGE_FRAME.up, 0.55).normalize();
    fill.position.copy(stageCenter).addScaledVector(fillDir, 40);
    fill.target.position.copy(stageCenter);
    scene.add(fill.target);
    return () => {
      scene.remove(key.target);
      scene.remove(rim.target);
      scene.remove(fill.target);
    };
  }, [scene]);

  return (
    <>
      {/* Low ambient: planets need a visible shadow side, not a flat fill. */}
      <hemisphereLight args={['#1a2540', '#2a2118', interior ? 0.05 : 0.16]} />
      <directionalLight
        ref={keyRef}
        color={PALETTE.keyLight}
        intensity={2.4 * k}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-near={5}
        shadow-camera-far={140}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />
      <directionalLight ref={rimRef} color={PALETTE.rimCool} intensity={0.22 * k} />
      {/* Warm bounce from behind the camera. Held well under the key so the lit face of
          an object is always the face the star is on. */}
      <directionalLight ref={fillRef} color="#ffd2a8" intensity={0.42 * k} />
    </>
  );
}
