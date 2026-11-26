import './draco'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { fx } from './rig'
import { tuneProp } from './materials'
import { probeState } from '../state/director'
import { updateScreen } from '../ui/screenAnchor'
import { app } from '../state/store'

const URL = `${import.meta.env.BASE_URL}models/probe.glb`
useGLTF.preload(URL)

/** Survey probe that carries the project display. It deploys beside the focused planet, facing the camera. */
export function ProbeSet() {
  const gltf = useGLTF(URL)
  const root = useRef<THREE.Group>(null)
  const size = useThree((s) => s.size)
  const parts = useMemo(() => {
    tuneProp(gltf.scene, { shadows: false, env: 0.9 })
    const screen = gltf.scene.getObjectByName('Screen') as THREE.Mesh | undefined
    if (screen) {
      const m = new THREE.MeshStandardMaterial({ color: '#07090c', roughness: 0.32, metalness: 0.1, emissive: '#0c0f14', emissiveIntensity: 0.6 })
      screen.material = m
    }
    return {
      screen,
      dish: gltf.scene.getObjectByName('Dish'),
      wingL: gltf.scene.getObjectByName('WingL'),
      wingR: gltf.scene.getObjectByName('WingR'),
    }
  }, [gltf])
  const dishHome = useMemo(() => parts.dish?.position.clone() ?? new THREE.Vector3(), [parts])
  // anchor for the DOM panel: an empty at the screen centre whose local XY spans the display
  const anchor = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    gltf.scene.add(anchor)
    return () => {
      gltf.scene.remove(anchor)
    }
  }, [gltf, anchor])

  useFrame(({ camera }) => {
    const g = root.current
    if (!g) return
    const k = fx.probe
    g.visible = k > 0.002 && probeState.valid
    if (!g.visible) return
    const ease = k * k * (3 - 2 * k)
    g.position.copy(probeState.pos)
    g.quaternion.copy(probeState.quat)
    // slides in from just off the free side while unfolding
    g.scale.setScalar(probeState.scale * (0.86 + 0.14 * ease))
    g.translateX((1 - ease) * probeState.scale * 2.4)
    // the wing on the planet's side stays folded back so it never covers the planet
    const portrait = size.width / size.height < 0.8
    const upright = probeState.upright
    if (parts.wingL) parts.wingL.rotation.y = 1.5 - (upright ? 0 : 0.08) * ease
    if (parts.wingR) parts.wingR.rotation.y = -(1.5 - (upright ? 0.3 : portrait ? 0.3 : 0.7) * ease)
    if (parts.wingR) parts.wingR.visible = !upright
    if (parts.dish) {
      const sway = Math.sin(fx.time * 0.25) * 0.35
      if (upright) {
        // the display stands on end: the dish moves to what is now the top edge, mast pointing up the screen
        parts.dish.position.set(2.2, 0.55, dishHome.z)
        parts.dish.rotation.set(sway, 0, -Math.PI / 2)
      } else {
        parts.dish.position.copy(dishHome)
        parts.dish.rotation.set(0, sway, 0)
      }
    }
    const st = app()
    if (st.mode === 'project' && !st.busy) updateScreen('probe', anchor, camera as THREE.PerspectiveCamera, size.width, size.height, 1.6, 1.0, 0.035, portrait ? 8 : -1, portrait ? fx.read : 0)
  })

  return (
    <group ref={root} visible={false}>
      <primitive object={gltf.scene} />
    </group>
  )
}
