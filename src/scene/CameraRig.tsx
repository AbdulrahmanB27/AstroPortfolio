import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { live, rig } from './rig';
import { useApp } from '../state/store';

const tmpTarget = new Vector3();
const tmpPos = new Vector3();

/**
 * Copies the mutable rig onto the real camera each frame and adds idle sway / shake.
 * Sequences tween `rig` directly; nothing here re-renders React.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const reduced = useApp((s) => s.reducedMotion);
  const t = useRef(0);

  const scene = useThree((s) => s.scene);

  useEffect(() => {
    camera.near = 0.2;
    camera.far = 20000;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    live.camera = camera;
    live.scene = scene;
    return () => {
      delete live.camera;
      delete live.scene;
    };
  }, [camera, scene]);

  useFrame((_, delta) => {
    t.current += delta;
    const sway = reduced ? 0 : rig.sway;
    // Gentle figure-eight drift, ±0.4° at full sway (see motion table).
    const swayX = Math.sin(t.current * 0.7) * 0.007 * sway;
    const swayY = Math.sin(t.current * 0.45 + 1.3) * 0.005 * sway;
    const shake = rig.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    tmpPos.copy(rig.position);
    tmpPos.x += sx;
    tmpPos.y += sy;
    camera.position.copy(tmpPos);

    tmpTarget.copy(rig.target);
    const dist = tmpTarget.distanceTo(tmpPos);
    tmpTarget.x += swayX * dist;
    tmpTarget.y += swayY * dist;
    camera.up.set(Math.sin(rig.roll), Math.cos(rig.roll), 0);
    camera.lookAt(tmpTarget);

    if (Math.abs(camera.fov - rig.fov) > 0.01) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
