import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group, Vector3 } from 'three';
import { portfolio } from '../../data/loadPortfolio';
import { WORLD } from '../../lib/constants';
import { enterFlight, exitFlight, toggleFlightShip } from '../../sequences/flight';
import { useApp } from '../../state/store';
import { handles, rig } from '../rig';
import { planetWorldPositions } from '../system/planetRegistry';
import { DeathStar } from './DeathStar';
import { Falcon } from './Falcon';
import { Ship } from './Ship';
import { input, installFlightControls, installPilotHotkey, resetInput } from './controls';
import { CHASE, DEATH_STAR_POSITION, FLIGHT, chasePose, emitFlightToast, flight, wrapAngle, type ChaseParams, type ChasePose, headingToward } from './flightState';
import { stepFlight, type Obstacle } from './physics';

/** Dev-mode hook (see `installDevModeHotkey`): exposed as `handles.flight`. */
export interface FlightHandle {
  teleport: (x: number, z: number, aimAt?: [number, number]) => void;
  getPosition: () => [number, number, number];
  /** Yaw in radians (forward = (-sin, 0, -cos)). */
  getHeading: () => number;
  readonly ship: string;
}

const DISCOVERY_TOAST = 'Signal acquired - Falcon unlocked. Press T to switch ships.';

/**
 * Flight-mode easter egg: the player ship, its physics and chase camera, and the Death
 * Star. Everything mounts only while `scene === 'flight'`; the "pilot" trigger listens
 * only while the system is being browsed.
 */
export function FlightMode() {
  const scene = useApp((s) => s.scene);
  const ship = useApp((s) => s.flightShip);
  const active = scene === 'flight';
  const groupRef = useRef<Group>(null);
  const obstacles = useMemo<Obstacle[]>(() => [], []);
  const chase = useMemo<ChasePose>(() => ({ position: new Vector3(), target: new Vector3(), fov: 50 }), []);
  /** Current camera offsets; eased toward the active hull's numbers when T swaps ships. */
  const params = useMemo<ChaseParams>(() => ({ ...CHASE.rocket }), []);

  // Activation: only while browsing the solar system.
  useEffect(() => {
    if (scene !== 'system') return;
    return installPilotHotkey(enterFlight);
  }, [scene]);

  // Movement keys: only while flying.
  useEffect(() => {
    if (!active) return;
    const uninstall = installFlightControls({ onExit: exitFlight, onToggleShip: toggleFlightShip });
    return () => {
      uninstall();
      resetInput();
    };
  }, [active]);

  // Dev hook + the ship group handle.
  useEffect(() => {
    handles.flight = {
      teleport: (x: number, z: number, aimAt?: [number, number]) => {
        flight.position.set(x, FLIGHT.altitude, z);
        flight.velocity.set(0, 0, 0);
        flight.yawVel = 0;
        // Optional aim so automated checks can frame a target the way a player would.
        if (aimAt) flight.heading = headingToward(aimAt[0] - x, aimAt[1] - z);
        flight.camYaw = flight.heading;
        if (useApp.getState().scene === 'flight' && !useApp.getState().busy) {
          chasePose(params, chase, 0);
          rig.position.copy(chase.position);
          rig.target.copy(chase.target);
        }
      },
      getPosition: () => [flight.position.x, flight.position.y, flight.position.z],
      getHeading: () => flight.heading,
      get ship() {
        return useApp.getState().flightShip;
      },
    };
    return () => {
      delete handles.flight;
    };
  }, [chase, params]);

  useEffect(() => {
    if (!active || !groupRef.current) return;
    handles.flightShip = groupRef.current;
    return () => {
      delete handles.flightShip;
    };
  }, [active]);

  useFrame((_, delta) => {
    if (!active) return;
    const app = useApp.getState();
    const g = groupRef.current;
    const want = CHASE[app.flightShip];
    if (app.busy) {
      // A sequence owns the rig (enter/exit glide); keep the offsets in sync for the hand-off.
      Object.assign(params, want);
    } else {
      const dt = Math.min(0.05, delta);
      collectObstacles(obstacles);
      stepFlight(dt, input, obstacles);

      // Chase camera: rigid to the hull, yaw eased so turns swing the view gently.
      flight.camYaw += wrapAngle(flight.heading - flight.camYaw) * (1 - Math.exp(-dt * 7));
      const kb = 1 - Math.exp(-dt * 5);
      params.back += (want.back - params.back) * kb;
      params.up += (want.up - params.up) * kb;
      params.ahead += (want.ahead - params.ahead) * kb;
      params.aheadUp += (want.aheadUp - params.aheadUp) * kb;
      chasePose(params, chase, flight.speedFactor, !app.reducedMotion);
      rig.position.copy(chase.position);
      rig.target.copy(chase.target);
      rig.fov += (chase.fov - rig.fov) * (1 - Math.exp(-dt * 6));
      rig.roll = 0;

      if (!app.deathStarFound && flight.position.distanceTo(DEATH_STAR_POSITION) < FLIGHT.discoveryRadius) {
        app.setDeathStarFound(true);
        app.unlockFalcon();
        app.setFlightShip('falcon');
        emitFlightToast(DISCOVERY_TOAST);
      }
    }
    if (g) {
      g.position.copy(flight.position);
      g.rotation.set(flight.pitch, flight.heading, flight.bank);
    }
  });

  if (!active) return null;
  return (
    <group name="flight-mode">
      <group ref={groupRef} name="flight-ship" rotation-order="YXZ">
        {ship === 'falcon' ? <Falcon /> : <Ship />}
      </group>
      <DeathStar />
    </group>
  );
}

/** Keep-out discs for the star, the home planet, every project planet and the station. */
function collectObstacles(out: Obstacle[]): void {
  out.length = 0;
  out.push({ x: 0, z: 0, radius: WORLD.starRadius + 45 });
  out.push({ x: WORLD.homeRingRadius, z: 0, radius: WORLD.homePlanetRadius + 10 });
  for (const project of portfolio.data.projects) {
    const pos = planetWorldPositions.get(project.id);
    const placement = portfolio.placementById.get(project.id);
    if (!pos || !placement) continue;
    const r = placement.planetRadius * (project.planet.rings ? 2.3 : 1.15) + 8;
    out.push({ x: pos.x, z: pos.z, radius: r });
  }
  out.push({ x: DEATH_STAR_POSITION.x, z: DEATH_STAR_POSITION.z, radius: WORLD.deathStarRadius + 26 });
}
