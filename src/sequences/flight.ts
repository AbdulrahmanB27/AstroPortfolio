import { Vector3 } from 'three';
import { portfolio } from '../data/loadPortfolio';
import { EASES } from '../lib/motion';
import { rig } from '../scene/rig';
import { systemPose } from '../scene/poses';
import { CHASE, chasePose, flight, spawnShip } from '../scene/flight/flightState';
import { resetInput } from '../scene/flight/controls';
import { useApp } from '../state/store';
import { setLabelsAlpha } from '../ui/labelState';
import { applyPose, begin, finish, reduced, tweenPose } from './index';

/**
 * Flight-mode entry/exit. Entry glides the camera from the system overview to a chase
 * position behind the freshly spawned ship; exit glides back to the exact system pose.
 * While a sequence runs, the flight loop leaves the rig alone (`busy`).
 */

const ENTER_DURATION = 1.2;
const EXIT_DURATION = 1.0;

const pose = { position: new Vector3(), target: new Vector3(), fov: 50 };

export function enterFlight(): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'system') return;
  app.unlockFlight();
  app.setHoveredProject(null);
  resetInput();
  spawnShip();
  chasePose(CHASE[app.flightShip], pose, 0);
  if (reduced()) {
    setLabelsAlpha(0);
    applyPose(pose);
    finish('flight', 0);
    return;
  }
  const tl = begin('flight');
  const labels = { value: 1 };
  tl.to(labels, { value: 0, duration: 0.3, onUpdate: () => setLabelsAlpha(labels.value) }, 0);
  tweenPose(tl, pose, ENTER_DURATION, EASES.glide, 0);
  tl.eventCallback('onComplete', () => finish('flight', 0));
}

export function exitFlight(): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'flight') return;
  resetInput();
  const target = systemPose(portfolio.layout.outerRadius);
  if (reduced()) {
    flight.active = false;
    setLabelsAlpha(1);
    applyPose(target);
    app.setSelectedProject(null);
    finish('system', 0.6);
    return;
  }
  const tl = begin('flight');
  const labels = { value: 0 };
  tweenPose(tl, target, EXIT_DURATION, EASES.approach, 0);
  tl.to(rig, { roll: 0, duration: EXIT_DURATION * 0.5 }, 0);
  tl.to(labels, { value: 1, duration: EXIT_DURATION * 0.5, onUpdate: () => setLabelsAlpha(labels.value) }, EXIT_DURATION * 0.5);
  tl.eventCallback('onComplete', () => {
    flight.active = false;
    setLabelsAlpha(1);
    useApp.getState().setSelectedProject(null);
    finish('system', 0.6);
  });
}

/** T while flying: swap hulls once the Falcon has been found. */
export function toggleFlightShip(): void {
  const app = useApp.getState();
  if (app.scene !== 'flight' || !app.falconUnlocked) return;
  app.setFlightShip(app.flightShip === 'falcon' ? 'rocket' : 'falcon');
}
