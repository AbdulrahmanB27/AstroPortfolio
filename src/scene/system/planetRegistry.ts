import { Vector3 } from 'three';

/** Latest world position of every planet, written each frame, read by labels/sequences. */
export const planetWorldPositions = new Map<string, Vector3>();
