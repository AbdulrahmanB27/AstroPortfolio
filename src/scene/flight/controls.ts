/**
 * Keyboard/touch input for flight mode. Listeners are installed only for the states that
 * need them (the "pilot" trigger while browsing the system, the movement keys while
 * flying) and removed again, so nothing here can fire during normal browsing.
 */

export interface FlightInput {
  thrust: number;
  brake: number;
  left: number;
  right: number;
  boost: number;
}

/** Current input, 0 or 1 per channel; the physics step reads it every frame. */
export const input: FlightInput = { thrust: 0, brake: 0, left: 0, right: 0, boost: 0 };

export function resetInput(): void {
  input.thrust = 0;
  input.brake = 0;
  input.left = 0;
  input.right = 0;
  input.boost = 0;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

type Channel = keyof FlightInput;

function channelFor(e: KeyboardEvent): Channel | null {
  switch (e.code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'thrust';
    case 'KeyS':
    case 'ArrowDown':
      return 'brake';
    case 'KeyA':
    case 'ArrowLeft':
      return 'left';
    case 'KeyD':
    case 'ArrowRight':
      return 'right';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'boost';
    default:
      break;
  }
  // Fallback for layouts where `code` is unavailable.
  switch (e.key) {
    case 'w':
    case 'W':
      return 'thrust';
    case 's':
    case 'S':
      return 'brake';
    case 'a':
    case 'A':
      return 'left';
    case 'd':
    case 'D':
      return 'right';
    case 'Shift':
      return 'boost';
    default:
      return null;
  }
}

export interface FlightControlHandlers {
  onExit: () => void;
  onToggleShip: () => void;
}

/** Movement keys + Escape/T. Returns the uninstaller. */
export function installFlightControls(handlers: FlightControlHandlers): () => void {
  const onDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'Escape') {
      handlers.onExit();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'KeyT' || e.key === 't' || e.key === 'T') {
      if (!e.repeat) handlers.onToggleShip();
      return;
    }
    const ch = channelFor(e);
    if (!ch) return;
    input[ch] = 1;
    e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => {
    const ch = channelFor(e);
    if (ch) input[ch] = 0;
  };
  const onBlur = () => resetInput();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
    resetInput();
  };
}

export const PILOT_WORD = 'pilot';
export const PILOT_WINDOW_MS = 3000;

/** True when the tail of `typed` (letters within the time window) spells the word. */
export function endsWithWord(typed: { key: string; at: number }[], word: string, now: number, windowMs: number): boolean {
  const recent = typed.filter((t) => now - t.at <= windowMs);
  if (recent.length < word.length) return false;
  const tail = recent
    .slice(-word.length)
    .map((t) => t.key)
    .join('');
  return tail === word;
}

/**
 * Watches for the letters p-i-l-o-t typed in sequence (any speed, within 3 s). Plain
 * letters only: modifier combos and text inputs are ignored.
 */
export function installPilotHotkey(onMatch: () => void): () => void {
  const typed: { key: string; at: number }[] = [];
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTypingTarget(e.target)) return;
    if (e.key.length !== 1) return;
    const now = performance.now();
    typed.push({ key: e.key.toLowerCase(), at: now });
    while (typed.length > PILOT_WORD.length) typed.shift();
    if (endsWithWord(typed, PILOT_WORD, now, PILOT_WINDOW_MS)) {
      typed.length = 0;
      onMatch();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
