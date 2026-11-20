import gsap from 'gsap'

/**
 * Smoothly move the Three.js camera to a target position + lookAt.
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} targetPos
 * @param {THREE.Vector3} lookAt
 * @param {number} duration
 * @param {Function} onComplete
 */
export function flyCamera(camera, targetPos, lookAt, duration = 2.5, ease = 'power2.inOut', onComplete) {
  const tl = gsap.timeline({ onComplete })

  tl.to(
    camera.position,
    {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration,
      ease,
      onUpdate: () => {
        if (lookAt) camera.lookAt(lookAt)
      },
    },
    0
  )

  return tl
}

/**
 * Animate camera lookAt to a new target (no position change).
 */
export function pivotCamera(camera, lookAt, duration = 1.5, onComplete) {
  const startLook = { x: 0, y: 0, z: 0 }
  gsap.to(startLook, {
    x: lookAt.x,
    y: lookAt.y,
    z: lookAt.z,
    duration,
    ease: 'power2.out',
    onUpdate: () => camera.lookAt(startLook.x, startLook.y, startLook.z),
    onComplete,
  })
}
