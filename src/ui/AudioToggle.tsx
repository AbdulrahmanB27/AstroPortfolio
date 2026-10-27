import { useApp } from '../state/store';
import { isAudioSupported, toggleAudio } from '../audio/audio';

/**
 * Sound on/off. Off by default; the click is the user gesture that creates the
 * AudioContext (see `src/audio/audio.ts`). Hidden during the intro and while a sequence
 * owns the camera, and not rendered at all when the site setting turns audio off or the
 * browser has no WebAudio.
 */

const VISIBLE_IN = new Set(['home', 'cockpit', 'system', 'project']);

function Icon({ on }: { on: boolean }) {
  return (
    <svg className="audio-toggle__icon" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M2 5.2h2.4L7.6 2.6v8.8L4.4 8.8H2z" fill="currentColor" />
      {on ? (
        <>
          <path d="M9.6 5.1a2.6 2.6 0 0 1 0 3.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M11.3 3.4a5 5 0 0 1 0 7.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </>
      ) : (
        <path d="M9.4 5.4l3.2 3.2m0-3.2l-3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function AudioToggle() {
  const scene = useApp((s) => s.scene);
  const busy = useApp((s) => s.busy);
  const enabled = useApp((s) => s.audioEnabled);
  const siteEnabled = useApp((s) => s.settings.audio.enabled);
  const projectFull = useApp((s) => s.projectFull);
  if (!siteEnabled || !isAudioSupported()) return null;
  // Stood down while a project is full screen: the page covers its corner.
  const visible = VISIBLE_IN.has(scene) && !busy && !projectFull;
  return (
    <button
      type="button"
      className="pill audio-toggle"
      data-visible={visible}
      data-scene={scene}
      aria-pressed={enabled}
      // Icon only, everywhere: the speaker says what the control is, and its state is the
      // waves or the cross. The words stay for assistive tech and as the hover tooltip.
      aria-label={enabled ? 'Sound on' : 'Sound off'}
      title={enabled ? 'Sound on' : 'Sound off'}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={toggleAudio}
      data-label-obstacle
    >
      <Icon on={enabled} />
    </button>
  );
}
