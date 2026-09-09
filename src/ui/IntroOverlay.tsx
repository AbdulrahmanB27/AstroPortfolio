import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { skipIntro, skipSequence } from '../sequences';

/** Skip control + click/key-to-skip during the opening cinematic, and a skip for the
 * launch and the glide home. */
export function IntroOverlay() {
  const scene = useApp((s) => s.scene);
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    if (scene !== 'intro') {
      setShowSkip(false);
      return;
    }
    const t = window.setTimeout(() => setShowSkip(true), 900);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skipIntro();
    };
    const onPointer = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      skipIntro();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [scene]);

  if (scene === 'launching' || scene === 'returningHome') {
    return (
      <button type="button" className="intro-skip" data-visible="true" onClick={skipSequence}>
        Skip
      </button>
    );
  }
  if (scene !== 'intro') return null;
  return (
    <button type="button" className="intro-skip" data-visible={showSkip} onClick={skipIntro}>
      Skip intro
    </button>
  );
}
