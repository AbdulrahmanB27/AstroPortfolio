import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { HalfFloatType, Texture, WebGLRenderTarget, type Mesh, type Object3D } from 'three';
import { useApp } from '../../state/store';

/**
 * Which top-level groups are on in each place the camera can be. These decide how many
 * lights are in the scene, and a shader is compiled for an exact light count: the cabin's
 * fourteen point lights make every lit material in view a different program from the same
 * material on the surface, with three.
 */
const STATES: { name: string; show: string[]; hide: string[] }[] = [
  { name: 'cockpit', show: ['cockpit-anchor', 'surface-stage'], hide: ['rocket', 'home-planet', 'solar-system', 'probe'] },
  { name: 'system', show: ['home-planet', 'solar-system', 'probe'], hide: ['surface-stage', 'cockpit-anchor'] },
];

/**
 * Compiles the shaders, and uploads the textures, for the cockpit and the solar system while
 * the visitor is still on the surface.
 *
 * A shader is compiled the first time something is drawn with it, on the main thread, and
 * the first visit to the cabin needed six new programs at once, the orbit more: on a weak
 * GPU, or on Windows where the browser translates every shader to Direct3D, each can take
 * hundreds of milliseconds, all of it landing at the moment the camera arrives. Nothing about
 * what is drawn changes; the same programs are just built earlier, in the background where
 * the browser can (`KHR_parallel_shader_compile`), and found ready when they are needed.
 *
 * Each place is staged for the instant of the call: what it shows switched on and what it
 * does not lifted out, so the light count matches, and, when the frame goes through the bloom
 * composer, an offscreen target bound, because a frame drawn into the composer uses a
 * different variant (no tone mapping, linear output) from one drawn to the screen. Then
 * everything is put back exactly where it was. three gathers the lights and creates the
 * programs synchronously inside the call, so nothing is ever rendered in the staged state.
 */
export function Precompile() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const ready = useApp((s) => s.scene !== 'loading');
  const bloom = useApp((s) => s.quality.bloom);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Off the critical path: after the first frames have settled.
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const run = async () => {
      await wait(1200);
      for (const state of STATES) {
        if (cancelled) return;
        const shown: [Object3D, boolean][] = [];
        for (const name of state.show) {
          const o = scene.getObjectByName(name);
          if (o) shown.push([o, o.visible]);
          if (o) o.visible = true;
        }
        // Lifted out of the graph rather than hidden: three compiles every material in the
        // scene, visible or not, so a hidden solar system would still be compiled for the
        // cabin's lights — programs nothing would ever use.
        const lifted: [Object3D, Object3D, number][] = [];
        for (const name of state.hide) {
          const o = scene.getObjectByName(name);
          if (!o?.parent) continue;
          lifted.push([o, o.parent, o.parent.children.indexOf(o)]);
          o.parent.remove(o);
        }
        const previous = gl.getRenderTarget();
        const target = bloom ? new WebGLRenderTarget(1, 1, { type: HalfFloatType }) : null;
        gl.setRenderTarget(target);
        let done: Promise<unknown> = Promise.resolve();
        try {
          done = gl.compileAsync(scene, camera);
        } finally {
          gl.setRenderTarget(previous);
          for (const [o, parent, index] of lifted.reverse()) {
            parent.children.splice(index, 0, o);
            o.parent = parent;
          }
          for (const [o, v] of shown) o.visible = v;
        }
        await done.catch(() => {});
        target?.dispose();
        // The same for textures: the planets' maps upload on first sight otherwise.
        for (const name of state.show) {
          scene.getObjectByName(name)?.traverse((o) => {
            const material = (o as Mesh).material;
            for (const m of Array.isArray(material) ? material : material ? [material] : []) {
              for (const value of Object.values(m)) if (value instanceof Texture) gl.initTexture(value);
            }
          });
        }
        await wait(300);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [ready, bloom, gl, scene, camera]);

  return null;
}
