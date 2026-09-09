/**
 * Which side of the rocket's hull the camera is on, held at module scope.
 *
 * The exterior hull and the cabin interior must never be drawn at the same time. The cabin
 * is deliberately wider than the hull (CABIN_R 1.95 against a hull radius of 1), so while
 * both were visible the cabin's back faces enclosed the rocket and the whole flight to the
 * hatch rendered as an unlit interior instead of a spacecraft. And with the cabin hidden
 * but the hull shown, the cockpit camera — which sits just outside the skin — stared at
 * the hull and the forward window showed nothing.
 *
 * This deliberately does NOT go through `handles`: a deep link to `#/about` places the
 * camera in the cockpit during boot, before either component has mounted and registered,
 * so the write was silently dropped. Both components read it every frame instead. Same
 * reason `systemView` lives at module scope.
 */
export const vehicleView = {
  /** true = camera is inside the cabin; false = outside, looking at the hull. */
  interior: false,
};

export function setVehicleInterior(interior: boolean): void {
  vehicleView.interior = interior;
}
