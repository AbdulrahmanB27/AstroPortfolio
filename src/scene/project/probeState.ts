/**
 * Fade level of the orbital probe, held at module scope.
 *
 * The probe is how a project presents itself — the spec's project display device — so it
 * must be on screen whenever a project is open, including when someone follows a shared
 * `#/projects/<id>` link. That path runs during boot, and it was writing through
 * `handles.probe`, which does not exist until the component mounts. Whether the probe
 * appeared came down to which won the race, so a shared project link sometimes opened with
 * the planet alone and no probe at all.
 *
 * Same reason `systemView` and `vehicleView` live at module scope: sequences run before the
 * scene exists, so the scene reads the value every frame rather than being told once.
 */
export const probeView = { opacity: 0 };

export function setProbeOpacity(value: number): void {
  probeView.opacity = Math.max(0, Math.min(1, value));
}
