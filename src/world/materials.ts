import * as THREE from 'three'
import { VNOISE } from './glsl'

/**
 * Regolith / rock: albedo and baked AO come from vertex colours; this adds procedural grain and a
 * fine bump so close ground never looks like a smooth gradient. Distance-faded to avoid shimmer.
 */
export function makeRegolith(opts: { bump?: number; grain?: number; roughness?: number } = {}) {
  const { bump = 0.02, grain = 1, roughness = 0.95 } = opts
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBump = { value: bump }
    shader.uniforms.uGrain = { value: grain }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform float uBump; uniform float uGrain;
${VNOISE}
float regoH(vec3 p){ return vfbm(p * 1.1) * 0.62 + vfbm(p * 4.2 + 7.0) * 0.38; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float g1 = vfbm(vWPos * 0.9 + 3.0);
  float g2 = vnoise(vWPos * 9.0);
  float g3 = vnoise(vWPos * 46.0);
  float gf = smoothstep(40.0, 6.0, length(vViewPosition));
  diffuseColor.rgb *= 1.0 + uGrain * (0.28 * (g1 - 0.5) + gf * (0.16 * (g2 - 0.5) + 0.1 * (g3 - 0.5)));
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float dist = length(vViewPosition);
  float fade = smoothstep(30.0, 2.0, dist);
  if (fade > 0.001) {
    float h = regoH(vWPos);
    vec2 dH = vec2(dFdx(h), dFdy(h)) * uBump * fade;
    vec3 sx = dFdx(-vViewPosition); vec3 sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal); vec3 r2 = cross(normal, sx);
    float det = dot(sx, r1) * faceDirection;
    vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
    normal = normalize(abs(det) * normal - grad);
  }
}`,
      )
  }
  m.customProgramCacheKey = () => `regolith-${bump}-${grain}`
  return m
}

/** Per-material tuning applied to every Blender-exported prop so all assets share one look. */
export function tuneProp(root: THREE.Object3D, opts: { shadows?: boolean; env?: number } = {}) {
  const { shadows = true, env = 0.55 } = opts
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial
      if (!m.isMeshStandardMaterial) continue
      m.envMapIntensity = env
      switch (m.name) {
        case 'Visor':
          m.envMapIntensity = 1.6
          m.roughness = 0.12
          break
        case 'Glazing':
          m.envMapIntensity = 1.4
          break
        case 'LegMetal':
        case 'DarkMetal':
          m.envMapIntensity = 0.9
          break
        case 'AmberLight':
        case 'WhiteLight':
        case 'ThrusterGlow':
        case 'StationLights':
          m.toneMapped = false
          break
      }
    }
  })
  return root
}

/** Find a material by name anywhere under root. */
export function findMaterial(root: THREE.Object3D, name: string): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || found) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) if (m.name === name) found = m as THREE.MeshStandardMaterial
  })
  return found
}
