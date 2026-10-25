/** Content entries the owner still needs to write start with "PLACEHOLDER:". */
export function isPlaceholder(text: string): boolean {
  return /^\s*placeholder\s*:/i.test(text);
}

export function stripPlaceholder(text: string): string {
  return text.replace(/^\s*placeholder\s*:\s*/i, '');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * "2026-09" → "September 2026". The content file stores a sortable stamp; a visitor reading
 * "UPDATED 2026-09" has to parse it. Anything that is not a year-month passes through as-is.
 */
export function formatMonth(stamp: string): string {
  const m = stamp.trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${m[1]}` : stamp.trim();
}
