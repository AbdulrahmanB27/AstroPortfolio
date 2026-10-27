import { extend } from '@react-three/fiber';
import {
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  type Vector2,
} from 'three';
import { LOW_POLY, seg } from '../lib/lowPoly';

/*
 * The JSX geometries (`<sphereGeometry args={…} />` and the rest), rebuilt with fewer segments
 * for `?lowpoly`. Registering them under three's own names means no call site changes: R3F
 * looks the element up by name and gets these instead. Geometry built with `new` elsewhere
 * reads `seg` at its own call site.
 */
class LowSphere extends SphereGeometry {
  constructor(radius?: number, w = 32, h = 16, phiStart?: number, phiLength?: number, thetaStart?: number, thetaLength?: number) {
    super(radius, seg(w, 7), seg(h, 5), phiStart, phiLength, thetaStart, thetaLength);
  }
}
class LowCylinder extends CylinderGeometry {
  constructor(top?: number, bottom?: number, height?: number, radial = 32, heightSegs?: number, open?: boolean, thetaStart?: number, thetaLength?: number) {
    super(top, bottom, height, seg(radial, 6), heightSegs, open, thetaStart, thetaLength);
  }
}
class LowCone extends ConeGeometry {
  constructor(radius?: number, height?: number, radial = 32, heightSegs?: number, open?: boolean, thetaStart?: number, thetaLength?: number) {
    super(radius, height, seg(radial, 6), heightSegs, open, thetaStart, thetaLength);
  }
}
class LowCapsule extends CapsuleGeometry {
  constructor(radius?: number, length?: number, cap = 4, radial = 8, heightSegs?: number) {
    super(radius, length, seg(cap, 2), seg(radial, 6), heightSegs);
  }
}
class LowTorus extends TorusGeometry {
  constructor(radius?: number, tube?: number, radial = 12, tubular = 48, arc?: number) {
    super(radius, tube, seg(radial, 4), seg(tubular, 8), arc);
  }
}
class LowCircle extends CircleGeometry {
  constructor(radius?: number, segments = 32, thetaStart?: number, thetaLength?: number) {
    super(radius, seg(segments, 6), thetaStart, thetaLength);
  }
}
class LowRing extends RingGeometry {
  constructor(inner?: number, outer?: number, theta = 32, phi?: number, thetaStart?: number, thetaLength?: number) {
    super(inner, outer, seg(theta, 8), phi, thetaStart, thetaLength);
  }
}
class LowLathe extends LatheGeometry {
  constructor(points?: Vector2[], segments = 12, phiStart?: number, phiLength?: number) {
    super(points, seg(segments, 6), phiStart, phiLength);
  }
}

let installed = false;

/**
 * Swap in the low-poly geometry, once. Has to run after the Canvas has registered three's own
 * classes (it does that on its first render) and before the scene creates its first mesh, so
 * the scene root calls it at the top of its own first render.
 */
export function installLowPolyCatalogue(): void {
  if (!LOW_POLY || installed) return;
  installed = true;
  extend({
    SphereGeometry: LowSphere,
    CylinderGeometry: LowCylinder,
    ConeGeometry: LowCone,
    CapsuleGeometry: LowCapsule,
    TorusGeometry: LowTorus,
    CircleGeometry: LowCircle,
    RingGeometry: LowRing,
    LatheGeometry: LowLathe,
  });
}
