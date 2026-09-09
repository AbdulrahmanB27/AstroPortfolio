/** Content entries the owner still needs to write start with "PLACEHOLDER:". */
export function isPlaceholder(text: string): boolean {
  return /^\s*placeholder\s*:/i.test(text);
}

export function stripPlaceholder(text: string): string {
  return text.replace(/^\s*placeholder\s*:\s*/i, '');
}
