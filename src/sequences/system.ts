import { Vector3 } from 'three';
import { portfolio } from '../data/loadPortfolio';
import { orbitPosition } from '../data/orbitLayout';
import { STAGE } from '../lib/constants';
import { DURATIONS, EASES } from '../lib/motion';
import { handles } from '../scene/rig';
import { homeApproachPose, homePose, projectPose, starApproachPose, systemPose } from '../scene/poses';
import { orbitClock } from '../scene/system/orbitClock';
import { setSystemDim, setSystemReveal } from '../scene/system/systemState';
import { setVehicleInterior } from '../scene/home/rocketState';
import { planetWorldPositions } from '../scene/system/planetRegistry';
import { useApp } from '../state/store';
import { setLabelsAlpha } from '../ui/labelState';
import { applyPose, begin, fadeBlackout, finish, reduced, tweenPose } from './index';
import { setProbeOpacity } from '../scene/project/probeState';
import { setStageOpacity } from '../scene/home/stageState';

/** Solar-system navigation: focus a planet, return to orbit, return home via the star. */

function planetPosition(id: string): Vector3 {
  const live = planetWorldPositions.get(id);
  if (live) return live.clone();
  const placement = portfolio.placementById.get(id);
  if (!placement) return new Vector3();
  const p = orbitPosition(placement, orbitClock.t, useApp.getState().settings.motion.orbitSpeedScale);
  return new Vector3(p[0], p[1], p[2]);
}

export function jumpToSystem(): void {
  handles.exposure?.setLevel(1);
  setStageOpacity(0);
  handles.cockpit?.setPower(0);
  setSystemReveal(1);
  setSystemDim(0);
  setProbeOpacity(0);
  setLabelsAlpha(1);
  applyPose(systemPose(portfolio.layout.outerRadius));
  useApp.getState().setSelectedProject(null);
  finish('system', 0.6);
}

/**
 * How wide the planet actually reads on screen. A ringed planet's rings run out to 2.3x its
 * body, so framing every project on the body alone let a ringed one spill past two frame
 * edges while a bare one floated in the middle of the same slot.
 */
function visualRadius(id: string): number {
  const placement = portfolio.placementById.get(id);
  const project = portfolio.projectById.get(id);
  if (!placement) return 1;
  return placement.planetRadius * (project?.planet.rings ? 1.75 : 1);
}

export function jumpToProject(id: string): void {
  const app = useApp.getState();
  const placement = portfolio.placementById.get(id);
  if (!placement) return jumpToSystem();
  setStageOpacity(0);
  handles.cockpit?.setPower(0);
  setSystemReveal(1);
  setSystemDim(1);
  handles.exposure?.setLevel(0);
  setLabelsAlpha(0);
  app.setSelectedProject(id);
  const pos = planetPosition(id);
  applyPose(projectPose(pos, visualRadius(id)));
  setProbeOpacity(1);
  finish('project', 0.15);
}

export function focusProject(id: string): void {
  const app = useApp.getState();
  if (app.busy) return;
  if (app.scene !== 'system' && app.scene !== 'project') return;
  const placement = portfolio.placementById.get(id);
  if (!placement) return;
  if (app.scene === 'project' && app.selectedProjectId === id) return;
  app.setSelectedProject(id);
  app.setHoveredProject(null);
  if (reduced()) {
    jumpToProject(id);
    return;
  }
  const tl = begin('focusingProject');
  const pos = planetPosition(id);
  const pose = projectPose(pos, visualRadius(id));
  const dim = { value: 0 };
  const probe = { value: 0 };
  const labels = { value: 1 };
  setProbeOpacity(0);
  const exposure = { value: 1 };
  const d = DURATIONS.focusProject;
  tweenPose(tl, pose, d, EASES.glide, 0);
  tl.to(labels, { value: 0, duration: d * 0.35, onUpdate: () => setLabelsAlpha(labels.value) }, 0);
  tl.to(dim, { value: 1, duration: d * 0.8, ease: 'power2.out', onUpdate: () => setSystemDim(dim.value) }, d * 0.1);
  tl.to(exposure, { value: 0, duration: d * 0.8, ease: 'power2.out', onUpdate: () => handles.exposure?.setLevel(exposure.value) }, d * 0.1);
  tl.to(probe, { value: 1, duration: d * 0.5, ease: 'power2.out', onUpdate: () => setProbeOpacity(probe.value) }, d * 0.55);
  tl.eventCallback('onComplete', () => finish('project', 0.15));
}

