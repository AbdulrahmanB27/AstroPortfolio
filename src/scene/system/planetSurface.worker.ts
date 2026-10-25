import { generatePlanetSurface, type SurfaceRequest } from './planetSurface';

/**
 * Builds planet surfaces off the main thread. A surface is ~130k samples of layered noise;
 * seven of them on the main thread was most of a second of frozen intro on a laptop.
 */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SurfaceRequest & { id: number }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { id, ...request } = e.data;
  const surface = generatePlanetSurface(request);
  const transfer = [surface.map, surface.bump, surface.roughness, surface.emissive, surface.clouds]
    .filter((a): a is Uint8Array => !!a)
    .map((a) => a.buffer as ArrayBuffer);
  scope.postMessage({ id, surface }, transfer);
};
