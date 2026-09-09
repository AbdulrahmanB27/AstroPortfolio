/**
 * Shared orbital time. Advances only while the system is being browsed so a focused
 * planet stays put under its probe display and labels stay stable.
 */
export const orbitClock = { t: 0, running: true };
