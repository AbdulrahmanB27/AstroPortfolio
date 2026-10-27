import { useEffect, useState } from 'react';

/**
 * Copies a value, and says so.
 *
 * For the email address: a `mailto:` link only helps someone whose mail client is set up on
 * this machine, and a recruiter is as likely to be pasting the address into an applicant
 * tracker or a web mail tab. The confirmation is announced as well as shown, and where the
 * clipboard is unavailable (an insecure origin, a locked-down browser) it says the copy failed
 * rather than pretending it worked.
 */
export function CopyButton({ value, label, className = 'pill', tabIndex }: { value: string; label: string; className?: string; tabIndex?: number }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const id = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(id);
  }, [state]);

  const copy = () => {
    if (!navigator.clipboard) {
      setState('failed');
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };

  return (
    <button type="button" className={className} onClick={copy} aria-label={label} tabIndex={tabIndex} data-state={state}>
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
    </button>
  );
}
