import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { live, rig } from './rig';

const tmpTarget = new Vector3();
const tmpPos = new Vector3();

/**
 * Copies the mutable rig onto the real camera each frame, plus the launch's shake.
 * Sequences tween `rig` directly; nothing here re-renders React.
 *
 * At rest the camera is still. It used to drift in a slow figure-eight, and every thin edge
 * and highlight in the frame crawled across the pixels with it: the rocket's rings and the
 * suit's fittings looked as if their materials were moving.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    camera.near = 0.2;
    camera.far = 20000;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    live.camera = camera;
    live.scene = scene;
    live.gl = gl;
    return () => {
      delete live.camera;
      delete live.scene;
      delete live.gl;
    };
  }, [camera, scene, gl]);

  useFrame(() => {
    const shake = rig.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    tmpPos.copy(rig.position);
    tmpPos.x += sx;
    tmpPos.y += sy;
    camera.position.copy(tmpPos);

    tmpTarget.copy(rig.target);
    // The rig's up, with the launch's roll applied about the view axis. Reading a console
    // display needs the display's own up: square-on and centred is not enough, because a
    // surface whose up is not world up still renders rolled in the frame.
    camera.up.copy(rig.up).normalize();
    if (rig.roll) camera.up.applyAxisAngle(tmpTarget.clone().sub(tmpPos).normalize(), rig.roll);
    camera.lookAt(tmpTarget);

    if (Math.abs(camera.fov - rig.fov) > 0.01) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
