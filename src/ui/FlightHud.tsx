import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { exitFlight } from '../sequences/flight';
import { input } from '../scene/flight/controls';
import { DEATH_STAR_POSITION, FLIGHT, flight, forwardOf, onFlightToast, rightOf } from '../scene/flight/flightState';
import { useApp } from '../state/store';

/**
 * Flight-mode overlay: a one-line controls hint, the exit control, a faint compass tick
 * that points at the distant signal once the ship is far enough out, a quiet toast for
 * the discovery, and two-button touch controls on coarse pointers.
 */

const TOAST_MS = 4000;
const fwd = new Vector3();
const right = new Vector3();
const toTarget = new Vector3();

export function FlightHud() {
  const scene = useApp((s) => s.scene);
  const falconUnlocked = useApp((s) => s.falconUnlocked);
  const visible = scene === 'flight';
  const compassRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<HTMLElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let timer = 0;
    const off = onFlightToast((text) => {
      setToast(text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), TOAST_MS);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!visible) setToast(null);
  }, [visible]);

  // Compass: driven directly from the flight state, no React state per frame.
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = compassRef.current;
      const needle = tickRef.current;
      if (!el || !needle) return;
      const p = flight.position;
      const far = Math.hypot(p.x, p.z) > FLIGHT.compassMinRadius;
      const found = useApp.getState().deathStarFound;
      const show = far && !found;
      if (el.dataset.visible !== String(show)) el.dataset.visible = String(show);
      if (!show) return;
      forwardOf(flight.heading, fwd);
      rightOf(flight.heading, right);
      toTarget.copy(DEATH_STAR_POSITION).sub(p);
      const dist = toTarget.length();
      const bearing = Math.atan2(toTarget.dot(right), toTarget.dot(fwd));
      needle.style.transform = `rotate(${bearing.toFixed(3)}rad)`;
      // Slightly stronger as the signal gets closer.
      el.style.opacity = String(0.4 + 0.5 * Math.max(0, 1 - dist / 2600));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const hold = (channel: 'thrust' | 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      input[channel] = 1;
    },
    onPointerUp: () => {
      input[channel] = 0;
    },
    onPointerCancel: () => {
      input[channel] = 0;
    },
    onLostPointerCapture: () => {
      input[channel] = 0;
    },
  });

  return (
    <div className="flight-hud" data-visible={visible} aria-hidden={!visible}>
      <div className="flight-hud__top">
        <p className="flight-hud__hint t-mono">
          Flight mode
          <span className="flight-hud__keys"> - W A S D / arrows - Shift boost - Esc exit{falconUnlocked ? ' - T switch ship' : ''}</span>
        </p>
        <button type="button" className="pill flight-hud__exit" onClick={exitFlight} tabIndex={visible ? 0 : -1}>
          <span aria-hidden="true">←</span> Exit flight
        </button>
      </div>
      <div ref={compassRef} className="flight-compass" data-visible="false" aria-hidden="true">
        <i ref={tickRef} className="flight-compass__tick" />
      </div>
      <div className="flight-toast" data-visible={!!toast} role="status" aria-live="polite">
        {toast}
      </div>
      <div className="flight-touch" aria-label="Touch controls">
        <div className="flight-touch__turn">
          <button type="button" className="flight-touch__btn" aria-label="Turn left" tabIndex={-1} {...hold('left')}>
            <span aria-hidden="true">◀</span>
          </button>
          <button type="button" className="flight-touch__btn" aria-label="Turn right" tabIndex={-1} {...hold('right')}>
            <span aria-hidden="true">▶</span>
          </button>
        </div>
        <button type="button" className="flight-touch__btn flight-touch__thrust" aria-label="Thrust" tabIndex={-1} {...hold('thrust')}>
          <span aria-hidden="true">▲</span>
        </button>
      </div>
    </div>
  );
}