export function returnToOrbit(): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'project') return;
  if (reduced()) {
    jumpToSystem();
    return;
  }
  const tl = begin('returningToOrbit');
  const pose = systemPose(portfolio.layout.outerRadius);
  const dim = { value: 1 };
  const probe = { value: 1 };
  const labels = { value: 0 };
  const exposure = { value: 0 };
  const d = DURATIONS.returnToOrbit;
  tl.to(probe, { value: 0, duration: d * 0.4, onUpdate: () => setProbeOpacity(probe.value) }, 0);
  tweenPose(tl, pose, d, EASES.approach, 0);
  tl.to(dim, { value: 0, duration: d * 0.8, ease: 'power2.out', onUpdate: () => setSystemDim(dim.value) }, d * 0.2);
  tl.to(exposure, { value: 1, duration: d * 0.8, ease: 'power2.out', onUpdate: () => handles.exposure?.setLevel(exposure.value) }, d * 0.2);
  tl.to(labels, { value: 1, duration: d * 0.5, onUpdate: () => setLabelsAlpha(labels.value) }, d * 0.5);
  tl.eventCallback('onComplete', () => {
    app.setSelectedProject(null);
    finish('system', 0.6);
  });
}

/** Star click / Home button from orbit: glide inward, land on the home planet. */
export function returnHomeFromOrbit(): void {
  const app = useApp.getState();
  if (app.busy || app.scene !== 'system') return;
  if (reduced()) {
    setSystemReveal(0);
    setStageOpacity(1);
    setVehicleInterior(false);
    if (handles.rocket) handles.rocket.position.set(0, 0, 0);
    applyPose(homePose());
    finish('home');
    return;
  }
  const tl = begin('returningHome');
  handles.exposure?.setLevel(1);
  const d = DURATIONS.returnHome;
  const labels = { value: 1 };
  const stage = { value: 0 };
  const reveal = { value: 1 };
  setStageOpacity(0);
  setVehicleInterior(false);
  if (handles.rocket) {
    handles.rocket.position.set(0, 0, 0);
    handles.rocketEngine?.setThrust(0);
  }
  if (handles.astronaut) {
    handles.astronaut.position.set(STAGE.astronaut[0], STAGE.astronaut[1], STAGE.astronaut[2]);
    handles.astronaut.rotation.set(0, STAGE.astronautYaw, 0);
  }
  tl.to(labels, { value: 0, duration: 0.4, onUpdate: () => setLabelsAlpha(labels.value) }, 0);
  tweenPose(tl, starApproachPose(), d * 0.45, 'power2.inOut', 0);
  tweenPose(tl, homeApproachPose(), d * 0.35, 'power2.inOut', d * 0.4);
  tl.to(reveal, { value: 0, duration: d * 0.3, onUpdate: () => setSystemReveal(reveal.value) }, d * 0.45);
  tl.to(stage, { value: 1, duration: d * 0.25, onUpdate: () => setStageOpacity(stage.value) }, d * 0.55);
  tweenPose(tl, homePose(), d * 0.3, EASES.glide, d * 0.7);
  fadeBlackout(tl, 0.35, d * 0.15, d * 0.6);
  fadeBlackout(tl, 0, d * 0.2, d * 0.78);
  tl.eventCallback('onComplete', () => {
    setStageOpacity(1);
    finish('home');
  });
}
