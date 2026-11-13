import { addAfterEffect, invalidate } from '@react-three/fiber';
import gsap from 'gsap';
import { live } from './rig';

/**
 * A dissolve between two camera setups that cannot be flown between: the outside of the
 * rocket and the cabin inside it.
 *
 * These cuts used to dip to black — a few frames to black, the switch, a few frames back —
 * which on screen read as the page flashing, and if the first frame inside was slow (a shader,
 * the shadow map, the displays' markup) the black simply lasted longer. Now the last frame
 * outside is held on screen, the switch happens underneath it, and only once the new view has
 * been drawn twice does the held frame dissolve away. Whatever the switch costs is paid while
 * the visitor is still looking at a finished picture.
 *
 * The frame is copied straight after R3F draws it (an after-effect), while the canvas's
 * drawing buffer still holds it, so the canvas never needs `preserveDrawingBuffer`.
 */

type Job = { change: () => void; duration: number; stage: 'capture' | 'settle'; frames: number };

let job: Job | null = null;
let installed = false;

const overlay = (): HTMLCanvasElement | null =>
  typeof document === 'undefined' ? null : (document.getElementById('crossfade') as HTMLCanvasElement | null);

function install(): void {
  if (installed) return;
  installed = true;
  addAfterEffect(() => {
    if (!job) return;
    const el = overlay();
    if (job.stage === 'capture') {
      const src = live.gl?.domElement;
      if (el && src) {
        if (el.width !== src.width || el.height !== src.height) {
          el.width = src.width;
          el.height = src.height;
        }
        el.getContext('2d')?.drawImage(src, 0, 0);
        gsap.killTweensOf(el);
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      }
      job.stage = 'settle';
      job.change();
      invalidate();
      return;
    }
    // Two frames of the new view drawn under the held one before it starts to go. Asked for
    // explicitly, so the dissolve cannot stall while the loop is only drawing on demand.
    if (++job.frames < 2) {
      invalidate();
      return;
    }
    const { duration } = job;
    job = null;
    if (!el) return;
    gsap.to(el, {
      opacity: 0,
      duration,
      ease: 'power2.out',
      onComplete: () => {
        el.style.visibility = 'hidden';
        // Let go of a full-screen bitmap nobody is looking at.
        el.width = 1;
        el.height = 1;
      },
    });
  });
}

/**
 * Hold the current frame, run `change` under it on the next frame, then dissolve to the new
 * view over `duration` seconds.
 */
export function crossfade(change: () => void, duration = 0.6): void {
  install();
  // One already waiting: let it land rather than drop its change.
  if (job?.stage === 'capture') job.change();
  job = { change, duration, stage: 'capture', frames: 0 };
  invalidate();
}
